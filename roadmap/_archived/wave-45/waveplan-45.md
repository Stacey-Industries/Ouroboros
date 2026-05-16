# Wave 45 — Codex App-Server Transport
## Implementation Plan

**Version target:** v2.3.0 (minor — new provider transport, exec path retained as fallback)
**Feature flag:** `ecosystem.codexAppServerTransport` (default `false` until Phase E soak)
**Dependencies:** Wave 44 (chat-only shell), prior approval-bridge work landed on master (Claude hooks → `approvalManager` → renderer banner + pill)
**References:**
- Codex app-server protocol: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
- Existing exec-transport code: `src/main/orchestration/providers/codex*.ts`
- Existing approval bridge: `src/main/approvalManager.ts`, `src/renderer/contexts/ApprovalContext.tsx`, `src/renderer/components/AgentChat/AgentChatApprovalBanner.tsx`

---

## Overview

Today the Codex provider is a one-shot `codex exec --json` wrapper. That shape cannot answer server-initiated approval requests mid-turn, so chat has been hard-gated away from any approval-capable Codex mode (`workspace ask`, `plan`, `read-only`) — they either resolve to a non-blocking mode or are rejected at the provider boundary.

The Codex CLI also ships an **app-server** binary: a persistent JSON-RPC process over `stdio` with `initialize`, `thread/*`, `turn/*`, streaming `item/*` notifications, and bidirectional approval requests. Running Codex through app-server lets us:

1. **Support approval round-trips** — the same `pendingApproval` → renderer → decision flow Claude hooks use today.
2. **Keep long-lived sessions warm** — no process respawn per turn; cheaper resume, fewer cold-start artifacts.
3. **Stream structured items** (assistant messages, reasoning, command execution, file changes) through a typed protocol rather than parsing `exec --json` NDJSON.
4. **Cancel mid-turn cleanly** — `turn/interrupt` instead of `taskkill /T /F` tree-killing PowerShell.

Wave 45 introduces the app-server transport behind a feature flag, keeps the current exec path as fallback, and flips chat over to the new transport once stable. No change to the `ProviderAdapter` contract — app-server sits under `CodexAdapter` as an alternate backend.

---

## Scope

### In-scope

- New `codexAppServer*` module family: JSON-RPC client, session lifecycle, event mapping, approval bridge.
- Feature flag `ecosystem.codexAppServerTransport` in the config schema + Settings surface.
- `CodexAdapter` dispatches to either the exec runner (existing) or the app-server runner (new) based on the flag.
- Approval-mode gating in chat controls becomes conditional on the transport — `workspace ask` and `plan` unlock when the app-server transport is active.
- Approval events normalize into the existing `approvalManager` / renderer pipeline.
- Turn cancellation uses `turn/interrupt`; process lifetime managed separately from turn lifetime.
- Telemetry: transport in use, turn duration, approval round-trip time, interrupt success rate.
- Integration test covering submit → item stream → approval request → decision → resume → completed.
- Docs: `providers/CLAUDE.md`, `orchestration/CLAUDE.md`, root `CLAUDE.md` Codex paragraph.

### Out-of-scope

- Replacing Claude's transport (Claude Code CLI stays — unrelated binary).
- Web-mode Codex sessions (app-server runs in main only; web clients proxy through).
- Multi-session sharing of a single app-server process (one process per session for isolation; pooling is a follow-up).
- Tool-use for non-shell Codex tools (code-search, web-fetch) — only whatever the app-server surfaces today; no synthetic tool injection.
- UI redesign of the approval banner for Codex specifically — reuse the existing banner with provider-aware copy.
- Subscription OAuth for Codex — orthogonal; whatever auth the Codex CLI already uses carries over to app-server.

---

## Architecture

