---
status: LOCKED
created: 2026-05-12
updated: 2026-05-12
---

# Wave 87 — Architecture Decision Record

Per `~/.claude/rules/best-practice-spectrum.md`. Decisions transcribed from `waveplan-87.md` §"Locked decisions (Phase 0 — ADR)" and grounded against the codebase at `roadmap/wave-87-chat-orchestration-activation/phase-0-results.md`.

## Decision 1: Bundle fix via lazy-init of the DB connection in `threadStore.ts`

**Context:** Wave 86's new chat-state architecture is wired but dormant in production. The shadow tap installation at `src/main/ipc-handlers/chatStateNewPath.ts:93` uses a dynamic `require('../agentChat/threadStore')` to avoid loading `threadStore.ts` (which calls `app.getPath('userData')` at module-eval time) in test environments where Electron's `app` is not available. Vite drops the dynamic require during main-process bundling, so the shadow tap never installs in production. Phase 0 pre-flight surfaced a second instance of the same lazy-require pattern at `src/main/session/sessionStartup.ts:36`, presumably for the same reason.

**Options considered:**
- *Industry standard:* **Lazy-init the DB connection in `threadStore.ts`.** Move `app.getPath('userData')` (and any other Electron `app.*` calls) out of module-eval scope into an `init()` function or lazy getter called on first DB access. Static import then works everywhere — production main-process bundling, vitest under Node, even mock harnesses. Pattern is canonical for Electron singletons with delayed initialization (electron-store, better-sqlite3 wrappers, most production Electron apps).
- *Local workaround:* Defer the `require` until `app.whenReady()` resolves. Keeps the dynamic require, hides the Vite problem behind a runtime gate. Single-site fix; doesn't address `sessionStartup.ts`. Leaves the "module-eval touches Electron" hazard intact for every future static importer.
- *Cutting-edge / experimental:* Switch to a worker-thread-isolated SQLite layer (e.g., `bun:sqlite` in a worker, or `node-sqlite-wasm`). Eliminates the threading model concerns at the cost of significant refactor; out of proportion to the actual bug.

**Pick:** Lazy-init the DB connection in `threadStore.ts` — industry standard.

**Rationale:** (1) Fixes both lazy-require sites with a single refactor. (2) Restores the option to use `threadStore.ts` from any context (jsdom test, main-process at startup, sub-worker thread) without environment gymnastics. (3) Cheapest durable path: the next person who static-imports `threadStore.ts` doesn't have to know about the Electron lifecycle. (4) Vetted pattern across the Electron ecosystem — not novel.

**Consequences:** `threadStore.ts` adds an `init()` getter (or lazy module-singleton pattern) for the SQLite connection. The four existing static importers (`agentChatEventForwarders.ts`, `mainShutdown.ts`, `softDeleteGc.ts`, `softDeleteGc.test.ts`) keep working — the exported function surface does not change. The two lazy-`require` sites become static imports in Phase 1. Phase 1's acceptance test asserts both `require()` calls are gone AND no module-eval-time `app.getPath` remains.

## Decision 2: Send-path migration is renderer-driven, not bridge-routed

**Context:** Wave 86 introduced `chatCommand:sendMessage` IPC but left production user sends routing through the legacy `agentChat:*` IPC → `chatOrchestrationBridge*` runtime. The new path was registered (`src/main/ipc-handlers/chatStateNewPath.ts:32` onwards) but only the walking-skeleton smoke harness exercised it. Wave 87 must actually migrate the production renderer to the new path.

**Pick:** Renderer's `useAgentChatStreaming.ts` invokes `window.electronAPI.chatCommand.sendMessage(...)` directly; legacy bridge runtime stays in place through Phase 2 (unwired but not deleted) and is hard-deleted in Phase 3 once the new path has run through ≥10 live chat turns without regression.

