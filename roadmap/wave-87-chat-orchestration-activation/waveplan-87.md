---
status: DRAFT
created: 2026-05-12
updated: 2026-05-12
---

# Wave 87 — Chat Orchestration Activation & Legacy Bridge Retirement

## Status

DRAFT · target v2.17.0 · drafted 2026-05-12.

## Context — why this wave exists

Wave 86 (Chat Orchestration State-Architecture Overhaul) shipped on 2026-05-12 — branch `master`, 12 commits, smoke-confirmed in dev, push complete at `271ffe77`. The new state machine surface (16-event canonical union, `IdentityRegistry`, `EventNormalizer`, `ChatSessionStateMachine`, `ChatStateBroadcaster`, `ChatPersistenceLayer`, schema v10, `ChatStateErrorBanner`, crash recovery) is **wired but dormant in production**. The result brief at `roadmap/wave-86-chat-orchestration-overhaul/wave-86-result.md` §"What's dormant / known gaps" enumerates the carryover surface this wave closes.

**Three concrete dormancy mechanisms** confirmed in the codebase before drafting:

1. **The shadow tap never installs.** `src/main/ipc-handlers/chatStateNewPath.ts:93` uses `require('../agentChat/threadStore')` inside `runCrashRecovery()`. The lazy-require is documented at lines 20–23: "threadStore.ts calls `app.getPath('userData')` at module-eval time. Importing it statically would crash test environments where Electron's `app` is not available." Vite drops the dynamic `require` during main-process bundling; app start logs `Cannot find module './threadStore'` errors; the broadcaster tap never installs; `chatState:diff` IPC never fires.
2. **Production sends bypass the new path entirely.** Renderer's composer in `useAgentChatStreaming.ts` still calls the legacy `agentChat:*` IPC via `chatOrchestrationBridge*.ts`. `chatCommand:sendMessage` is registered (`chatStateNewPath.ts:32` and onward) but only the walking-skeleton smoke harness exercises it. Result: the new state machine, even after fix (1), would still be observer-only on a path nothing observes.
3. **Legacy bridge symbols still load-bearing.** `inferSessionId()`, `applyStickyLinkFields()`, the `activeSends` map, the synthetic-sessionId-as-threadId masquerade, and the `agent-chat:thread-snapshot` DOM CustomEvent path were scheduled for deletion in Wave 86 Phase 6a (commit `5ed34c67`). They were partially deleted, then `f5202238` restored the DOM event path explicitly because of (1) and (2). Grep confirms 17 files still reference one or more of `inferSessionId|applyStickyLinkFields|activeSends`.

**Companion follow-ups in `roadmap/follow-ups/`** that this wave's send-path migration may also resolve (re-evaluate at Phase Z, do NOT pull into scope mid-wave):

- `2026-05-07-chat-streaming-freezes-on-project-switch.md` — likely a leak from the legacy bridge's send queue surviving project context changes; new path owns no such queue.
- `2026-05-07-context-preview-rules-disappear-after-chat-start.md` — possibly orthogonal; check after send-path migration.
- `2026-05-07-queued-message-no-autosend-and-text-reappears.md` — likely a `chatOrchestrationBridge.activeSends` artifact; should resolve when `activeSends` is gone.
- `2026-05-11-chat-streaming-render-freeze-hypothesis-disproven.md` — symptom probably gone with the additive `selectStreamingState` projection (commit `7377236c`); confirm closed.

**Wave 85 (Flow Tracer) status.** Still on `wave-85-flow-tracer`, local-only. Out of scope for Wave 87 — verify and decide whether to push/merge in a separate session. Mentioned only so the next agent doesn't conflate the two.

## Goal

