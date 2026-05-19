---
vendor: "@anthropic-ai/claude-code"
sdkVersion: "CLI 2.x (current installed; check exact via `claude --version`)"
firstWritten: 2026-05-18
lastVerified: 2026-05-18
relatedPaths:
  - assets/hooks/pre_tool_use.mjs
  - assets/hooks/post_tool_use.mjs
  - assets/hooks/session_start.mjs
  - src/main/hooks.ts
  - src/main/hooks/**
  - src/main/hooksDiffReview.ts
  - src/renderer/hooks/useClaudeSessionCapture.ts
notes: "Hook script stdin schema gotchas, session-event timing, IDE↔CLI namespace boundaries."
---

# Claude Code (`@anthropic-ai/claude-code`) — vendor gotchas

## Hook stdin schema (PreToolUse / PostToolUse / SessionStart)

### Symptom — `payload.cwd` is `undefined` when reading from hook stdin

**Why:** Claude Code's hook stdin JSON for `PreToolUse` / `PostToolUse` events does NOT include a top-level `cwd` field. Training data and external documentation suggest otherwise; the actual current CLI schema omits it. Hook scripts must derive cwd from their own runtime (e.g., `process.cwd()` of the hook process, which runs in Claude's working directory).

**Fix:** In `pre_tool_use.mjs` / `post_tool_use.mjs` / `session_start.mjs`, explicitly add `cwd: process.cwd()` to the payload built by the hook script before sending over the named pipe / IPC channel. Do not assume `payload.cwd` exists when consuming.

**Source:** Wave 94 Phase E Bug A. Surfaced after a "fix" (`3970d6be`) that did `payload.cwd ?? sessionCwdMap.get(payload.sessionId)` — both sides resolved `undefined`. Confirmed by instrumented main-process log showing `payloadCwd: undefined` on every event. Repo lesson: `assets/hooks/pre_tool_use.mjs` lines 41–48 build the payload — `cwd` was absent until Wave 94.

---

### Symptom — `correlationId` mismatch between PreToolUse and PostToolUse for the same tool call

**Why:** If the IDE generates its own correlation ID (e.g., `crypto.randomUUID()`) inside the hook script on each invocation, pre and post will get DIFFERENT IDs for the same tool call. Snapshot-then-diff patterns fail because the post-hook can't find the pre-hook's stash entry; stash grows unbounded.

**Fix:** Source the correlation ID from Claude Code's stable `tool_use_id` field, which IS present in both PreToolUse and PostToolUse stdin payloads and is identical for the matching pair. In the IDE's hook script, set `payload.toolCallId = toolData.tool_use_id` (or whatever field your downstream consumer reads). Add a defensive fallback (e.g., `requestId` with a warn log) for older CLI versions or absent values.

**Source:** Wave 94 Phase E Bug C. Symptom from instrumented main-process trace: `handlePreToolUse entry { correlationId: 'X' } → stash[sessionId:X] set` followed by `handlePostToolUse entry { correlationId: 'Y' } → no stash entry for key sessionId:Y, stashKeys: [sessionId:X]`. Stash grew 1 entry per tool call, never claimed. Verified against current Claude Code hook docs that `tool_use_id` is the stable pairing key.

---

### Symptom — Snapshot stash grows unbounded

**Why:** Even with correct correlation IDs, edge cases (dropped post-hooks, IDE restart mid-tool-call) can leak stash entries. Without a bound, the stash is a memory leak.

**Fix:** Cap stash entries (project picked 100, oldest-first eviction in `evictStaleEntries` alongside the existing 60s TTL). Pattern lives in `src/main/hooksDiffReview.ts`.

**Source:** Wave 94 Phase E Bug C defensive measure.

---

## Session event timing

### Symptom — Terminal-launched `claude` doesn't reliably emit `session_start` BEFORE the first `pre_tool_use`

**Why:** When `claude` is launched inside a terminal (as opposed to spawned via the IDE's own session-spawn flow), the timing of `session_start` is non-deterministic relative to the first user prompt → tool use. The session_start event may arrive after the first edit, or not be captured by a renderer subscriber that opens DevTools post-launch.

**Fix:** Don't gate consumer binding heuristics on `session_start` exclusively. In the renderer, extend the binding trigger set to include ANY recognised hook event type (e.g., `session_start`, `pre_tool_use`, `post_tool_use`, `user_prompt_submit`, `instructions_loaded`). The first incoming event from an unknown sessionId triggers the bind; subsequent same-UUID events are idempotent (bind-once-per-UUID, not bind-once-per-anchor-event).

**Source:** Wave 94 Phase E Bug B. Symptom from trace: zero `session_start` lines for the new Claude UUID, but `pre_tool_use` / `post_tool_use` arrived correctly. Heuristic only listening on `session_start` never bound, so owned-set filter rejected every event.

---

### Symptom — Multiple concurrent `claude` sessions in different terminals; only the FIRST UUID gets bound to its terminal, later ones are filtered out

**Why:** A bind-once-per-terminal heuristic (`if (terminal.claudeSessionId) skip`) freezes the first UUID a terminal sees. When the user closes that claude and runs a new one in the same terminal, the new UUID gets `SKIP` because the terminal is "already bound." Same problem when launching across multiple terminals — only the first claude wins binding.

**Fix:** Bind-once-per-UUID, not bind-once-per-terminal. When a new event arrives with a sessionId DIFFERENT from the terminal's current binding, replace the binding. Same-UUID events are no-ops. The terminal's binding follows the currently-active claude in that terminal — which is what last sent a hook event from that context.

**Source:** Wave 94 Phase E Bug D. Symptom from trace: `terminal-fallback bind { existingId: 'b887...', claudeSessionId: '9be6...', decision: 'SKIP' }` for every event from the new claude.

---

## Namespace boundaries

### Symptom — `sessionCwdMap.get(payload.sessionId)` returns undefined for terminal-launched claude even though the map has entries

**Why:** Two different ID namespaces in play:
- The IDE's internal PTY session ID (`term-1779144157045-en35t` format)
- Claude Code's session UUID (RFC 4122 format)

Maps keyed by PTY session ID will never resolve a Claude UUID lookup. The IDE's `sessionCwdMap` (populated when the IDE spawns sessions via `spawnClaudeSession`) is keyed by PTY ID. Terminal-launched claude has no entry in that map — its sessionId is its own Claude UUID with no IDE-side mapping.

**Fix:** When the same data exists on the payload itself (e.g., `payload.cwd` after Wave 94 Phase E), prefer that. Don't try to bridge namespaces unless you have explicit correlation data.

**Source:** Wave 94 Phase E Bug A root cause.

---

## Workspace pathSecurity vs. terminal claude

### Symptom — Diff-review (or any per-project IDE feature) fails with "outside the workspace and cannot be accessed" when terminal claude edits files in a project the IDE wasn't launched against

**Why:** IDE features that go through workspace-validated IPC handlers (e.g., `git:diffReview` registered via `buildSecureRegister`) reject paths outside the window's registered workspace roots. Terminal-launched claude can run in ANY project's cwd; its edits won't be in the IDE's workspace roots.

**Fix:** For features explicitly designed to handle cross-project terminal claude, extract the IPC handler out of the security wrapper. Don't disable pathSecurity globally — scope the bypass to the specific channel. Pattern: `registerDiffReviewChannel()` in `src/main/ipc-handlers/git.ts` uses `ipcMain.handle` directly with a comment documenting why.

**Source:** Wave 94 Phase E Bug E.

---

## Testing implications

### Symptom — Boundary acceptance test passes; real flow doesn't

**Why:** Mocks in the acceptance test shape the payload to what the IDE EXPECTS Claude Code to send (e.g., assuming `payload.cwd` exists). The real Claude Code hook stdin has a different shape. Test passes because both sides agree on the fictional shape.

**Fix:** Source acceptance-test mock payloads from real-vendor stdin captures whenever feasible. At minimum, validate the mock shape against current vendor docs at acceptance-test time (not just at orchestrator-author-time). Even better: capture a real PreToolUse + PostToolUse stdin pair via `claude` running in a hook-debug terminal, save as `__fixtures__/claude-code-hook-payloads/`, and load that in the acceptance test.

**Source:** Wave 94 Phase E meta-lesson. The 3970d6be "fix" was inert because its acceptance test mocked the payload shape we wished for.
