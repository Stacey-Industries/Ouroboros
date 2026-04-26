# Wave 56 — Teams Mode for Ouroboros Chat Panel
## Implementation Plan (DRAFT)

**Version target:** v2.9.x or later (minor — new chat-panel mode behind a per-window toggle; experimental and Claude-Code-only)

**Feature flags:**
- `teamsMode.defaultEnabled` (global, default `false` — Claude Code Agent Teams is experimental upstream)
- `teamsMode.enabled` (per-window override)

**Dependencies:**
- Independent of Waves 54 / 55. Teams Mode is a chat-panel feature that reuses the existing PTY spawn primitive; it does not block on any in-flight wave.
- Claude Code's experimental Agent Teams must remain available upstream (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`).
- Existing terminal panel and chat orchestration providers must be in their current shape (no concurrent rewrite).

**References:**
- `src/main/ptySpawn.ts:43-75` — `spawnClaudePty()`, the interactive Claude PTY spawn (reused as the Teams hand-off target)
- `src/main/orchestration/providers/claudeCodeContextBuilder.ts:220-246` — `buildInitialPrompt()`, the IDE context packet builder (refactor target in Phase 1)
- `src/main/orchestration/providers/providerAdapter.ts:55-67` — provider abstraction; informs Phase 5 routing
- `src/main/ptyClaude.ts:16-35` — `buildClaudeArgs()` for the terminal-panel CLI args (reference shape)
- Official Claude Code Agent Teams docs: https://code.claude.com/docs/en/agent-teams
- Constraining issues: #23506 (custom-agent can't initiate teams — lead must be vanilla `claude`), #1124 (headless/SDK keepalive bug — must use interactive PTY), #25135 (`SendMessage` silent-drop on misspelled recipient), #38379 (`--resume` crash on Teams artifacts)

**Numbering note:** Wave 54 implicitly reserved Wave 55 for `renameSymbol` / `safeDelete` follow-up. This is filed as Wave 56 to preserve that slot. Renumber if Wave 55 does not materialize.

---

## Why this shape (terminal hand-off, not embedded chat)

When Teams Mode is active and the user submits a chat prompt, the IDE snapshots the IDE context packet, writes it to a temp file, opens a new interactive terminal pane split alongside the chat panel, spawns `claude` interactively with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, and types a seeded first turn into the PTY that points the lead at the temp file plus the user's prompt. The chat panel itself does not host Teams; it launches them.

This shape (vs. embedding Teams in the chat panel):

- Reuses the battle-tested terminal panel (xterm.js + WebGL + glass theme); no new render path.
- Native Teams UX (Shift+Down teammate cycling, Ctrl+T task list) stays native.
- Chat panel keeps its existing stream-json power; Teams sessions don't pollute it.
- Failure modes (stuck teammate, `SendMessage` silent-drop, `--resume` crash) are contained in a terminal pane that can be closed and restarted.

The chat panel today uses `claude -p --verbose --output-format stream-json` (`claudeStreamJsonRunner.ts:308-335`) — headless mode, exactly what triggers #1124. The IDE already has the alternative interactive path (`spawnClaudePty` at `ptySpawn.ts:43-75`) reachable from the terminal panel; this wave wires it to the chat-panel UI for Teams sessions only.

---

## Architectural decisions (resolved before phasing)

| Question | Decision | Reasoning |
|---|---|---|
| Settings hierarchy | Per-window with a global default | Matches existing `ManagedWindow.projectRoots` pattern; avoids surprising mode flips on window switch |
| Env var scope (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) | Only the spawned Teams PTY, not global env | Preserves the invariant that terminal-typed `claude` is vanilla unless the user opts in themselves |
| Conversation hand-off marker | Yes — append a system message with the Teams pane ID and a clickable anchor | Traceability; user can reopen the spawned pane later from chat history |
| Failure UX if pane fails to open | Inline error in chat with retry; no auto-fallback to embedded mode | Auto-fallback would silently violate the design contract (Teams = terminal hand-off only) |
| Crash-safety GC | App-start sweep of `<userData>/teams-handoff/` deleting files older than 24h, plus delete on clean pane close | Survives crashes; older orphans are noise |