Production chat sends route through `chatCommand:sendMessage`; `chatState:diff` IPC observably fires for every chat turn; the legacy `agentChat:*` IPC bridge, the `agent-chat:thread-snapshot` DOM event path, and the five legacy bridge symbols (`inferSessionId`, `applyStickyLinkFields`, `activeSends`, synthetic-sessionId masquerade, 2-second cleanup delay) are all hard-deleted from the codebase. The `[trace:agent-record]` 100-IDs-per-render spam is gone; `[trace:stream]`, `[trace:identity]`, `[trace:event]`, `[trace:state]` remain as the four permanent structural log tags. The chat surface looks and behaves identically to Cole; under the hood the new state machine owns canonical state and the legacy bridge is gone.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/wave-87-chat-orchestration-activation/wave-87-decisions.md`.

1. **Bundle fix via lazy-init of the DB connection in `threadStore.ts`**, not via deferring through `app.whenReady()`. `threadStore.ts` is refactored so module-eval is side-effect-free; `app.getPath('userData')` moves into an `init()` getter called on first DB access. Static import then works everywhere including jsdom test environments where Electron's `app` is not available. Spectrum: *industry standard* (Electron singletons with delayed initialization use lazy-init getters; covered in electron-store, better-sqlite3, and most production Electron apps). Defer-via-`app.whenReady()` would be a localized workaround that leaves the underlying "module-eval touches Electron" hazard intact for every future static importer of `threadStore.ts`.

2. **Send-path migration is renderer-driven, not bridge-routed.** `useAgentChatStreaming.ts` is rewritten to invoke `window.electronAPI.chatCommand.sendMessage(...)` directly (with thread hydration via `chatState:requestSnapshot`); it no longer calls the legacy bridge IPCs. The composer's existing UX (queue, draft, optimistic render) re-binds to the new path. The legacy `chatOrchestrationBridge*` runtime is preserved through Phases 1–2 and deleted in Phase 3 once the new send path has run through ≥10 real chat turns without regression.

3. **Hard-delete the legacy bridge** in Phase 3, no tombstone, no deprecation log. The only consumers were the web preload subscriptions (`src/web/webPreloadApisSupplemental.ts`) which are migrated to the new `chatState:*` channels in the same phase. Phase 0's grep is the authoritative consumer list; Phase 3 addresses every entry. No external consumers exist (no public IPC surface).

4. **`[trace:stream]` stays** as baseline structural logging at the streaming-ingress and renderer-receive sites (`useAgentChatStreaming.ts:logChunkReceived` + main-process emit sites), per `~/.claude/rules/debug-before-fix.md` "Baseline structural logging stays." The Phase 4 cleanup removes only the `[trace:agent-record]` spam, not the canonical streaming traces. Locked by Cole on 2026-05-12.

5. **Orchestrator-owned acceptance tests fire on Phases 1 and 2** per `~/.claude/rules/orchestrator-owned-acceptance-tests.md`. Phase 1's test asserts that `chatState:diff` IPC fires end-to-end for a turn dispatched through the new path. Phase 2's test asserts that a renderer-originated `chatCommand:sendMessage` reaches `ChatSessionStateMachine.dispatch(turn_submitted)` and produces a `chatState:diff` observable on the broadcaster (i.e., the renderer's send call is the change-site terminus, not the legacy bridge). Both tests live at `roadmap/wave-87-chat-orchestration-activation/acceptance/phase-{1,2}-*.test.ts`; subagents may not modify them.

6. **No new IPC channels in this wave.** All channels were introduced in Wave 86. Wave 87 activates them and retires the old ones. If a wiring gap surfaces that would require a new channel, halt and surface to Cole — do not invent one mid-wave.

## Scope

**In scope:**

- `src/main/agentChat/threadStore.ts` — lazy-init refactor (Decision 1). Single module touched; static-importer surface is preserved with the same exported function signatures.
- `src/main/ipc-handlers/chatStateNewPath.ts` — replace the lazy `require('../agentChat/threadStore')` at line 93 with a static import; update module-level comment block (lines 20–23) to reflect the fix.
- `src/renderer/components/AgentChat/useAgentChatStreaming.ts` — migrate the send path from legacy `agentChat:*` IPC to `chatCommand:sendMessage`; rebind queue / draft / optimistic-render to new path.
- `src/renderer/components/AgentChat/agentChatStore.ts` + `agentChatWorkspaceSupport.ts` — read state from `chatState:diff` and `chatState:snapshot` only; remove any remaining legacy projection reducers.
- Deletions (Phase 3, authoritative list from Phase 0 grep):
  - `src/main/hooksDispatchLogic.ts` — `inferSessionId()` function + all call sites
  - `src/main/agentChat/eventProjector.ts` — `applyStickyLinkFields()` + all call sites
  - `src/main/agentChat/chatOrchestrationBridge.ts` + `chatOrchestrationBridgeSend.ts` + `chatOrchestrationBridgeProgress.ts` + `chatOrchestrationBridgeProgressHelpers.ts` + `chatOrchestrationBridgePersistHelpers.ts` + `chatOrchestrationBridgeMonitor.ts` + `chatOrchestrationBridgeTypes.ts` + `chatOrchestrationBridgeGit.ts` — entire legacy bridge runtime (`activeSends`, synthetic-sessionId masquerade, progress handlers, 2-second cleanup delay)
  - `src/main/ipc-handlers/agentChatEventForwarders.ts` — the four legacy emit sites (`agentChat:thread`, `agentChat:status`, `agentChat:stream`, and the misnamed renderer subscriptions)
  - `src/renderer/components/AgentChat/useAgentChatStreaming.ts:206` — `agent-chat:thread-snapshot` CustomEvent emit
  - `src/renderer/components/AgentChat/agentChatWorkspaceSupport.ts` — `agent-chat:thread-snapshot` CustomEvent listener
  - `src/web/webPreloadApisSupplemental.ts` — legacy `agentChat:*` subscription wiring, migrated to `chatState:*`
- `[trace:agent-record]` cleanup (Phase 4):
  - Remove the 3-site emit chain: `hooksDispatchLogic.ts`, `useAgentEvents.ruleSkillDispatchers.ts`, `ComposerContextPreview.tsx`, and the consumer in `agentChatEventForwarders.ts`
  - Remove `claudeCodeSubagentHandler.ts` and `useRafBatchedChunks.ts` references (incidental from the grep)
- Test fixtures updated for the new ingress shape (acceptance tests + impacted unit/integration tests)
- Companion follow-up re-evaluation at Phase Z (4 files)

**Out of scope:**

- Wave 85 (Flow Tracer) push/merge — separate branch, separate decision; verify state in a different session.
- Mention types (@url, @web, @thread, @diff/@commit) — feature work; separate wave.
- System prompt visibility (#21) — UX feature; not state-architecture.
- Per-hunk accept/reject in diff review (#43) — separate wave.
- `AgentChatConversation.tsx` line-count refactor — known tech debt deferred from Wave 86.
- Hydration cap (Wave 86's Phase 7 deliverable was not implemented; deferred again — separate wave once the new path is stable in prod).
- Any new IPC channels (Decision 6).
- Any *new* features on the chat surface. This is a cleanup/activation wave only.
- `threads.db` GC policy or migration to userData-locked path (separate from the lazy-init refactor; surfaces only if Phase 1 reveals it).

## Phases

| Phase | Topic | Implementer | Notes |
|---|---|---|---|
| 0 | ADR + pre-flight inventory | orchestrator | Transcribe Locked decisions into `wave-87-decisions.md`. Run authoritative greps and write the per-symbol consumer table to `phase-0-results.md`: (a) every file/line referencing `inferSessionId`, `applyStickyLinkFields`, `activeSends`, the synthetic-sessionId masquerade, `agent-chat:thread-snapshot`, the four legacy IPC channels `agentChat:thread\|status\|stream` (and the `hooks:event` retain decision); (b) every file/line referencing `[trace:agent-record]` and `[trace:stream]`; (c) every static importer of `threadStore.ts` (so Phase 1's refactor preserves them). Author the Phase 1 acceptance test scaffold at `acceptance/phase-1-shadow-path-fires.test.ts` (failing — `chatState:diff` does not currently fire); author the Phase 2 acceptance test scaffold at `acceptance/phase-2-send-path-migration.test.ts` (failing — renderer send still routes through legacy bridge). Baseline `npm run lint`, `npx tsc --noEmit`, scoped vitest under `src/main/agentChat`, `src/main/ipc-handlers`, `src/renderer/components/AgentChat` — confirm clean entry state. Output: `wave-87-decisions.md`, `phase-0-results.md`, two failing acceptance test files. |
| 1 | Bundle fix: lazy-init `threadStore.ts` + activate shadow path | sonnet-implementer | **Boundary phase — orchestrator-owned acceptance test at `acceptance/phase-1-shadow-path-fires.test.ts` is the gate (Decision 5; rule: `~/.claude/rules/orchestrator-owned-acceptance-tests.md`).** Refactor `src/main/agentChat/threadStore.ts` so module-eval is side-effect-free: move `app.getPath('userData')` and any other Electron `app.*` calls behind an `init()` function or a lazy getter; the SQLite connection initializes on first use. Static-importer surface is preserved (every existing import keeps working). In `src/main/ipc-handlers/chatStateNewPath.ts`, replace the lazy `require('../agentChat/threadStore')` at line 93 with a static `import` at the top of the file; update the module comment block (lines 20–23) to reflect the fix. Confirm at app start: `runCrashRecovery()` runs without "Cannot find module" errors; the broadcaster shadow tap installs (`setShadowTap()` registers); a dev-build chat turn (using existing legacy send path — the production send path migration is Phase 2) produces visible `[trace:event]` and `[trace:state]` log lines AND the orchestrator-owned acceptance test asserts that `chatState:diff` IPC has fired with a non-empty diff payload for that turn. Update relevant unit/integration tests for any consumers of `threadStore.ts` that broke under the lazy-init refactor. Implementer MUST NOT modify the acceptance test file. |
| 2 | Renderer send-path migration to `chatCommand:sendMessage` | sonnet-implementer | **Boundary phase — orchestrator-owned acceptance test at `acceptance/phase-2-send-path-migration.test.ts` is the gate.** Rewrite `src/renderer/components/AgentChat/useAgentChatStreaming.ts` so that user-initiated sends call `window.electronAPI.chatCommand.sendMessage(...)` instead of the legacy `agentChat:*` IPC path. Thread hydration on chat open uses `chatState:requestSnapshot`. The composer's queue / draft / optimistic-render UX rebinds to the new path: drafts remain renderer-local (per Wave 86 Decision 4), queued messages emit through `chatCommand:sendMessage`, optimistic message render relies on `chatState:diff` arrival (with a short timeout to surface "no response" feedback). The legacy `chatOrchestrationBridge*` runtime stays in place but unwired from the renderer — it no longer receives sends. Acceptance test asserts: simulated renderer `sendMessage` call reaches `ChatSessionStateMachine.dispatch(turn_submitted)`; a `chatState:diff` event is observable on `broadcaster` for that thread within reasonable time; `chatOrchestrationBridge.sendMessage` is NOT invoked for the same call (the test installs a sentinel on the legacy entry point). Phase acceptance gate: 10+ real-IDE chat turns through the new path without regression observed by Cole. Implementer MUST NOT modify the acceptance test file. |
| 3 | Hard-delete legacy bridge + DOM event + dependent symbols | sonnet-implementer | Phase 0's consumer table is the authoritative checklist. Delete: every file in `src/main/agentChat/chatOrchestrationBridge*.ts` (the entire bridge runtime); `inferSessionId()` in `hooksDispatchLogic.ts` and all call sites; `applyStickyLinkFields()` in `eventProjector.ts` and all call sites; the synthetic-sessionId-equals-threadId masquerade in `chatOrchestrationBridgeMonitor.ts` (deleted with the file); the 2-second `syntheticSessionIds` cleanup delay in `hooks.ts`; the four legacy IPC emit sites in `agentChatEventForwarders.ts` (the file's other responsibilities — if any remain — stay); the `agent-chat:thread-snapshot` CustomEvent emit at `useAgentChatStreaming.ts:206` AND its listener in `agentChatWorkspaceSupport.ts`. Migrate `src/web/webPreloadApisSupplemental.ts` legacy subscriptions to `chatState:*` channels. Update every test file that asserted on a deleted symbol or channel — assertions reshape to the new contract. Phase 0's grep MUST return zero matches for `inferSessionId|applyStickyLinkFields|activeSends|agent-chat:thread-snapshot|agentChat:thread\b|agentChat:status\b|agentChat:stream\b` after this phase completes. |
| 4 | Instrumentation cleanup: `[trace:agent-record]` spam removal | sonnet-implementer | Remove the `[trace:agent-record]` 3-site emit chain at `hooksDispatchLogic.ts`, `useAgentEvents.ruleSkillDispatchers.ts`, `ComposerContextPreview.tsx`, plus any forwarder consumer in `agentChatEventForwarders.ts` (or its successor). Sweep the remaining `[trace:agent-record]` matches in `claudeCodeSubagentHandler.ts` and `useRafBatchedChunks.ts` — if they are independent diagnostic emits unrelated to the 3-site chain, leave them with a per-site decision documented in the commit body. **Do NOT remove `[trace:stream]`, `[trace:identity]`, `[trace:event]`, or `[trace:state]`** (Decision 4 — Cole-lockable). Verify in a live dev chat session that the dev-tools console shows a clean log surface: the three permanent traces emit at canonical sites; `[trace:agent-record]` is absent; `[trace:stream]` fires at streaming ingress + receive only. Update any tests that asserted on `[trace:agent-record]` emission. |
| Z | Wave wrap | orchestrator | Full `npm run lint`, `npx tsc --noEmit`, scoped vitest on the touched paths, full vitest at push-time. `/review` mechanical gap-check — address every FLAG. Manual smoke gate per `~/.claude/rules/manual-smoke-gate.md` (UI-bearing wave): four smoke probes per Verification table, each in light AND dark theme. Re-evaluate the four companion follow-ups listed in §Context: mark RESOLVED-BY-OVERHAUL where the new path eliminates the bug class, or carry forward OPEN with explanation. Author `wave-87-result.md`. Run `/promote-vendor-lessons 87` to extract any Claude Code CLI lessons from this wave's commit bodies and result brief into `.claude/vendor-gotchas/claude-code-cli.md`. Commit Phase Z deliverables; push the wave's commits; release the v2.17.0 tag; update CHANGELOG.md. |

### Phase ordering

```
Phase 0 (ADR + pre-flight inventory + failing acceptance test scaffolds)
    ↓