```
ChatOrchestrationBridge
  → CodexAdapter.submitTask(ctx, sink)
       ├─ resolveTransport(ctx.request) → 'app-server' | 'exec'
       │
       ├─ if 'exec'  → existing codexExecRunner path (unchanged)
       │
       └─ if 'app-server':
            codexAppServerClient.ensureProcess(sessionKey)
              └─ spawn('codex', ['app-server'], { stdio: ['pipe','pipe','pipe'] })
                   ↑ JSON-RPC framing over stdio
            client.initialize({ workspaceRoots, model, ... })
            client.threadStart({ resumeThreadId? })
            client.turnStart({ prompt, attachments, approvalPolicy })
              ← stream: item/started, item/delta, item/completed, turn/*
              ← approval/request   → approvalBridge.route(payload)
                                        ↓
                                    approvalManager.enqueue(pendingApproval)
                                        ↓
                                    renderer banner + decision
                                        ↓
                                    approvalBridge.resolve(id, decision)
              → client.approvalRespond({ requestId, decision, editedInput? })
            on turn/completed → sink.emit('completed')
            on turn/failed    → sink.emit('failed')
```

**Transport selection (`resolveTransport`):**

1. If `config.ecosystem.codexAppServerTransport === false` → `'exec'` (default in Phases A–D; flipped in E).
2. If the request's `permissionMode` is one of `workspace-write-ask` | `plan` | `read-only-ask` → require `'app-server'` or reject the request with a surfaceable error.
3. If the Codex binary on PATH does not advertise `app-server` subcommand → fall back to `'exec'` with a warning event (surfaced in the chat status strip).
4. Otherwise → honour the flag.

**Approval bridge (`codexApprovalBridge.ts`):**

- Receives app-server `approval/request` notifications (shell command, file write, etc.).
- Converts to the shared `pendingApproval` shape already flowing through `approvalManager`.
- Stamps `provider: 'codex'`, `sessionId`, `threadId`, `requestId`, `toolName`, `summary`, `rawPayload`.
- On decision, calls `client.approvalRespond(...)` with Codex's JSON shape.
- Emits telemetry: approval duration, decision type, whether user edited input.

**Process lifetime:**

- One `codex app-server` process per Codex *session* (not per turn). Reused across turns.
- Process is spawned lazily on first `submitTask` / `resumeTask`.
- On `cancelTask` → send `turn/interrupt`; keep process alive for follow-up.
- On session close / thread archive → `shutdown` RPC then kill.
- Watchdog: if process dies mid-turn, surface `failed` and clear registry entry so the next turn respawns.

---

## Phase A — Transport scaffolding + JSON-RPC client