If any of these flip, Phase 0 types and Phase 5 settings shape change accordingly.

---

## Phase 0 — Scaffolding (shared types + IPC contract)

**Summary:** Wire the typed handshake every later phase will reference. No behavior; just the contract.

**What gets built:**
- New file: `src/renderer/types/teamsHandoff.d.ts` (or extend `electron.d.ts` per existing convention)
  - `TeamsHandoffRequest`: `{ chatSessionId: string; userPrompt: string; contextPacket: TeamsContextPacket; cwd: string }`
  - `TeamsHandoffResult`: `{ success: true; terminalPaneId: string; handoffFilePath: string; spawnedSessionId?: string } | { success: false; error: string }`
  - `TeamsContextPacket`: serializable shape of what `buildInitialPrompt()` builds, minus transport-specific framing
- IPC channel constant: `'teams:handoff'` registered in `src/renderer/types/electron.d.ts`
- Path constants module: `src/main/teamsHandoff/paths.ts` exporting `getTeamsHandoffDir()` (`<userData>/teams-handoff/`), `getHandoffFilePath(sessionId)`
- Stub module `src/main/teamsHandoff/index.ts` re-exporting the public surface

**Dependencies:** None.

**Existing modified vs created fresh:**
- New: `src/main/teamsHandoff/` directory and contents
- Modified: `src/renderer/types/electron.d.ts` (one channel addition + type imports)

**Acceptance criteria:**
- `npx tsc --noEmit` passes across main/preload/renderer
- `src/main/teamsHandoff/paths.ts` exports work in unit tests; directory path resolves under `app.getPath('userData')`
- No runtime behavior change anywhere — purely additive

**Risk flags:**
- Confirm where existing IDE files live (likely `app.getPath('userData')`) and align — don't hardcode `~/.ouroboros/`.

**Estimated scope:** S

---

## Phase 1 — Context packet builder (extract & expose)

**Summary:** Refactor `buildInitialPrompt()` so the context portion can be produced independently of an `-p` spawn, and add a markdown serializer for the temp-file format.

**What gets built:**
- Refactor in `src/main/orchestration/providers/claudeCodeContextBuilder.ts`:
  - Extract the context-packet assembly (lines ~187-217) into a pure function `buildTeamsContextPacket(input): TeamsContextPacket`
  - Keep `buildInitialPrompt()` calling it internally so existing chat behavior is unchanged
- New: `src/main/teamsHandoff/contextSerializer.ts`
  - `serializeContextToMarkdown(packet: TeamsContextPacket): string` — produces a clean markdown document for the temp file (sections matching the XML blocks but in heading-format, plus pinned/memories/skill-instructions/system-instructions/graph-summary)
- Unit tests: `contextSerializer.test.ts` — golden-file style on a known input

**Dependencies:** Phase 0 types.

**Existing modified vs created fresh:**
- Modified: `claudeCodeContextBuilder.ts` (refactor only — no behavior change for chat)
- Created: `contextSerializer.ts`, test

**Acceptance criteria:**
- All existing chat panel tests pass without modification
- New serializer test green with deterministic output
- ESLint clean (`max-lines-per-function: 40`, `complexity: 10`)
- Refactor preserves the exact stdin XML packet today's chat panel produces (verify by snapshot test on `buildInitialPrompt()` output before/after)

**Risk flags:**
- The XML packet may have ordering or whitespace assumptions baked into downstream parsing. Snapshot the existing chat-panel output before the refactor as a regression guard.
- `claudeCodeContextBuilder.ts` may already be near the file size limit; extracting may push it over `max-lines: 300`. If so, split into a helper module proactively.

**Estimated scope:** S/M

---

## Phase 2 — Temp file lifecycle module

**Summary:** Write, locate, and delete the hand-off context files. Orphan GC.

**What gets built:**
- New: `src/main/teamsHandoff/handoffFiles.ts`
  - `writeHandoff(sessionId, markdown): Promise<string>` — returns absolute path
  - `deleteHandoff(sessionId): Promise<void>` — silent on missing
  - `cleanupOrphans({ olderThanMs }): Promise<{ deleted: number; errors: string[] }>` — for app-start GC