Phase 1 (Bundle fix — shadow path activates)
    ↓                                  ← Gate: acceptance/phase-1-shadow-path-fires.test.ts PASSES
Phase 2 (Renderer send-path migration)
    ↓                                  ← Gate: acceptance/phase-2-send-path-migration.test.ts PASSES + 10+ live chat turns clean
Phase 3 (Hard-delete legacy bridge + dependent symbols)
    ↓                                  ← Gate: Phase 0 consumer table fully resolved (grep zero matches)
Phase 4 (Instrumentation cleanup)
    ↓                                  ← Gate: dev-tools console clean of [trace:agent-record] during a fresh chat turn
Phase Z (Wave wrap)
```

All phases strictly serial. Phase 2 cannot start before Phase 1 (the new path must actually fire before the renderer migrates to it). Phase 3 cannot start before Phase 2 (deletion requires zero callers of the deleted code). Phase 4 cannot start before Phase 3 (the `[trace:agent-record]` spam includes the legacy bridge's own emits; deleting the bridge removes some of the surface area).

## Risks

| Risk | Mitigation |
|---|---|
| Lazy-init refactor in `threadStore.ts` breaks a static importer (test runner, migration script, or a path nobody remembered). | Phase 0's grep of every static importer of `threadStore.ts` is the authoritative list; Phase 1's brief includes that list and the acceptance test for each importer's call site continues to pass. Full vitest at Phase Z catches anything missed. If the refactor surfaces a `threadStore` consumer that requires `app.getPath` at module-eval time for an unrelated reason (storage migration ordering, for instance), halt and surface to Cole — do not introduce a second lazy-require pattern elsewhere. |
| Phase 2's renderer migration loses composer UX features (queue, draft persistence, optimistic render) in the rebind. | The acceptance test asserts the send-and-diff happy path. The 10+-live-turns gate is the user-experience safety net — composer regressions would surface immediately. If a UX feature can't be cleanly rebound (e.g., draft autosave timing), surface to Cole rather than degrading silently. Manual smoke at Phase Z explicitly probes each composer feature. |
| Hard-delete of the legacy bridge (Phase 3) removes a consumer that wasn't on the Phase 0 grep list (e.g., a dynamic `require`, a string-built channel name, a test fixture that mocks the old IPC). | Phase 0's grep targets every literal channel-name string AND every symbol name; Phase 3 also runs `npx tsc --noEmit` after each file deletion to surface broken imports. The full vitest at Phase Z catches runtime breakage. If a hidden consumer surfaces post-Phase 3, the fix is restoration of the specific consumer's needs through the new path, not resurrection of the bridge. |
| The new send path has a latent bug masked by the legacy bridge's fault tolerance (e.g., the legacy bridge silently retries, the new path does not). | Phase 2's 10-turn live gate is the empirical filter; the `ChatStateError` hard-fail discipline (Wave 86 Decision 3) ensures the new path is loud, not silent. If a fault surfaces during the 10 turns, instrument-before-fix per `~/.claude/rules/debug-before-fix.md` — do not paper over with retry logic. |
| `[trace:stream]` retention (Decision 4 — locked KEEP) turns out wrong: noisy logs in production dev sessions. | Locked decision; revisit in a future wave if friction surfaces. Hot-path emit volume is low (one line per chunk; chunks are batched), so the conservative default holds. Investigation-specific `[trace:DEBUG-*]` tags remain the right tool for one-off debugging. |
| The four companion follow-ups (§Context) are NOT resolved by the activation, leaving them as still-open bugs entering Wave 88. | Phase Z re-evaluates each explicitly; carry-forward is acceptable. The wave's goal is the activation + cleanup, not the bug closure. Cole's expectation managed at result-brief time. |
| `/review` mechanical gap-check FLAGs the hard deletion of the legacy bridge as "missing fallback" or "missing error handling" (the bridge had elaborate retry/timeout logic that the new path intentionally does not). | Each deletion site in Phase 3's commit body cites Wave 86's Decision 3 (hard-fail on impossible states) and the spec §4.3 location. The `/review` author (orchestrator) addresses each FLAG with the citation. The new path's `ChatStateError` throws + `ChatStateErrorBanner` ARE the fallback. |
| Manual smoke at Phase Z surfaces a regression that requires a Phase 5 hot-fix mid-wave. | The smoke gate is the rollback signal; if a probe fails, halt the push and add a Phase 5 in the orchestrator dispatch checklist. Push only proceeds with all probes signed. |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| 0 | n/a | n/a | ADR + pre-flight + failing acceptance test scaffolds; no implementation. |
| 1 | `threadStore.ts` lazy-init: first call after module load triggers `app.getPath` resolution; subsequent calls reuse the connection; explicit `init()` call is idempotent. Unit tests cover the new getter pattern. | **Orchestrator-owned acceptance test** at `acceptance/phase-1-shadow-path-fires.test.ts`: simulates app start in a test harness that mocks `app.getPath('userData')` to a tmp dir; runs `runCrashRecovery()`; asserts no `Cannot find module` errors; subscribes to `chatState:diff/<threadId>`; dispatches a synthetic turn through the existing legacy send path; asserts `chatState:diff` IPC is observable with non-empty diff payload. Honeycomb shape — the seam between Vite bundling + Electron `app` lifecycle + the SQLite DB connection is exactly where Wave 86's bug lived. |
| 2 | Renderer-side: `useAgentChatStreaming.ts` send method invokes `chatCommand.sendMessage`; queue/draft helpers route through new path; optimistic-render rebinds to `chatState:diff` arrival. Unit tests cover the rebound helpers with the legacy bridge mocked out. | **Orchestrator-owned acceptance test** at `acceptance/phase-2-send-path-migration.test.ts`: simulates renderer `sendMessage` call; asserts `ChatSessionStateMachine.dispatch(turn_submitted)` is invoked; asserts `chatState:diff` event fires on the broadcaster for that thread; installs a sentinel on legacy `chatOrchestrationBridge.sendMessage` and asserts it is NOT invoked. Honeycomb — renderer↔main IPC boundary. |
| 3 | n/a — deletion phase. | Existing AgentChat + orchestration vitest suites continue to pass after deletions (or are updated to assert on new contract). | Phase 0's consumer table is exhaustively resolved; grep is the structural test. |
| 4 | n/a — instrumentation removal. | Tests that asserted `[trace:agent-record]` emission updated to assert its absence (or removed if no longer meaningful). | Decision 4 locked KEEP — do not delete `[trace:stream]` tests. |
| Z | n/a | Full vitest at push-time; full lint; full typecheck; `/review` mechanical gap-check. | Wave wrap; deliverable is the activated path + clean codebase + four follow-ups re-evaluated. |

## Acceptance criteria

- [ ] ADR file `roadmap/wave-87-chat-orchestration-activation/wave-87-decisions.md` exists with the six locked decisions transcribed.
- [ ] Phase 0 `phase-0-results.md` includes (a) consumer table for every deleted symbol and channel, with file:line citations; (b) inventory of `[trace:agent-record]` and `[trace:stream]` emit sites; (c) every static importer of `threadStore.ts`; (d) baseline lint + typecheck + scoped vitest output.
- [ ] `acceptance/phase-1-shadow-path-fires.test.ts` exists and FAILS at end of Phase 0; PASSES at end of Phase 1.
- [ ] `acceptance/phase-2-send-path-migration.test.ts` exists and FAILS at end of Phase 0 (no migration yet); PASSES at end of Phase 2.
- [ ] `src/main/agentChat/threadStore.ts` has no top-level `app.getPath(...)` call after Phase 1 (grep zero); module-eval is side-effect-free.
- [ ] `src/main/ipc-handlers/chatStateNewPath.ts` no longer contains a `require('../agentChat/threadStore')` dynamic require after Phase 1; static import in place.
- [ ] In a live dev IDE session at end of Phase 1, sending a chat turn (via the still-legacy renderer path) produces `[trace:event]` and `[trace:state]` log lines in dev-tools console for that thread, AND `chatState:diff/<threadId>` IPC fires (observable via a temporary preload probe or the existing broadcaster trace).
- [ ] After Phase 2, renderer's user sends invoke `chatCommand.sendMessage` (grep `chatCommand.sendMessage` in `src/renderer/components/AgentChat/` returns non-empty); the renderer no longer calls the legacy `agentChat:*` IPC for sends (grep `electronAPI.agentChat.send` or equivalent returns zero in `useAgentChatStreaming.ts`).
- [ ] After Phase 3, grep returns zero matches across `src/` for: `inferSessionId`, `applyStickyLinkFields`, `agent-chat:thread-snapshot`, the standalone tokens `agentChat:thread`, `agentChat:status`, `agentChat:stream` (channel-name string literals). The `activeSends` map and all `chatOrchestrationBridge*.ts` files are deleted.
- [ ] After Phase 4, grep `[trace:agent-record]` in `src/` returns zero matches in the 3-site renderer chain; remaining matches (if any) have a per-site rationale in the Phase 4 commit body.
- [ ] `[trace:identity]`, `[trace:event]`, `[trace:state]`, and (if Decision 4 locked "keep") `[trace:stream]` emit at canonical sites and are visible in a live chat session.
- [ ] Four companion follow-ups in `roadmap/follow-ups/` re-evaluated at Phase Z — each marked RESOLVED-BY-OVERHAUL or carried forward OPEN with explanation.
- [ ] Full `npm run lint` clean.
- [ ] Full `npx tsc --noEmit` clean.
- [ ] Scoped + full vitest passes.
- [ ] `/review` mechanical gap-check returns PASS or all FLAGs addressed.
- [ ] Manual smoke checklist signed in `wave-87-result.md`; verified in both light and dark theme; covers chat send/receive on a fresh thread, multi-window mirror, crash recovery (induced), composer UX (queue + draft).
- [ ] v2.17.0 tag pushed to origin; CHANGELOG.md entry added.
- [ ] `/promote-vendor-lessons 87` run; `.claude/vendor-gotchas/claude-code-cli.md` updated with Wave 87 lessons (lazy-init pattern for Electron singletons; Vite + dynamic require failure mode).

## Verification

### Per-phase experiential observation

The data-shape probes below confirm the JSON / file-on-disk populates correctly. They do NOT confirm the user observes anything different — that's what this table is for. Each row anchors a phase to a concrete user-facing surface and the full path from change site to observation. See `~/.claude/notes/wave-process.md` "Site 2" for the rule.

| Phase | Observation point | Path to it | What "working" looks like there |
|---|---|---|---|
| 0 | Internal — no observation point | n/a | Phase 0 produces the ADR + pre-flight inventory + two failing acceptance test files consumed by later phases. No user-facing surface. |
| 1 | Cole opens the IDE in a dev build, opens an existing or new chat thread, and sends a message — and then opens the dev-tools console for that renderer window | renderer send → existing legacy `agentChat:*` IPC path (unchanged at Phase 1) → main runtime → `shadowTap` now successfully installed (post-bundle-fix) → `ChatSessionStateMachine.dispatch` fires shadow events → `[trace:event]` and `[trace:state]` log lines emit from `chatSessionStateMachine.ts` → main forwards `chatState:diff/<threadId>` IPC → renderer's existing diff subscriber (Wave 86 Phase 4) receives → dev-tools console renders the trace lines | The chat itself behaves identically to pre-Wave-87 (still routed through legacy bridge — Phase 2 is what changes that). In dev-tools console, Cole sees `[trace:event]` log lines for each canonical event (turn_submitted, provider_session_assigned, text_delta×N, turn_completed) and `[trace:state]` log lines for each state transition for the thread. No `Cannot find module './threadStore'` errors anywhere in the console. |
| 2 | Cole sends a chat message via the main composer UX in a dev IDE build — no debug panel, no special harness | composer keystroke → `useAgentChatStreaming.handleSend` → `window.electronAPI.chatCommand.sendMessage(threadId, content)` IPC (new path) → main `chatStateNewPath.ts` handler → `EventNormalizer.fromCommand` → `IdentityRegistry.registerTurn` → `ChatSessionStateMachine.dispatch(turn_submitted)` → `claudeStreamJsonRunner.spawn` → stream-json events arrive → state machine transitions → `ChatStateBroadcaster.diff` IPC → renderer's projection updates → `AgentChatConversation` re-renders with user message + streaming assistant reply | The user message appears in the conversation immediately on send (optimistic render via diff arrival). The assistant reply streams in word-by-word as before. Cole notices nothing different from the legacy path on the surface. Under dev-tools console: legacy `[trace:stream]` lines from the legacy bridge are GONE for this turn (because the legacy bridge no longer received the send); `[trace:event]` and `[trace:state]` lines fire for the new path. |
| 3 | Internal — no observation point | n/a | Pure deletion phase. The legacy bridge has been unwired from the renderer since Phase 2, so its removal is invisible to Cole — chat send/receive looks and feels identical to Phase 2. The verification surface for this phase is grep zero-matches on the deleted-symbol list (in Data-shape probes), not a user observation. |
| 4 | Cole opens the dev-tools console for the renderer window during a fresh chat send and watches the log surface scroll during a complete turn (idle → submitting → streaming → completing) | composer send (new path from Phase 2) → main `chatStateNewPath.ts` handler → `IdentityRegistry.resolve` emits `[trace:identity]` → `ChatSessionStateMachine.dispatch` emits `[trace:event]` → state-machine `apply()` transition emits `[trace:state]` → `claudeStreamJsonRunner` emits `[trace:stream]` per chunk → main's logger forwards to renderer log forwarder IPC → renderer console receiver → dev-tools console renders the lines | The dev-tools console shows a clean, readable log surface — `[trace:identity]` lines on identity resolutions, `[trace:event]` lines on event dispatches, `[trace:state]` lines on state transitions, `[trace:stream]` lines on streaming chunks (kept per Decision 4). The previous `[trace:agent-record]` flood (100+ session-id lines per render) is absent. Cole can scan the log surface for a single turn without scrolling past unrelated spam. |
| Z | Internal — no observation point | n/a | Wave wrap. Phases 1–4 carry the experiential observations. Phase Z's deliverable is the wave shipping cleanly to master + companion follow-ups re-evaluated. |

### Data-shape probes

```bash
# After Phase 0
test -f roadmap/wave-87-chat-orchestration-activation/wave-87-decisions.md
test -f roadmap/wave-87-chat-orchestration-activation/phase-0-results.md
test -f roadmap/wave-87-chat-orchestration-activation/acceptance/phase-1-shadow-path-fires.test.ts
test -f roadmap/wave-87-chat-orchestration-activation/acceptance/phase-2-send-path-migration.test.ts
# Both acceptance tests should FAIL at end of Phase 0
npx vitest run roadmap/wave-87-chat-orchestration-activation/acceptance/   # expect failures