**Goal:** A typed JSON-RPC client over a spawned `codex app-server` process, with framing, request/response correlation, notification dispatch, lifecycle, and tests. No wiring to `CodexAdapter` yet.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/main/orchestration/providers/codexAppServerProcess.ts` | ~140 | Spawn + stdio wiring + process registry keyed by sessionId. Windows-safe PowerShell wrapper (mirrors `claudeStreamJsonRunner` pattern). Owns `stdin.write`, `stdout` framed parser, graceful shutdown. |
| `src/main/orchestration/providers/codexAppServerClient.ts` | ~180 | JSON-RPC 2.0 client: request/response correlation by id, timeout, error translation. Exposes `request<T>(method, params)` + `on(notification, handler)`. Does NOT know about Codex-specific methods. |
| `src/main/orchestration/providers/codexAppServerFraming.ts` | ~90 | Content-Length header framing parser (LSP-style — confirm against Codex README). If Codex uses newline-delimited JSON instead, simplify to NDJSON parser. **Subagent MUST verify framing by reading the Codex README before picking.** |
| `src/main/orchestration/providers/codexAppServerTypes.ts` | ~120 | Protocol types: `InitializeParams`, `InitializeResult`, `ThreadStartParams`, `TurnStartParams`, `ItemStartedNotification`, `ApprovalRequestNotification`, etc. Mirror the Codex README's shapes exactly; do not guess. |
| `src/main/orchestration/providers/codexAppServerProcess.test.ts` | ~120 | Spawn args, stdio hookup, process kill path. Mocks `child_process.spawn`. |
| `src/main/orchestration/providers/codexAppServerClient.test.ts` | ~180 | Request/response correlation, notification dispatch, timeout, malformed frame handling, concurrent in-flight requests. |
| `src/main/orchestration/providers/codexAppServerFraming.test.ts` | ~100 | Parser handles partial frames, split across chunks, trailing buffer, malformed header. |

### Modified files

| File | Change |
|------|--------|
| `src/main/configSchemaTail.ts` | Add `ecosystem.codexAppServerTransport: boolean`, default `false`. |
| `src/renderer/types/electron-foundation.d.ts` | Mirror schema type. |
| `src/main/orchestration/providers/CLAUDE.md` | Stub entries for the new files (one-liners). Full rewrite deferred to Phase E. |

### Subagent briefing

- **Model:** `sonnet`.
- **Read first:** the Codex app-server README (URL in preamble) end-to-end before writing a single line. Verify framing (LSP vs NDJSON), JSON-RPC id type, error shapes, method names. Do NOT guess from the protocol name alone.
- **Pattern to copy:** `claudeStreamJsonRunner.ts` for spawn + stdout buffer + 100 MB cap + Windows `taskkill /T /F` on kill.
- **Do NOT touch:** `codexAdapter.ts`, `codexExecRunner.ts`, or anything outside the new files + the two schema touchpoints. Scope discipline.
- **ESLint:** `max-lines-per-function: 40`, `max-lines: 300`, `complexity: 10`, `max-depth: 3`, `max-params: 4`. Split files if approaching limits.
- **Test scope:** run only the three new test files locally. Do NOT run `npm test`.
- **Debug policy:** if framing tests fail and first fix doesn't work, add `log.info('[trace:WAVE45-A]', ...)` at parse entry/exit; hand back rather than iterating blindly.
- **Do NOT add telemetry yet** — Phase E wires telemetry once the surface is stable.

### Acceptance

- [ ] New files present, all under 300 lines.
- [ ] `npx vitest run` on the three new test files — 0 failures.
- [ ] `npx tsc -p tsconfig.json --noEmit` — 0 errors.
- [ ] No imports from `codexAppServer*` in `codexAdapter.ts` yet (verified by grep in the acceptance step).
- [ ] Commit: `feat(wave-45): Phase A — Codex app-server JSON-RPC client scaffold`

---

## Phase B — Session lifecycle (initialize / thread / turn / interrupt)

**Goal:** A `CodexAppServerSession` class that owns the full lifecycle: initialize, thread start/resume, turn start, turn interrupt, shutdown. Pure state machine; no mapping to `ProviderProgressEvent` yet.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/main/orchestration/providers/codexAppServerSession.ts` | ~240 | Owns one Codex thread. Methods: `initialize()`, `startThread(resumeId?)`, `startTurn(prompt, options)`, `interruptTurn()`, `shutdown()`. Internal state machine: `idle` → `initializing` → `ready` → `in-turn` → `awaiting-approval` → `in-turn` → `ready`. Emits events for each transition. |
| `src/main/orchestration/providers/codexAppServerSessionState.ts` | ~80 | State enum + transition table + `canTransition(from, to)` validator. |
| `src/main/orchestration/providers/codexAppServerRegistry.ts` | ~90 | Maps `sessionKey → CodexAppServerSession`. Lazy create, dispose on session close, idle-timeout eviction (default 10 min configurable). |
| `src/main/orchestration/providers/codexAppServerSession.test.ts` | ~220 | State transitions; initialize failure; turn interrupt mid-stream; thread resume with missing threadId; shutdown during active turn. |
| `src/main/orchestration/providers/codexAppServerRegistry.test.ts` | ~100 | Lazy creation, eviction, duplicate-key behavior. |

### Modified files

| File | Change |
|------|--------|
| `src/main/orchestration/providers/CLAUDE.md` | Add session + registry one-liners. |

### Subagent briefing

- **Model:** `sonnet`.
- **Read first:** `codexAppServerClient.ts` from Phase A, plus `claudeCodeState.ts` (the shared-state pattern this registry copies).
- **State machine discipline:** every transition explicit in `codexAppServerSessionState.ts`. Illegal transitions throw. No string state comparisons scattered across methods — always `canTransition`.
- **Interrupt semantics:** `turn/interrupt` MUST be idempotent from the caller's perspective. Double-interrupt should not error — session just stays in whatever terminal state it reached.
- **Thread resume:** if `resumeId` is provided but Codex reports the thread is gone, session transitions through `thread-not-found` → back to `idle` and surfaces a recoverable error so the adapter can start a fresh thread.
- **Do NOT** call this from `CodexAdapter` yet — Phase C does that wiring.
- **ESLint + test scope** per Phase A rules.

### Acceptance