- Tests: write/read/delete; orphan cleanup with mocked `fs` and clock; concurrent writes don't collide
- Permissions: file mode `0600` (single-user secrets-adjacent — context may include diagnostics + workspace state)

**Dependencies:** Phase 0 paths.

**Existing modified vs created fresh:**
- All new under `src/main/teamsHandoff/`

**Acceptance criteria:**
- Files round-trip via UTF-8 read; size under ~500KB for typical packets (sanity assertion in test)
- Orphan cleanup deletes only files older than threshold; younger files survive
- Failed writes throw with a useful error; the orchestrator (Phase 4) maps to inline-chat-error UX
- Lint-clean; `security/detect-non-literal-fs-filename` requires the filename builder to validate `sessionId` is a UUID-shaped string — add validation at the seam

**Risk flags:**
- ESLint `security/detect-non-literal-fs-filename` will fire on dynamic paths. Validate session IDs and lint-disable per-line with justification, not file-wide.
- Concurrent terminal panes opened back-to-back — ensure session IDs are unique (UUIDv4 from Node `crypto.randomUUID()`).

**Estimated scope:** S

---

## Phase 3 — PTY launch with seeded initial input

**Summary:** Build a Teams-flavored Claude PTY spawn that injects the env var, applies in-process teammate mode, and writes the seeded first turn after the PTY is ready.

**What gets built:**
- New: `src/main/teamsHandoff/spawnClaudeTeamsPty.ts`
  - Wraps the existing `spawnClaudePty()` at `src/main/ptySpawn.ts:43-75` rather than duplicating it
  - Injects `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` into env
  - Sets `teammateMode` via the documented mechanism — confirm pre-flight whether settings.json key, CLI flag, or env var. If only via settings.json, the spawn writes a session-scoped settings override file before launch (under userData) and points the spawn at it via `--settings-file` flag if available, or via `XDG_CONFIG_HOME` redirection if not
  - After PTY is ready (first `data` event from `pty.onData`), writes the seeded first-turn text followed by `\r`
- Helper to build the seed text from this template:
  ```
  Read .ouroboros/teams-handoff/<sessionId>.md — that file is your IDE context for this session.
  Before any SendMessage, read ~/.claude/teams/<team-name>/config.json and use the exact `name` field from the `members` array; echo the recipient name in your message.
  The user's request is:

  <user-prompt>
  ```
- Tests with mocked node-pty: spawn args correct, env propagated, seed input written exactly once after first data event
- Smoke-test script (manual, not CI) that opens a real PTY and verifies the lead reads the file

**Dependencies:** Phase 0 (types), Phase 2 (temp file path).

**Existing modified vs created fresh:**
- New: `spawnClaudeTeamsPty.ts`
- Possibly modified: `src/main/ptySpawn.ts` to expose a hook point if the existing function doesn't allow post-spawn input injection cleanly

