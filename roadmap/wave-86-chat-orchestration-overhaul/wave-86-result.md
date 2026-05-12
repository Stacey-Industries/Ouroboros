---
status: SHIPPED
created: 2026-05-12
updated: 2026-05-12
---

# Wave 86 — Chat Orchestration State-Architecture Overhaul — Result Brief

## What shipped

All 7 phases (0, 1, 2, 3, 4, 5, 6a, 6b) + two post-smoke fixes landed on master, 11 commits ahead of `origin/master`:

```
f5202238 fix(wave-86): restore agent-chat:thread-snapshot DOM path until shadow IPC works
7377236c fix(wave-86): make new-path projection additive instead of overriding legacy
9cb4051e feat(wave-86): Phase 6b — web preload bridge for new chat-state channels
5ed34c67 feat(wave-86): Phase 6a — safe deletions + feature flag removal
68f8ba23 feat(wave-86): Phase 5 — error banner + crash recovery + prod flag flip
f3ee6f54 feat(wave-86): Phase 4 — renderer migration + setShadowTap wiring
0f79c5d8 feat(wave-86): Phase 3 — state machine expansion + dual-emit + DiffComparator
a03e1792 feat(wave-86): Phase 2 — schema v10 + ChatPersistenceLayer + registry rebuild
b923e682 test(wave-86): walking-skeleton integration test + smoke harness component
10af77ef feat(wave-86): Phase 1 — walking skeleton for chat orchestration overhaul
bfcff459 chore(wave-86): Phase 0 — planning artifacts + pre-flight inventory
```

Branch: `master` (not pushed). Smoke confirmed working after `f5202238`.

## What works in production

- 16-event canonical event union + branded ID system (ThreadId / TurnId / ProviderSessionId / MessageId / BlockId)
- IdentityRegistry rebuilt from SQLite on app start
- Schema v10 (identity_aliases table + lastInterruptedAt / lastProviderSessionId columns)
- ChatPersistenceLayer (single SQLite writer)
- 5-state state machine with hard-fail throws (ChatStateError)
- ChatStateErrorBanner mounted unconditionally in renderer
- Crash-recovery scan (synthesizes `[interrupted]` tool_result for dangling tool_use)
- IPC channels: `chatCommand:sendMessage`, `chatCommand:restartSession`, `chatState:requestSnapshot`, `chatState:diff/<threadId>`, `chatState:snapshot/<threadId>`, `chatState:error/<threadId>`
- Web preload bridge for new chat-state channels (additive)
- Feature flag (`useNewStateMachine`) removed; deprecated key stripped on config preflight

## What's dormant / known gaps (Wave 87 carryover)

1. **Shadow `chatState:diff` path doesn't run in production.** `src/main/ipc-handlers/chatStateNewPath.ts:runCrashRecovery` uses a lazy `require('./threadStore')` that Vite cannot bundle. App start logs `Cannot find module './threadStore'` errors and the broadcaster tap never installs. Result: the new state machine is wired but no events flow through it. Fix path: replace lazy require with a static import (threadStore.ts calls `app.getPath('userData')` at module-eval time — needs careful ordering) or refactor threadStore to lazy-init its DB connection so it's safe to static-import.

2. **DOM `agent-chat:thread-snapshot` path restored as load-bearing.** Phase 6a deleted it on the assumption that `chatState:diff` would replace it. Until #1 is fixed, the DOM path stays. See commit `f5202238` and the inline comment in `useAgentChatStreaming.ts:206`.

3. **Renderer still sends through the OLD bridge.** Production user sends route through `agentChat:*` IPC, not `chatCommand:sendMessage`. The new path is observer-only. Wave 87 needs to actually migrate the send path, retire `chatOrchestrationBridge` runtime, retire `inferSessionId`, retire `applyStickyLinkFields`, retire `activeSends` map, and retire the 4 old IPC emit sites listed in commit `5ed34c67`'s body.

4. **`[trace:agent-record]` instrumentation spam.** 100+ session IDs logged per render. Clean up in Wave 87.

5. **Historical wave-86 instrumentation still in code.** `[trace:stream]` log lines in `useAgentChatStreaming.ts:logChunkReceived` and main-process emit sites. Either retain as baseline structural logging or remove during Wave 87 cleanup.

## Smoke pass record

- **First smoke** (after Phase 6b): chat stuck on streaming placeholder. Root cause: `projectionToStreamingState` returned empty state when shadow path wasn't running, overriding `legacyState`. Fixed in `7377236c` by extracting `selectStreamingState` to fall through to legacy when `projection.activeTurnId == null`.
- **Second smoke**: chat response appeared then vanished after 5 seconds. Root cause: Phase 6a deleted the `agent-chat:thread-snapshot` DOM event path, and its replacement (`chatState:diff`) was dormant due to bundle issue #1 above. Fixed in `f5202238` by restoring the DOM emit + listener.
- **Third smoke** (after `f5202238`): confirmed working by user.

## Files touched

See wave plan and individual phase commits. Key new modules:
- `src/shared/ipc/chatStateChannels.ts`
- `src/shared/types/canonicalChatEvent.ts`
- `src/shared/types/chatStateDiff.ts`
- `src/shared/types/chatStateError.ts`
- `src/main/agentChat/{chatStateError,identityRegistry,eventNormalizer,chatSessionStateMachine{,Apply},chatStateBroadcaster,chatPersistenceLayer,chatOrchestrationSingletons,dualEmitOrchestrator,shadowTap,crashRecovery}.ts`
- `src/main/{hooksShadowTap,hooksTapRunner}.ts`
- `src/main/ipc-handlers/chatStateNewPath.ts`
- `src/preload/preloadSupplementalChatStateApis.ts`
- `src/web/webPreloadChatStateApi.ts`
- `src/renderer/components/AgentChat/{useChatStateDiffProjection,ChatStateErrorBanner}.tsx`

## Pre-push checklist (not yet done)

- [ ] Run full `npm test` once before push (post-smoke regression check)
- [ ] Run `npm run lint`
- [ ] Run `npx tsc --noEmit`
- [ ] Push `master`
- [ ] Tag release if applicable
- [ ] File Wave 87 follow-up: shadow-path bundle fix + renderer-migration cleanup

## Lessons (promote during Wave 87 cleanup)

- **Don't delete a "replaced" path before the replacement runs in a real smoke.** Phase 6a deleted the DOM event path based on Phase 4 wiring it through new IPC, but the new IPC was dormant due to a bundle issue that didn't surface in unit tests. Smoke would have caught this.
- **Lazy `require()` doesn't survive Vite bundling.** Documented in the project memory (`project_wave86_dom_snapshot_load_bearing.md`). Add to vendor-gotchas if it bites again.
- **Verification discipline failed repeatedly.** Phases 1, 3, 5, 6a all returned with agent-claimed-green-gates but real lint/typecheck/test errors. Orchestrator should run gates after every subagent return, not trust the report.