- [ ] Session state machine covers all transitions documented in the Codex README.
- [ ] Interrupt is idempotent.
- [ ] Registry evicts idle sessions after timeout.
- [ ] Scoped tests pass; `tsc --noEmit` clean.
- [ ] Commit: `feat(wave-45): Phase B — Codex app-server session lifecycle`

---

## Phase C — Event mapping + CodexAdapter integration

**Goal:** `CodexAdapter.submitTask` and `resumeTask` can dispatch to app-server when the flag is on. App-server item/turn notifications map to the same `ProviderProgressEvent` shapes the exec path emits, so the chat bridge is transport-blind. Approval requests are NOT wired yet — that's Phase D.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/main/orchestration/providers/codexAppServerEventMapper.ts` | ~220 | Maps app-server `item/*` + `turn/*` notifications into `ProviderProgressEvent`. Covers assistant text, reasoning, command execution, file change, token usage, turn completion/failure. Mirrors `codexEventHandler.ts` output shape so the bridge doesn't change. |
| `src/main/orchestration/providers/codexAppServerRunner.ts` | ~180 | Entry point analogous to `codexExecRunner`. `runCodexAppServerTurn(args)` → obtains/creates session, starts turn, wires notifications to `sink.emit` via the event mapper, resolves on `turn/completed` or rejects on `turn/failed`. Owns the adapter-side session-ref assignment. |
| `src/main/orchestration/providers/codexAppServerEventMapper.test.ts` | ~220 | Golden-file style — feed recorded notification sequences, assert emitted events. Covers: single assistant message, command with file changes, reasoning block, turn failure with error event, interrupt mid-turn. |
| `src/main/orchestration/providers/codexAppServerRunner.test.ts` | ~180 | Mock client + session; verify sink receives `queued` → `streaming` → `completed` sequence; interrupt path emits `cancelled`; thread-id assignment on `thread/started`. |

### Modified files

| File | Change |
|------|--------|
| `src/main/orchestration/providers/codexAdapterHelpers.ts` | Add `resolveCodexTransport(request)` → `'app-server' \| 'exec'`. Reads the config flag + inspects approval mode + checks binary capability (cached). |
| `src/main/orchestration/providers/codexAdapter.ts` | In `launchCodex`, dispatch on `resolveCodexTransport`. Exec path unchanged. App-server path calls `runCodexAppServerTurn`. Capture/release happens via the registry. |
| `src/main/orchestration/providers/codexAdapterHelpers.test.ts` | Cover transport resolution: flag off, flag on + compatible mode, binary missing, incompatible approval mode. |

### Subagent briefing

- **Model:** `sonnet`.
- **Read first:** `codexEventHandler.ts` (current exec→ProviderProgressEvent mapping) and `codexAdapter.ts` (launch flow). The new path must emit the SAME `ProviderProgressEvent` shapes for existing cases; new shapes are only for app-server-specific notifications that have no exec analogue.
- **No approval wiring in this phase.** If app-server sends an `approval/request` notification, the mapper emits a `streaming` event with placeholder text explaining approvals aren't wired yet, and the runner auto-responds with `deny` so the session doesn't hang. This is temporary — Phase D replaces it.
- **Binary capability check** (`codex app-server --help` exit 0 and contains the expected subcommand) — cache the result for the process lifetime. Do NOT run `--help` on every `resolveCodexTransport` call.
- **Session-ref `threadId` assignment:** on first `thread/started` notification, set `sessionRef.sessionId = threadId`. Mirrors exec path — see `codexAdapter.handleLaunchSuccess:57-61`.
- **Do NOT** touch the renderer or the approval manager.
- **ESLint + test scope** per Phase A rules.
- **Debug policy:** per memory — if mapping tests fail twice, add trace logs at notification ingress/egress and hand back.

### Acceptance

- [ ] Flag off → all existing tests still pass unchanged (exec path untouched).
- [ ] Flag on + `codex app-server` available → submitTask produces the same `ProviderProgressEvent` shape sequence as the exec path for a non-approval turn.
- [ ] Binary-missing fallback emits a visible warning event and routes through exec.
- [ ] Scoped tests pass; `tsc --noEmit` clean.
- [ ] Commit: `feat(wave-45): Phase C — Codex app-server adapter integration`

---

## Phase D — Approval request/response bridge