**Acceptance criteria:**
- Unit test verifies env contains `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and inherits all `OUROBOROS_*` vars
- Unit test verifies seeded text is written to PTY *after* first `data` event, not before
- Manual smoke test: lead session reads the temp file, prints content acknowledgment, reaches Teams-ready prompt
- Lint-clean

**Risk flags:**
- **`teammateMode` mechanism is the spike.** This brief assumes a settings.json key works. Verify against current Claude Code docs (use `find-docs` or research agent) before committing to a path. If only an env var or CLI flag works, simpler.
- Timing of seed write: writing too early (before claude has rendered its prompt) can cause input loss. The "wait for first data" heuristic might need refinement — possibly wait for a specific prompt token or settle for a debounced delay (~150ms after first data on Windows ConPTY).
- **Adversarial input in the seeded turn.** The user's prompt is typed verbatim into the PTY. Backticks, backslashes, embedded `\r`/`\n`, control chars, and ANSI escape sequences can corrupt input or trigger unintended terminal behavior. Add an `escapePtyInput()` helper with adversarial test cases (control sequences, embedded line endings, backtick injection, ANSI CSI). Apply only to the user-prompt segment; the fixed template prefix is trusted.

**Estimated scope:** M

---

## Phase 4 — Main-process orchestrator + IPC handler

**Summary:** Wire it together end-to-end: chat fires IPC → orchestrator builds packet, writes file, opens pane, spawns Teams PTY with seed → returns pane ID + handoff path.

**What gets built:**
- New: `src/main/teamsHandoff/orchestrator.ts`
  - `handleHandoffRequest(req: TeamsHandoffRequest): Promise<TeamsHandoffResult>`
  - Steps: serialize context → write temp file → ask window manager to open a split terminal pane → call `spawnClaudeTeamsPty` → wire pane-close event to `deleteHandoff(sessionId)`
- New IPC handler in `src/main/ipc.ts` (or its handler subdirectory): registers `teams:handoff` channel, calls orchestrator, returns result
- Modify window/pty manager: extend the pane-open API to accept "use this PTY spawn function" rather than the default shell — only if the existing API doesn't already allow custom spawners (verify in Phase 0/1 review)
- Preload bridge update in `src/preload/preload.ts` to expose `electronAPI.teamsHandoff(req)`
- Integration test (vitest, with mocked window manager): IPC fires, orchestrator runs all steps, returns expected pane ID
- Failure-path test: temp file write fails → result is `{success: false, error}`; pane-open fails → result is `{success: false, error}` and temp file is rolled back

**Dependencies:** Phases 0-3.

**Existing modified vs created fresh:**
- Created: `orchestrator.ts`, IPC handler module
- Modified: `src/main/ipc.ts` (handler registration), preload, possibly window/pty manager

**Acceptance criteria:**
- Integration test green: full IPC → result roundtrip with mocked PTY
- Errors at any step produce a typed `TeamsHandoffResult` failure (no thrown exceptions across the IPC boundary)
- Pane close triggers temp file deletion (verify by spy)
- Lint clean; new IPC channel typed in `electron.d.ts`

**Risk flags:**
- Window manager extension: if the pane-open API is tightly coupled to the default shell spawn, this phase grows. Investigate during Phase 0 verification and pre-emptively split if needed.
- Race: user closes the pane before claude finishes initial setup. Confirm temp file delete is safe even if PTY hasn't started reading yet (it should be — file is read once early then unused).

**Estimated scope:** M

---

## Phase 5 — Chat UI Teams Mode toggle

**Summary:** Surface the toggle and route the send button accordingly. First user-visible phase.

**What gets built:**
- Settings schema additions (per-window with global default) in the appropriate `configSchema*.ts`:
  - `teamsMode.enabled: boolean` (per-window override)
  - `teamsMode.defaultEnabled: boolean` (global default; default `false`)
  - **Defaults exception:** the project memory states "new features default to `true`," but Teams Mode is experimental and Claude-Code-only; default `false` and document why in the schema comment
- Chat panel UI (`src/renderer/components/AgentChat/...`):
  - Toggle chip near the model selector — clearly labeled "Teams Mode (experimental)"
  - When active, the send button label changes to "Hand off to Teams" with a distinct color/icon (use design tokens, no hardcoded colors per `renderer.md` rule)
  - Tooltip explaining: "Submits this prompt to a new terminal pane running Agent Teams with your IDE context"
- Send-handler routing in chat orchestration: when toggle on, calls `electronAPI.teamsHandoff(...)` instead of the normal chat submit; chat input clears; success surfaces a system message in the chat (Phase 6 handles the marker content)
- Tests: component-level toggle behavior; routing test that toggle-on + send fires the right IPC

**Dependencies:** Phases 0, 4.

**Existing modified vs created fresh:**
- Modified: chat panel components, chat send handler, settings schema
- Created: small toggle primitive if not already in the design system

**Acceptance criteria:**
- Toggle visible, labeled, and actionable
- With toggle on, send no longer goes through the normal stream-json path; instead the IPC fires
- With toggle off, behavior identical to today (regression test)
- Settings persist per-window across reloads
- All colors via design tokens; pre-commit color hook passes

**Risk flags:**
- Settings schema changes touch persisted state — ensure migration from existing settings doesn't crash. Default value handles new-key absence.
- If chat panel state is centralized (Zustand or similar store), the routing branch must live in one place — find it and don't duplicate.
- **Send-handler dual-path.** Easy to accidentally fire both the normal stream-json submit *and* the Teams launch when adding the toggle branch. Make it a clean `if/else`, not an "and also". Add a single-source guard test that asserts exactly one path executes per submit (mock both spawn and IPC, verify call counts).

**Estimated scope:** M

---

## Phase 6 — Conversation hand-off marker

**Summary:** Record the hand-off in the chat conversation as a system message with a clickable anchor back to the spawned terminal pane.

**What gets built:**
- New conversation-message type `teams-handoff-marker` (or extend the existing system-message variant set) in the chat message types
- On successful `TeamsHandoffResult`, append a marker message with: timestamp, terminal pane ID, brief snippet of the user prompt, and a "Reopen pane" / "Focus pane" action
- Action handler: focuses the existing pane if still open; if closed, surfaces an inline notice ("Teams session has ended")
- Visual style: muted background, distinct from user/assistant messages (use existing system-message tokens)
- Tests: marker appears on success; action focuses the right pane

**Dependencies:** Phase 5.

**Existing modified vs created fresh:**
- Modified: chat message type definitions, conversation render path, chat send handler
- Created: marker action handler

**Acceptance criteria:**
- After a successful Teams hand-off, exactly one marker message appears in the chat history
- "Focus pane" action works when the pane exists; surfaces graceful fallback when not
- Marker is persistent across chat reloads
- Failure path (Phase 5's failure routing) shows an error inline message *instead of* a marker, not in addition to one

**Risk flags:**
- Persistence layer for chat conversations may not have a "system marker" type; check before assuming.
- If conversations are stored to SQLite (per CLAUDE.md `sessionsData`), the new message type needs to round-trip — add an explicit serialization test.

**Estimated scope:** S

---

## Phase 7 — Cleanup, hardening, and migration

**Summary:** Final polish: app-start GC, failure UX, docs, and any deprecation seams.

**What gets built:**
- App-start hook in `src/main/main.ts` (or wherever startup tasks live) calls `cleanupOrphans({ olderThanMs: 24*3600*1000 })` from Phase 2
- Failure UX wiring (Phase 4 returns errors; Phase 5 routes them; Phase 7 polishes the inline error component): retry button, copy-error-to-clipboard, "open without IDE context" escape hatch (which falls back to spawning a normal `claude` PTY without the temp file — useful when the temp-file path itself is the broken thing)
- Docs:
  - Update `CLAUDE.md` "Folder Map" with `src/main/teamsHandoff/`
  - Update `docs/architecture.md` with a Teams Mode section (one paragraph + the spawn-vs-handoff diagram)
  - Optional: short user-facing note in `docs/chat-shell.md` describing the toggle
  - Update `ai/deferred.md` if Teams Mode was listed there as deferred
- ESLint pass; full test suite (`timeout 360 npx vitest run`)
- Manual end-to-end smoke test on Windows: open chat panel → toggle Teams Mode → submit a prompt → terminal pane opens with seeded turn → lead reads context file → spawn a teammate → cycle to it → close pane → temp file removed

**Dependencies:** Phases 0-6.

**Existing modified vs created fresh:**
- Modified: `main.ts`, `CLAUDE.md`, `docs/architecture.md`
- No new modules

**Acceptance criteria:**
- App start logs a one-line GC summary (count deleted, errors)
- Failure UX visible and copy-pastable
- Full test suite green
- Manual smoke test passes on Windows (the platform with the most known caveats)
- No new ESLint warnings; no `console.log` left behind

**Risk flags:**
- Smoke test reveals the `teammateMode: in-process` mechanism doesn't work as assumed (Phase 3 risk). If it fails here, regression-debug back to Phase 3 — don't ship with a workaround that defeats the point.
- Documentation drift: if `chat-shell.md` is auto-generated from another source, update there.

**Estimated scope:** S

---

## Cross-cutting concerns

These apply to every phase and should not be re-discovered per implementer:

- **ESLint caps.** `max-lines-per-function: 40`, `complexity: 10`, `max-lines: 300`, `max-depth: 3`, `max-params: 4`. Helpers go into `*Helpers.ts` siblings; new files must respect them from the start. Test files are exempt from `max-lines-per-function` and `max-lines`.
- **Security rules** (main/preload only). `security/detect-non-literal-fs-filename` will fire on any dynamic path — validate `sessionId` shape (UUID-only) at the seam and prefer per-line lint-disable with justification over file-wide rule changes. No new `child_process.spawn` calls — go through node-pty or the existing `spawnClaudePty()` wrapper.
- **Renderer styling.** Tokens only. No hex / `rgb()` / `rgba()`. Glass invariant: don't assume opaque backgrounds for `--bg`, `--bg-secondary`, or `--term-bg` — use `*-solid` variants (e.g. `var(--bg-solid)` or `bg-surface-static`) when text contrast against arbitrary content beneath is genuinely required.
- **IPC contract integrity.** Every new channel updates `src/renderer/types/electron.d.ts` first, then the preload bridge, then the main handler. `npx tsc --noEmit` is the gate before each commit.
- **Structured logging.** `log.info('[teams:<event>]', { sessionId, ... })` at every boundary (launch, seed-write, PTY-ready, cleanup, GC). Greppable; keep these baseline lines after Phase 7 — they're operational, not investigation-specific. Per `multi-process-debugging.md`, log at both emission and reception for any IPC traversal.
- **Per-window project isolation.** Teams pane CWD comes from the launching window's project roots, not the global `defaultProjectRoot`. Match the existing per-window resolution pattern in `src/main/ptyClaude.ts:51-53`.
- **Test scope per phase.** Run only touched tests during implementation (`npx vitest run path/to/touched.test.ts`). Full suite (`timeout 360 npx vitest run`) at the end of each phase. Subagents must skip `npm test`; the parent runs the full suite post-commit per the wave push policy.
- **Defaults exception flag.** Per the project memory rule "new boolean feature flags default to true," Teams Mode is the documented exception (experimental, Claude-Code-only). Both `teamsMode.enabled` and `teamsMode.defaultEnabled` default `false`. Schema comment must state the reason inline so future agents don't "helpfully" flip it.

---

## Phase summary

| Phase | Scope | Cumulative deliverable |
|---|---|---|
| 0 — Scaffolding | S | Types and IPC contract; nothing user-visible |
| 1 — Context packet builder | S/M | Context can be serialized to a temp file |
| 2 — Temp file module | S | Files write/read/delete with GC |
| 3 — PTY spawn with seed | M | Manual command-line invocation produces a seeded Teams session |
| 4 — Orchestrator + IPC | M | One IPC call produces a working Teams pane |
| 5 — UI toggle | M | **First user-visible** — Teams Mode shipping behind a toggle |
| 6 — Conversation marker | S | Chat history shows the hand-off |
| 7 — Cleanup / docs | S | Production-ready |

**Total scope:** ~M+ for an experienced single agent across a few sessions. Phases 3 and 4 are the risk concentration; Phases 0-2 are straight type/IO work; Phase 5 is straight UI; Phases 6-7 are polish.

---

## Pre-flight before Phase 0

Before starting, verify these against current Claude Code docs (don't trust this brief blindly):

1. **`teammateMode` mechanism**: settings.json key, CLI flag, or env var? Phase 3 spawn changes shape based on this.
2. **`--settings-file` flag existence**: if `teammateMode` requires settings.json and we don't want to mutate the user's global file, we need a session-scoped settings file. Check whether Claude Code supports loading a non-default settings path.
3. **`spawnClaudePty` extensibility**: read `src/main/ptySpawn.ts:43-75` and the function's call sites. If the function can already accept a post-spawn callback for input injection, Phase 3 is a thin wrapper. If not, modify the function in Phase 3 to expose a hook.

Use a research-extraction agent for items 1-2 and a haiku-explorer for item 3 — both can run in parallel.