# After Phase 1
grep -rn "require\\(['\"]\\.\\./agentChat/threadStore" src/main/   # expect zero matches
grep -rn "app\\.getPath" src/main/agentChat/threadStore.ts   # expect zero matches at module top level (allowed inside functions)
npx vitest run roadmap/wave-87-chat-orchestration-activation/acceptance/phase-1-shadow-path-fires.test.ts   # expect PASS

# After Phase 2
grep -rn "chatCommand\\.sendMessage\\|chatCommand:sendMessage" src/renderer/components/AgentChat/   # expect non-empty
grep -rn "electronAPI\\.agentChat\\.send" src/renderer/components/AgentChat/useAgentChatStreaming.ts   # expect zero matches
npx vitest run roadmap/wave-87-chat-orchestration-activation/acceptance/phase-2-send-path-migration.test.ts   # expect PASS

# After Phase 3
grep -rn "inferSessionId\\|applyStickyLinkFields" src/   # expect zero matches
grep -rn "chatOrchestrationBridge" src/main/agentChat/   # expect zero matches (entire family deleted)
grep -rn "agent-chat:thread-snapshot" src/   # expect zero matches
grep -rn "'agentChat:thread'\\|'agentChat:status'\\|'agentChat:stream'" src/   # expect zero matches (channel name string literals)
grep -rn "activeSends" src/   # expect zero matches