**Goal:** App-server approval requests reach the renderer through the existing `approvalManager` pipeline. User decisions round-trip back through the JSON-RPC client. Chat controls unlock `workspace ask` / `plan` / `read-only ask` modes when the app-server transport is active.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/main/orchestration/providers/codexApprovalBridge.ts` | ~160 | Receives app-server `approval/request` notifications. Normalizes to `pendingApproval`. Calls `approvalManager.enqueue`. On decision, calls `client.approvalRespond`. Handles timeout, session death mid-approval, duplicate request ids. |
| `src/main/orchestration/providers/codexApprovalBridge.test.ts` | ~220 | Approval normalization, decision round-trip, timeout → auto-deny + emit warning, session death mid-approval → cancel approval in manager, edited-input pass-through. |

### Modified files

| File | Change |
|------|--------|
| `src/main/orchestration/providers/codexAppServerRunner.ts` | Replace the Phase C placeholder approval auto-deny with real bridge wiring. Pass the sink + sessionRef into the bridge so it can emit visible events when approvals queue and resolve. |
| `src/main/approvalManager.ts` | Add `provider` and `rawPayload` passthrough fields to `pendingApproval` if not already present. **Subagent reads first to check — may already exist from the earlier approval work.** |
| `src/main/agentChat/chatOrchestrationRequestSupportHelpers.ts` | When resolving `permissionMode` for Codex: if transport is app-server, allow `workspace-write-ask`, `plan`, `read-only-ask` through. Keep the current coerce-away behavior when transport is exec. |
| `src/renderer/components/AgentChat/ChatControlsBarSupport.ts` | `getPermissionModes('codex')` becomes transport-aware — reads the new flag (via existing config selector) and returns the expanded mode list when app-server is active. |
| `src/renderer/components/AgentChat/ChatControlsBarSupport.test.ts` | Cover both branches: flag off (current gated list) and flag on (full list). |
| `src/main/agentChat/chatOrchestrationRequestSupport.test.ts` | Cover: app-server transport + interactive mode = passes through; exec transport + interactive mode = coerced away (existing behavior). |

### Subagent briefing

- **Model:** `sonnet`.
- **Read first:** `src/main/approvalManager.ts` to understand the current `pendingApproval` shape and the hook-side flow. Then `src/renderer/contexts/ApprovalContext.tsx` and `src/renderer/components/AgentChat/AgentChatApprovalBanner.tsx` so the mapped Codex payload produces a useful banner.
- **Codex approval payload mapping:**
  - `toolName` ← from the Codex `approval/request` payload's command kind (shell exec, file write, etc.).
  - `summary` ← human-readable single line for the banner; build from the payload's primary field (command string or target file path).
  - `rawPayload` ← entire notification untouched, so the renderer can show "Show details".
  - `sessionId` / `threadId` ← from the owning session; the bridge receives these at construction.
- **Timeout:** if the approval manager times out (existing TTL), bridge sends `deny` to Codex and emits a `streaming` event explaining what happened. Do not let the session wait forever.
- **Session death mid-approval:** if the Codex session errors/dies while an approval is in flight, bridge cancels the approval in `approvalManager` (new method if needed) and emits `failed` to the sink.
- **Edited input:** if the user edits the proposed command/input in the banner, pass it through in `approvalRespond` as `editedInput`. Claude hooks already do this — confirm the shape matches.
- **Chat-controls unlock:** reading the flag from the renderer — use the existing config selector pattern (search for `ecosystem.` reads in renderer code for precedent).
- **Scope discipline:** don't refactor `approvalManager` beyond adding the two fields if missing. Flag if broader refactor seems necessary rather than doing it.
- **ESLint + test scope** per Phase A rules.

### Acceptance

- [ ] `approval/request` → banner visible → approve → session resumes → completes.
- [ ] `approval/request` → deny → session receives deny → turn terminates cleanly (no hang).
- [ ] `approval/request` → user edits input → Codex receives edited input.
- [ ] Timeout auto-denies and surfaces a visible warning.
- [ ] Session death mid-approval cancels the approval.
- [ ] Chat controls expose `workspace ask` / `plan` / `read-only ask` only when flag is on.
- [ ] Scoped tests pass; `tsc --noEmit` clean.
- [ ] Commit: `feat(wave-45): Phase D — Codex approval bridge`

---

## Phase E — Integration tests, telemetry, flag activation, docs

**Goal:** End-to-end coverage, telemetry in place, feature flag defaulted on after verification, CLAUDE.md updated, exec path kept as explicit fallback for soak period.

### New files

| File | ~Lines | Description |
|------|--------|-------------|
| `src/main/orchestration/providers/codexAppServer.integration.test.ts` | ~260 | End-to-end inside jsdom + mocked `codex` binary: submit → stream → approval → decision → completed. Covers resume-from-thread path. Covers interrupt. |
| `src/main/orchestration/providers/codexAppServerTelemetry.ts` | ~120 | Records: transport selection reason, turn duration, approval count + round-trip ms, interrupt success, thread-not-found rate, binary-missing fallback rate. Uses the existing telemetry infra (search `router/*Telemetry` for precedent). |
| `src/main/orchestration/providers/codexAppServerTelemetry.test.ts` | ~80 | Record/read round-trip. |

### Modified files

| File | Change |
|------|--------|
| `src/main/orchestration/providers/codexAppServerRunner.ts` | Call into telemetry at turn start/end/approval points. |
| `src/main/orchestration/providers/codexApprovalBridge.ts` | Call into telemetry at approval enqueue/resolve points. |
| `src/main/configSchemaTail.ts` | After soak verification, change default of `ecosystem.codexAppServerTransport` from `false` to `true`. **Parent commits this change separately — subagent MUST leave the default at `false`.** |
| `src/renderer/components/Settings/EcosystemSettings.tsx` (or equivalent) | Add a Codex section exposing the flag with help text: "Use the Codex app-server transport (required for interactive approval modes). Falls back to the legacy exec transport if unavailable." |
| `src/main/orchestration/providers/CLAUDE.md` | Full rewrite: Codex section now documents both transports, the resolution logic, and when each is used. Remove the stale "interactive approval not supported" gotcha once the flag is on by default. |
| `src/main/orchestration/CLAUDE.md` | Update the provider paragraph to reference dual Codex transports. |
| `CLAUDE.md` (root) | Update the Codex line under "Key Files" — mention the app-server path. |
| `docs/architecture.md` | Update the Codex transport paragraph. |

### Subagent briefing

- **Model:** `sonnet`.
- **Do NOT** flip the flag default. Parent handles that commit after a manual dogfood pass.
- **Mocked binary:** the integration test shells out to a test-only Node script that speaks the app-server protocol (sample of methods: `initialize`, `thread/start`, `turn/start`, streams a few items, emits one `approval/request`, accepts `approval/respond`, completes). Keep this fixture small and inline — it's a protocol mock, not a Codex reimplementation.
- **Telemetry:** match the shape of existing router telemetry — read those files first, copy the pattern, don't invent new infra.
- **Docs discipline:** don't duplicate content that belongs in the app-server README. CLAUDE.md should describe the *integration*, not the protocol.
- **Test scope:** integration test + telemetry test. Parent runs full suite at wave close.

### Acceptance

- [ ] Integration test passes with approval round-trip.
- [ ] Telemetry entries visible in the router decision log surface (or equivalent).
- [ ] CLAUDE.md files accurate; no stale "approval not supported" claims for Codex.
- [ ] Flag documented in Settings with accurate help text.
- [ ] Scoped tests pass; `tsc --noEmit` clean.
- [ ] Commit: `feat(wave-45): Phase E — Codex app-server telemetry, integration tests, docs`
- [ ] Parent commit (separate): `feat(wave-45): flip ecosystem.codexAppServerTransport default to true after soak`

---

## Subagent execution model

All phase agents:

- **Model:** `sonnet` (per user rule `agent-model-selection.md`).
- **Isolation:** sequential on master.
- **Test policy:** subagents MUST NOT run `npm test`. Scoped vitest only. Parent runs full suite + lint + typecheck post-wave.
- **Lint policy:** no relaxation. `max-lines-per-function: 40`, `max-lines: 300`, `complexity: 10`, `max-depth: 3`, `max-params: 4`. If a function would blow the limit, split it — do not bump the config.
- **Debug policy:** after 1 failed fix, add `log.info('[trace:WAVE45-<phase>]', ...)` and hand back rather than iterating blindly. (Per memory `feedback_debug_before_fix.md`.)
- **Commit policy:** one commit per phase, conventional commits, local-only. Parent reviews aggregate diff and pushes once the wave is complete. (Per memory `feedback_wave_push_policy.md`.)
- **Scope discipline:** listed files only. If scope expansion is needed, stop and report to parent before editing.
- **Research:** Phase A subagent MUST read the Codex app-server README before writing the framing or types. Do not guess the wire format.

### Phase dispatch order

1. **Phase A** (JSON-RPC client + framing) — foundational; all later phases import from it.
2. **Phase B** (session lifecycle) — depends on A.
3. **Phase C** (adapter integration + event mapping) — depends on A + B.
4. **Phase D** (approval bridge) — depends on C (needs the runner's sink + session ref).
5. **Phase E** (integration tests, telemetry, docs) — last.

Phases A and B could nominally run in parallel (B's client interface is fixed), but sequence them serially for merge cleanliness on a single branch.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **Codex app-server protocol differs from the README.** | Phase A subagent runs `codex app-server --help` and reads the README in the same session; if the wire format differs, subagent stops and surfaces the discrepancy before implementing framing. |
| **`codex app-server` subcommand not present in the user's installed Codex version.** | `resolveCodexTransport` binary-capability check falls back to exec with a visible warning event. Settings surface documents the minimum Codex version required. |
| **Approval timeout semantics differ between Codex expectations and `approvalManager`'s TTL.** | Phase D bridge auto-denies on manager timeout and tells Codex. Telemetry captures the timeout rate so we can tune the TTL. |
| **Long-lived app-server process leaks memory across turns.** | Registry eviction at idle timeout (10 min default). Parent dogfoods for the full soak period watching process-memory traces. |
| **Turn interrupt races with approval request.** | Session state machine forbids `interrupt` during `awaiting-approval` without first cancelling the pending approval. Covered by Phase B state-machine tests. |
| **Approval banner copy is Claude-specific.** | Audit during Phase D — if copy assumes Claude, parameterize on `provider`. Surface as a Phase D sub-task if it exists. |
| **Flag flip creates a support cliff for older Codex installs.** | Keep exec fallback indefinitely; do NOT remove it in this wave. A future "remove exec transport" wave is only justified after ≥1 release cycle of app-server default + telemetry showing <1% exec fallback rate. |
| **Per-session process count balloons with many parallel threads.** | Idle eviction + explicit shutdown on thread close. If telemetry shows chronic N>5 processes, add a pool in a follow-up wave. |
| **Meta-dev risk — editing Codex provider while using Codex provider.** | This codebase is developed from inside itself, but the active chat provider during development is Claude Code. Still, avoid destructive test runs that would kill the host IDE's sessions. |

---

## Acceptance criteria (wave-level)

- [ ] Five phase commits present on master.
- [ ] `npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] Manual smoke (parent, flag on):
  - [ ] Codex chat turn completes end-to-end via app-server.
  - [ ] `workspace ask` mode triggers an approval banner; approve → command runs; turn completes.
  - [ ] Deny → Codex gracefully aborts the tool call; turn completes with a "denied" message block.
  - [ ] Editing the command in the banner sends the edited command to Codex.
  - [ ] Cancel button mid-turn interrupts via `turn/interrupt` (verify in logs).
  - [ ] Resume from an existing thread works after renderer reload.
  - [ ] Binary missing → falls back to exec with a visible warning; no hang.
- [ ] Manual smoke (parent, flag off):
  - [ ] Existing exec path unchanged (regression check against pre-wave behavior).
- [ ] Telemetry dashboard / log surface shows transport selection counts + approval round-trip timings.

---

## Out-of-wave follow-ups

- **App-server process pooling** across sessions (one process serves many threads).
- **Remove exec transport** after ≥1 release with <1% fallback rate in telemetry.
- **Codex subscription auth polish** — surface auth failures with actionable messaging.
- **Tool-use parity audit** — compare tool surface between Claude Code hooks and Codex app-server; document where they diverge.
- **Web-mode Codex** — app-server runs in main only today; web clients go through the main process. A dedicated web-mode path may be worth measuring.
- **Session warm-up** analogous to `contextWorker.ts` — spawn the app-server before the user sends the first turn, at the cost of an idle process. Profile before committing to this.