**Rationale:** Bridge-routing (renderer calls legacy → bridge translates to new path) would leave the legacy bridge as the production entry point indefinitely, defeating the purpose of the migration. Renderer-driven migration moves the contract to the renderer's preload bridge boundary, which is the durable architectural seam. The "in-place but unwired" intermediate state during Phase 2 is the rollback path if Phase 2's smoke regresses.

**Consequences:** Composer UX (queue, draft, optimistic render) rebinds to `chatCommand:sendMessage` + `chatState:diff` arrival in Phase 2. Drafts stay renderer-local (per Wave 86 Decision 4). The 10-live-turns Cole-observed gate at the end of Phase 2 is the empirical safety net; the structural acceptance test confirms the wiring is correct, but the behavioral gate is human observation.

## Decision 3: Hard-delete the legacy bridge in Phase 3 (no tombstone)

**Context:** The legacy `chatOrchestrationBridge*.ts` family is ~14 files (~3000 LOC) of runtime logic that the new state machine fully replaces. Question is whether to delete it cleanly or retain it with a deprecation log behind an error channel.

**Pick:** Hard-delete the entire bridge file family + dependent symbols (`inferSessionId`, `applyStickyLinkFields`, `activeSends`, synthetic-sessionId masquerade, 2-second cleanup delay) + DOM `agent-chat:thread-snapshot` CustomEvent path + four legacy IPC channels. No tombstone, no deprecation log.

**Rationale:** No external consumers exist — the legacy channels were internal-only. The web preload subscriptions in `src/web/webPreloadApisSupplemental.ts:245–248` are the only non-trivial external surface and they migrate to `chatState:*` channels in the same phase (not delete). Phase 0's consumer table is the authoritative deletion checklist; every site is addressed in Phase 3. Tombstones in this case would be dead code that future readers ask about, plus deprecation logs that nobody acts on — net negative.

**Consequences:** ~3000 LOC removed in one phase. The post-Phase-3 chat surface looks and feels identical to Cole; under the hood it is structurally simpler by 14 files. The `eventProjector.ts` file may become deletable if `applyStickyLinkFields` was its only Wave-87-touching surface — to surface during Phase 3 review. The `agentChatEventForwarders.ts` file likely shrinks substantially or deletes entirely.

## Decision 4: `[trace:stream]` retention — KEEP as baseline structural logging

**Context:** Wave 86 retained four legacy `[trace:*]` tags. Wave 87 cleans up the `[trace:agent-record]` 3-site emit chain (100+ session IDs per render — the actual spam source). Question was whether to also remove `[trace:stream]` while sweeping the surface.

**Options considered:**
- *Industry standard (KEEP):* Baseline structural logging at streaming-ingress + receive sites; investigation-specific tags removed only. Per `~/.claude/rules/debug-before-fix.md`: "Remove only the investigation-specific logging after a fix. Baseline structural logging stays."
- *Alternative (REMOVE):* Quieter dev console; have to re-add streaming logs when the next streaming bug surfaces.

**Pick:** KEEP — locked by Cole on 2026-05-12.

**Rationale:** Hot-path emit volume is low (one line per chunk; chunks are batched via `useRafBatchedChunks`). The cost of removing-then-re-adding during the next streaming bug exceeds the dev-console-noise cost of keeping. Conservative default per debug-before-fix.

**Consequences:** Phase 4 deletes only the `[trace:agent-record]` 3-site chain. The four surviving `[trace:stream]` emit sites are `claudeCodeSubagentHandler.ts:88,117`, `useAgentChatStreaming.ts:175`, `useRafBatchedChunks.ts:33` (the fifth at `agentChatEventForwarders.ts:97` deletes with that file in Phase 3, incidentally). The four permanent tags become `[trace:identity]`, `[trace:event]`, `[trace:state]`, `[trace:stream]`.

## Decision 5: Orchestrator-owned acceptance tests on Phases 1 and 2