# After Phase 4
grep -rn "\\[trace:agent-record\\]" src/renderer/components/AgentChat/   # expect zero matches in 3-site chain
grep -rn "\\[trace:agent-record\\]" src/main/hooksDispatchLogic.ts   # expect zero matches
grep -rn "\\[trace:identity\\]" src/main/agentChat/identityRegistry.ts   # expect emit points
grep -rn "\\[trace:event\\]" src/main/agentChat/chatSessionStateMachine.ts   # expect emit point
grep -rn "\\[trace:state\\]" src/main/agentChat/chatSessionStateMachine.ts   # expect emit point

# After Phase Z
grep -A 5 "v2.17.0" CHANGELOG.md   # expect non-empty section
test -f roadmap/wave-87-chat-orchestration-activation/wave-87-result.md
```

## Files the next agent should read first

1. `roadmap/wave-86-chat-orchestration-overhaul/wave-86-result.md` — Wave 86's result brief; the §"What's dormant / known gaps" section is the source of truth for Wave 87's scope.
2. `roadmap/wave-87-chat-orchestration-activation/wave-87-decisions.md` — ADR scaffold; Phase 0 fills from the Locked decisions above.
3. `roadmap/wave-87-chat-orchestration-activation/phase-0-results.md` — Phase 0's authoritative consumer table; Phase 3's deletion checklist depends on it.
4. `roadmap/wave-87-chat-orchestration-activation/acceptance/phase-1-shadow-path-fires.test.ts` — Phase 1's orchestrator-owned acceptance test; implementer reads but does NOT modify.
5. `roadmap/wave-87-chat-orchestration-activation/acceptance/phase-2-send-path-migration.test.ts` — Phase 2's orchestrator-owned acceptance test; implementer reads but does NOT modify.
6. `src/main/agentChat/threadStore.ts` — the file Phase 1 refactors. Read the current shape end-to-end before editing — specifically every reference to Electron `app.*`.
7. `src/main/ipc-handlers/chatStateNewPath.ts` — the file with the load-bearing lazy `require` at line 93; Phase 1 replaces it. Lines 20–23 are the existing rationale comment to update.
8. `src/main/agentChat/chatOrchestrationBridge.ts` + every sibling `chatOrchestrationBridge*.ts` — the runtime Phase 3 deletes. Read to confirm no consumer outside the deletion surface depends on it.
9. `src/renderer/components/AgentChat/useAgentChatStreaming.ts` — the renderer-side send path Phase 2 rewrites and Phase 3's DOM CustomEvent emit deletes.
10. `src/renderer/components/AgentChat/agentChatStore.ts` + `agentChatWorkspaceSupport.ts` — the renderer-side projection consumers that pair with `useAgentChatStreaming`.
11. `src/main/hooksDispatchLogic.ts` + `src/main/agentChat/eventProjector.ts` — the homes of `inferSessionId` and `applyStickyLinkFields`.
12. `src/web/webPreloadApisSupplemental.ts` — the web preload that subscribes to the legacy channels; Phase 3 migrates it.
13. `docs/superpowers/specs/2026-05-11-chat-orchestration-state-architecture-design.md` — Wave 86's source spec; cite for any decision boundary question.
14. `~/.claude/rules/orchestrator-owned-acceptance-tests.md` — Phase 1 + 2 boundary discipline.
15. `~/.claude/rules/debug-before-fix.md` — anchors Decision 4's `[trace:stream]` retention.
16. `~/.claude/rules/manual-smoke-gate.md` — Phase Z smoke is required (UI-bearing wave).
17. `~/.claude/notes/wave-process.md` — Sites 1/2/3 + honeycomb test doctrine + final-phase wrap order.

## Note to the implementer

Wave 86 built the architecture; Wave 87 turns it on and rips out the old one. The temptation will be to do these moves in parallel — fix the bundle issue and migrate the send path in one commit, or delete the bridge while the new path is still being validated. Resist this. Each phase has a single concern and a single acceptance gate, and the gates are ordered specifically so that a regression at any step surfaces against a known-good baseline. If Phase 1 fixes the bundle but the shadow path doesn't actually emit diffs, that's a Phase 1 problem with a small surface to debug. If Phase 1 fixes the bundle, Phase 2 migrates the send, AND Phase 3 deletes the bridge all in one go, a regression's blast radius is the entire wave's work.

The bundle fix in Phase 1 is the highest-information single change in this wave. Wave 86's smoke pass record (result brief §"Smoke pass record") shows the team chased two cascading regressions after Phase 6a deleted the DOM event path on the assumption the new IPC would catch the load. That assumption was wrong because of the Vite bundle issue. Phase 1 closes that gap by making the new IPC actually fire; everything else in Wave 87 depends on that.

The orchestrator-owned acceptance tests for Phases 1 and 2 (per `~/.claude/rules/orchestrator-owned-acceptance-tests.md`) are written by the orchestrator at Phase 0 and may NOT be modified by the implementing subagent. If the test seems wrong, surface it — do not change it. The test is the contract; if the contract is wrong, the orchestrator updates it after agreement. This rule fires because Phases 1 and 2 cross the renderer↔main IPC boundary, and Wave 86's Phase 5 retrospective (Gamify reference in the rule's "Why this rule exists") is exactly the failure mode it defends against.

Scope creep risk is high in this wave because chat code is dense with adjacent issues. The mention types cluster, the hydration cap (deferred from Wave 86 Phase 7), composer UX polish, `AgentChatConversation.tsx` decomposition — all live in the same files Wave 87 touches. Resist. Surface noticed-but-unrelated items to `roadmap/follow-ups/{date}-{slug}.md` per Tier 3 discipline (`~/.claude/rules/development-pipeline.md`) and keep moving. The four companion follow-ups listed in §Context are explicitly re-evaluated at Phase Z; do not preemptively close or modify them mid-wave.

Decision 4 (`[trace:stream]` retention) was locked KEEP by Cole on 2026-05-12. Phase 4 must NOT delete `[trace:stream]` emit sites — the cleanup is strictly the `[trace:agent-record]` 3-site chain plus the two outlier matches in `claudeCodeSubagentHandler.ts` and `useRafBatchedChunks.ts` (each evaluated individually).

Per existing repo policy: subagents skip full `npm test` (~280s exceeds patience); orchestrator runs scoped vitest on touched paths after each phase commit and full vitest at push-time. Push policy is per-wave, not per-phase — accumulate phase commits locally and push once at Phase Z wrap after `/review` PASS. All Phase implementers in this wave are `sonnet-implementer` (cross-subsystem judgment + boundary work; no haiku-friendly tight-spec phases).

Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

## Orchestrator dispatch checklist

1. **Verify ADR scaffold exists.** Confirm `roadmap/wave-87-chat-orchestration-activation/wave-87-decisions.md` exists with the six locked decisions transcribed from the Locked decisions section above. All six are locked: Decisions 1, 2, 3, 5, 6 from grounding; Decision 4 (`[trace:stream]` retention: KEEP) by Cole on 2026-05-12.
2. **Phase 0 dispatch (orchestrator-only).** (a) Transcribe Locked decisions into the ADR file. (b) Run the consumer greps per the Scope section and write `phase-0-results.md` with a per-symbol consumer table — every file:line reference for `inferSessionId`, `applyStickyLinkFields`, `activeSends`, `agent-chat:thread-snapshot`, the four legacy IPC channels, every static importer of `threadStore.ts`, every `[trace:agent-record]` and `[trace:stream]` emit. (c) Author the two failing acceptance test files at `acceptance/phase-1-shadow-path-fires.test.ts` and `acceptance/phase-2-send-path-migration.test.ts` — both MUST fail when run against current code (the orchestrator runs them locally to confirm failure before dispatching). (d) Run baseline `npm run lint`, `npx tsc --noEmit`, and scoped vitest under `src/main/agentChat`, `src/main/ipc-handlers`, `src/renderer/components/AgentChat` to confirm clean entry state.
3. **Phase 1 dispatch (sonnet-implementer).** Brief: lazy-init refactor of `threadStore.ts` (move `app.getPath('userData')` out of module-eval to a lazy getter; preserve every static importer); replace the lazy `require` in `chatStateNewPath.ts:93` with static import; update the comment block at lines 20–23. **Tools constraint in brief:** "The acceptance test file at `roadmap/wave-87-.../acceptance/phase-1-shadow-path-fires.test.ts` is owned by the orchestrator. You may read it; you may NOT modify it. Implement against it." Acceptance gate: that test passes. Manual gate (orchestrator runs after subagent returns): dev IDE smoke shows `[trace:event]` and `[trace:state]` log lines for a chat turn AND `chatState:diff` IPC observably fires.
4. **Orchestrator diff review of Phase 1.** Verify no `app.getPath` at module-eval in `threadStore.ts`; verify static import in `chatStateNewPath.ts`; verify acceptance test passes; run the live smoke for `[trace:event]` / `[trace:state]` emit. Run `npx tsc --noEmit` + scoped vitest before dispatching Phase 2.
5. **Phase 2 dispatch (sonnet-implementer).** Brief: rewrite `useAgentChatStreaming.ts` send path to `chatCommand.sendMessage`; rebind queue / draft / optimistic-render to new path; legacy bridge runtime stays unwired but un-deleted. **Tools constraint in brief:** "The acceptance test file at `roadmap/wave-87-.../acceptance/phase-2-send-path-migration.test.ts` is owned by the orchestrator. You may read it; you may NOT modify it. Implement against it." Acceptance gate: that test passes. Manual gate: 10+ live chat turns through the new path without regression (Cole observes).
6. **Orchestrator diff review of Phase 2.** Verify `chatCommand.sendMessage` is the renderer's send call; verify acceptance test passes; verify 10+ live turns clean. Run `npx tsc --noEmit` + scoped vitest before dispatching Phase 3.
7. **Phase 3 dispatch (sonnet-implementer).** Brief includes Phase 0's consumer table as the authoritative deletion checklist. Cover: delete every `chatOrchestrationBridge*.ts` file; delete `inferSessionId()` + call sites; delete `applyStickyLinkFields()` + call sites; delete synthetic-sessionId masquerade (gone with the deleted file); delete 2-second `syntheticSessionIds` cleanup delay in `hooks.ts`; delete the four legacy IPC emit sites in `agentChatEventForwarders.ts`; delete `agent-chat:thread-snapshot` CustomEvent emit + listener; migrate `src/web/webPreloadApisSupplemental.ts` subscriptions to `chatState:*` channels; update tests that asserted on deleted symbols. Acceptance gate: grep zero matches for the deleted-symbol list AND existing test suite passes (or is updated for the new contract).
8. **Orchestrator diff review of Phase 3.** Verify Phase 0 consumer table addressed entry-by-entry; verify `npx tsc --noEmit` clean (no broken imports); verify scoped vitest passes.
9. **Phase 4 dispatch (sonnet-implementer).** Brief: remove `[trace:agent-record]` 3-site chain (hooksDispatchLogic, useAgentEvents.ruleSkillDispatchers, ComposerContextPreview, forwarder consumer); investigate the two outlier matches in `claudeCodeSubagentHandler.ts` and `useRafBatchedChunks.ts` — delete if part of the chain, retain with rationale if independent; **DO NOT delete `[trace:stream]`** unless Decision 4 was locked to "remove" by Cole (re-check the ADR before starting). Acceptance gate: grep zero matches for the 3-site chain; dev-tools console clean during a fresh chat turn.
10. **Orchestrator diff review of Phase 4.** Verify the three permanent traces still emit at canonical sites; verify clean log surface in a live chat session.
11. **Phase Z (orchestrator).** Run full `npm run lint`, `npx tsc --noEmit`, scoped vitest, full vitest at push-time. `/review` mechanical gap-check; address all FLAGs. Manual smoke gate per `~/.claude/rules/manual-smoke-gate.md`: four smoke probes (Phase 1 trace visibility, Phase 2 fresh-chat send, Phase 3 multi-window mirror + composer queue, Phase 4 clean dev-tools console), each in light AND dark theme. Re-evaluate the four companion follow-ups: mark RESOLVED-BY-OVERHAUL or carry forward OPEN. Author `wave-87-result.md`. Run `/promote-vendor-lessons 87`. Commit Phase Z deliverables; push wave commits; release v2.17.0 tag; update CHANGELOG.md.
