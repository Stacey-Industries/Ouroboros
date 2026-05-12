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

## Decision 6: No new IPC channels in this wave

**Context:** Wave 86 introduced all the new channels (`chatState:snapshot`, `chatState:diff`, `chatState:error`, `chatCommand:*`). Wave 87's mandate is activate + retire, not extend. Question is whether a phase might surface the need for an additional channel.

**Pick:** No new IPC channels. If a wiring gap surfaces that requires a new channel, halt and surface to Cole.

**Rationale:** Scope discipline. Adding a channel mid-wave is the kind of scope creep that produces "we'll come back to this" technical debt. The existing channels were designed for the full activation path; if they fall short, the surfaced design gap is itself worth user attention.

**Consequences:** Phase 3's web-preload migration (`webPreloadApisSupplemental.ts`) uses the existing `chatState:diff/<threadId>` and `chatState:snapshot/<threadId>` channels — no new web-specific channel. If `mobileAccess/channelCatalog.read.ts` needs reshuffling to accommodate the new channels (Phase 0 surfaced this), Phase 3's subagent applies the existing classification scheme; no new channels are coined.