**Context:** Phases 1 and 2 both cross the renderer↔main IPC boundary (state-machine ingress + send-path migration). Per `~/.claude/rules/orchestrator-owned-acceptance-tests.md`, boundary phases require an acceptance test authored by the orchestrator that the implementing subagent may not modify. Gamify Wave 1 Phase 5 (the rule's source incident) is exactly the failure mode this defends against.

**Pick:** Orchestrator authored failing acceptance tests at `acceptance/phase-1-shadow-path-fires.test.ts` and `acceptance/phase-2-send-path-migration.test.ts` during Phase 0. Both are verified to FAIL against the Phase 0 baseline before dispatching the respective phase. The dispatch brief for Phases 1 and 2 explicitly forbids modifying these files.

**Rationale:** Acceptance test ownership ensures the subagent's mental model of the boundary contract bends to match the orchestrator's, not the reverse. Wave 86's smoke pass record (result brief §"Smoke pass record") shows two cascading regressions where subagents trusted their own contract assertions; this rule closes that gap for Wave 87.

**Consequences:** Phase 1's acceptance test uses structural assertions (no lazy `require`, no module-eval `app.getPath`) because the production bundle issue is Vite-specific and doesn't reproduce under vitest. Phase 2's acceptance test combines structural assertions (renderer hook source contains/excludes specific patterns) with a runtime smoke (new path dispatches `status_changed:submitting`). Subagents implement against these; orchestrator re-runs each test post-dispatch and treats PASS as the gate.

## Decision 6: No new IPC channels in this wave (amended by Decision 8)

**Context:** Wave 86 introduced all the new channels (`chatState:snapshot`, `chatState:diff`, `chatState:error`, `chatCommand:*`). Wave 87's mandate is activate + retire, not extend. Question is whether a phase might surface the need for an additional channel.

**Pick:** No new IPC channels. If a wiring gap surfaces that requires a new channel, halt and surface to Cole.

**Rationale:** Scope discipline. Adding a channel mid-wave is the kind of scope creep that produces "we'll come back to this" technical debt. The existing channels were designed for the full activation path; if they fall short, the surfaced design gap is itself worth user attention.

**Consequences:** Phase 3's web-preload migration (`webPreloadApisSupplemental.ts`) uses the existing `chatState:diff/<threadId>` and `chatState:snapshot/<threadId>` channels — no new web-specific channel. If `mobileAccess/channelCatalog.read.ts` needs reshuffling to accommodate the new channels (Phase 0 surfaced this), Phase 3's subagent applies the existing classification scheme; no new channels are coined.

**Amendment (2026-05-12):** Decision 8 grants a single same-wave exception for `chatCommand:cancelTurn`. Rationale documented there.

## Decision 7: Phase 2 send-path coordinator (post-architect-pass)

**Context:** Initial Phase 2 dispatch produced a clean renderer-side migration that exposed a critical gap: the new-path main handler (`src/main/ipc-handlers/chatStateNewPath.ts:172-203`) is a Wave 86 Phase 1 walking skeleton that calls `spawnStreamJsonProcess({prompt, cwd})` directly, bypassing the entire `OrchestrationAPI` pipeline. The legacy bridge owns settings resolution, context packet building, attachment materialization, git pre-snapshot capture, hooks dispatch, conversation history serialization, and provider adapter selection — none of which the new path has. Phase 2 architect blueprint (`phase-2-architecture-blueprint.md`) surfaced four integration-shape options.

**Options considered:**
- *Option A — reuse `preparePendingSend` + `OrchestrationAPI` from new handler.* Lower upfront cost; keeps `OrchestrationAPI` as send-pipeline owner. Wave 86 spec says state machine is the only mutation surface, so A defers the architectural correction.
- *Option B — duplicate TaskRequest/settings logic in the new path.* Standalone but creates a second preparation source. Wave 86 forbids two preparation sources; divergence risk is high.
- *Option C — lift `preparePendingSend` + provider dispatch into a shared module both paths consume.* Bridge and new path become co-equal callers. Correct extraction, but bridge remains a peer until Phase 3.
- *Option D — new-path coordinator becomes the send-pipeline owner; legacy bridge becomes a temporary adapter that delegates to it.* Combines C's extraction with state-machine-first ownership inversion.

**Pick:** Option D — `src/main/agentChat/chatSendCoordinator.ts` owns the send pipeline from Phase 2A onward. Shared preparation helpers (lifted out of bridge files into a non-bridge module) are consumed by the coordinator. Legacy bridge becomes a thin adapter that delegates to the coordinator until Phase 3 deletes the bridge entirely.

**Rationale:** Wave 86's design spec (`docs/superpowers/specs/2026-05-11-chat-orchestration-state-architecture-design.md:137-164,338-342`) mandates `EventNormalizer → ChatSessionStateMachine → ChatStateBroadcaster` as the canonical event flow and the state machine as the sole mutation surface. Option D matches that target architecture from the day Phase 2A ships, not after Phase 3 cleanup. Phase 3 then deletes only the bridge adapter glue, not the send pipeline. Decision 6's "no new channels" reading still holds — enriching `chatCommand:sendMessage`'s payload type on the existing channel is type expansion, not a new channel.

**Consequences:** Phase 2 splits into 2A (main-process build-out: coordinator, enriched `ChatCommandPayload`, shared preparation module, integration with new-path state machine) and 2B (renderer cutover against the now-complete handler). 2A and 2B are sequential — 2B cannot prove behavioral parity until 2A owns the real send pipeline. Estimated 5-8 files + 300-600 LOC for 2A; 3-5 files + ~80-120 LOC for 2B. The waveplan's original single-phase Phase 2 row is superseded by this split.

## Decision 8: `chatCommand:cancelTurn` channel — same-wave Decision-6 exception

**Context:** Phase 2's parity goal requires the composer's stop button to work. The legacy bridge uses `agentChat:cancelTask` / `cancelByThreadId` IPC routed to provider adapters' cancellation logic. The new-path channel set (`src/shared/ipc/chatStateChannels.ts:13-40`) has no cancel command, even though canonical events model `turn_cancelled` (`src/shared/types/canonicalChatEvent.ts:212-221`). Three options were considered: (a) defer stop-button parity until a later ADR, (b) keep legacy cancel IPC alive until Phase 3, (c) approve a same-wave exception for `chatCommand:cancelTurn`.

**Pick:** (c) Add `chatCommand:cancelTurn` channel in Phase 2A.

**Rationale:** (a) is unacceptable — the stop button is load-bearing UX; can't ship a wave that breaks it. (b) is pragmatic but produces a hybrid send-new/cancel-legacy renderer state for the Phase 2-Phase 3 interim, which is hard to reason about and means Phase 3 must coordinate cancel migration AND bridge deletion simultaneously. (c) is mechanical completion of Wave 86's design — the `turn_cancelled` canonical event already exists, the renderer's stop button already exists, the provider adapter cancel logic already exists; only the channel-name + handler glue is missing. Phase 3 then has cleaner scope: delete the bridge, nothing else.

**Consequences:** Decision 6 is amended (see above) to acknowledge this single exception. Phase 2A registers `chatCommand:cancelTurn` with `{ turnId: string }` payload. The handler calls the relevant provider-adapter cancel API and dispatches `turn_cancelled` to the broadcaster. The renderer's stop button binds to `window.electronAPI.chatCommand.cancelTurn(turnId)`. The legacy `agentChat:cancelTask` / `cancelByThreadId` IPC handlers stay in place but unwired through Phase 2; Phase 3 deletes them with the bridge.

## Decision 9: Canonical event metadata for resolved send options

**Context:** The legacy bridge captures `preSnapshotHash` (git HEAD before the turn — load-bearing for revert) and resolves provider/model/effort/permissionMode from settings + overrides at send time. These are turn-scoped state. The new architecture's canonical events currently carry only `turn_submitted.content`. Question is where this resolved state lives in the new architecture.

**Options considered:**
- Extend `turn_submitted` canonical event metadata to carry the resolved fields (visible to state machine and all observers, survives crash recovery via persistence).
- Keep canonical events minimal; persist resolved fields as message metadata only.
- Use projection-time sticky merge rules to attach resolved fields to thread state.

**Pick:** Extend `turn_submitted` canonical event metadata with `preSnapshotHash`, `resolvedProvider`, `resolvedModel`, `resolvedEffort`, `resolvedPermissionMode`. `routedBy` (telemetry/classifier provenance) and any other pure-telemetry fields go to persistence-only message metadata. No projection-time sticky merge rules.

**Rationale:** Resolved provider/model/effort/permissionMode are decisions made at turn-submit time that determine the entire turn's behavior; they belong on `turn_submitted` so the state machine and observers see them as part of the canonical event timeline. `preSnapshotHash` is identical in shape — turn-scoped, set once at submit, never mutated. Sticky merge rules are explicitly named as architecture leaks in the Wave 86 spec (`docs/superpowers/specs/2026-05-11-chat-orchestration-state-architecture-design.md:53-58`); we don't reintroduce them. Pure telemetry (`routedBy`, classifier confidence) doesn't drive state-machine behavior and clutters the canonical event union unnecessarily — persistence-only is correct.

**Consequences:** `CanonicalChatEvent.turn_submitted` type extends with five new fields. `EventNormalizer.fromCommand` populates them from the enriched `ChatCommandPayload`. State machine and broadcaster pass them through untouched. Persistence layer (`ChatPersistenceLayer.commitMessage` and friends) reads them when committing the turn's user message. Crash recovery rebuilds them from persistence on restart. No projector merge logic.

## Decision 10: Rewrite Phase 2 acceptance test for behavioral parity

**Context:** The original Phase 2 acceptance test at `acceptance/phase-2-send-path-migration.test.ts` asserts (1) renderer source references `chatCommand.sendMessage`, (2) renderer source no longer references `electronAPI.agentChat.send*`, (3) a synthetic `command_event` dispatched on a fresh broadcaster yields `status_changed:submitting`. Assertion (3) is too weak — it exercises the broadcaster directly, not the full send pipeline. Codex's original Phase 2 dispatch passed all three assertions while producing a regression (composer overrides silently dropped).

**Pick:** Rewrite the test before Phase 2A dispatches. New contract asserts: (a) the renderer invokes `chatCommand.sendMessage` with the full enriched payload shape (`{ threadId, workspaceRoot, content, attachments?, contextSelection?, overrides?, metadata, skillExpansion? }`); (b) the main-process handler reaches `chatSendCoordinator` (or equivalent boundary symbol Phase 2A introduces); (c) `turn_submitted` carries the resolved metadata fields from Decision 9; (d) a simulated terminal event drives `message_committed` dispatch; (e) the renderer no longer references any `electronAPI.agentChat.send*` paths.

**Rationale:** The orchestrator-owned acceptance test is the contract that binds the subagent's mental model to the orchestrator's. A test that grep-asserts on source strings and synthetic-broadcaster-dispatches doesn't bind enough — the subagent can satisfy it while shipping a feature-incomplete handler. The rewritten test asserts on the actual pipeline behaviour. Per `~/.claude/rules/orchestrator-owned-acceptance-tests.md`'s source authority: "two different streams of tests cause the implementer to think much more deeply about the structure of the code."

**Consequences:** The acceptance test file is rewritten by the orchestrator before Phase 2A dispatches. The new test imports the coordinator module Phase 2A creates (which requires the orchestrator to specify the module path + symbol name in the test, locking that part of the API surface ahead of the implementation). The subagent must build to the contract; if they want a different module shape, they surface to the orchestrator instead of modifying the test.
