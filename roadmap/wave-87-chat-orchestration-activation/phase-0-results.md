---
status: COMPLETED
created: 2026-05-12
updated: 2026-05-12
---

# Wave 87 — Phase 0 Results

Pre-flight inventory + acceptance test scaffolds. Consumed by Phases 1 / 2 / 3 / 4.

## A. Consumer table for symbols + channels scheduled for deletion in Phase 3

### `inferSessionId`

| File | Line | Site |
|---|---|---|
| `src/main/agentChat/chatOrchestrationBridgeProgress.ts` | 175 | Comment only (`// so that inferSessionId can remap...`). Deletes with the bridge file. |
| `src/main/hooks.ts` | 21 | `import { inferSessionId as inferSessionIdLogic } from './hooksDispatchLogic'` |
| `src/main/hooks.ts` | 122 | Wrapper definition `function inferSessionId(payload: HookPayload): HookPayload` |
| `src/main/hooks.ts` | 123 | Usage `inferSessionIdLogic(activeSessions, payload)` |
| `src/main/hooks.ts` | 267 | Call site `const inferred = inferSessionId(rawPayload)` |
| `src/main/hooksDispatchLogic.ts` | 117 | Definition `export function inferSessionId(...)` |
| `src/main/hooksDispatchLogic.test.ts` | 13, 198, 200, 204, 210, 219, 229, 236 | Test imports + describe block + ≥5 individual test cases |
| `src/main/agentChat/walkingSkeleton.integration.test.ts` | 210 | Wave 86 negative-assertion test (`no inferSessionId`). Stays — confirms the absence remains post-deletion. |

**Phase 3 action:** Delete the `inferSessionId` function in `hooksDispatchLogic.ts:117`, the wrapper in `hooks.ts:122`, the import in `hooks.ts:21`, the call sites at `hooks.ts:123,267`. Remove the corresponding test block (`describe('inferSessionId', ...)`) from `hooksDispatchLogic.test.ts:198–236`. Keep the `walkingSkeleton.integration.test.ts:210` test (it asserts the new path does the right thing in absence of `inferSessionId`).

### `applyStickyLinkFields`

| File | Line | Site |
|---|---|---|
| `src/main/agentChat/eventProjector.ts` | 90 | Definition `function applyStickyLinkFields(...)` |
| `src/main/agentChat/eventProjector.ts` | 121 | Call site `applyStickyLinkFields(link, args.thread.latestOrchestration)` |

**Phase 3 action:** Delete the function and its single call site. `eventProjector.ts` may itself be a candidate for deletion depending on whether anything else in main still calls it after Phase 3 — surface during Phase 3 dispatch.

### `activeSends` (entire bridge runtime)

| File | Line range | Site |
|---|---|---|
| `src/main/agentChat/chatOrchestrationBridge.ts` | 60, 78, 83, 96, 100, 152, 156, 222, 224, 239, 245, 251, 253, 259, 265, 277, 285, 290, 294, 295 | ~20 references across runtime, lookup helpers, and revert path. All delete with the file. |
| `src/main/agentChat/chatOrchestrationBridgeGit.test.ts` | 216, 219, 227, 238, 258, 263, 268, 276, 282, 298 | Test fixtures. Delete with the bridge tests. |

**Phase 3 action:** Delete every `chatOrchestrationBridge*.ts` file listed under "Bridge file family" below. The `activeSends` map disappears as a side effect.

### Bridge file family (delete in toto)

```
src/main/agentChat/chatOrchestrationBridge.ts
src/main/agentChat/chatOrchestrationBridgeGit.ts
src/main/agentChat/chatOrchestrationBridgeGit.test.ts
src/main/agentChat/chatOrchestrationBridgeMonitor.ts
src/main/agentChat/chatOrchestrationBridgePersist.ts             (per subsystem CLAUDE.md — not in greps above)
src/main/agentChat/chatOrchestrationBridgePersistHelpers.ts
src/main/agentChat/chatOrchestrationBridgeProgress.ts
src/main/agentChat/chatOrchestrationBridgeProgress.test.ts
src/main/agentChat/chatOrchestrationBridgeProgressHelpers.ts
src/main/agentChat/chatOrchestrationBridgeProgressHelpers.test.ts
src/main/agentChat/chatOrchestrationBridgeSend.ts
src/main/agentChat/chatOrchestrationBridgeSubTools.ts            (per subsystem CLAUDE.md)
src/main/agentChat/chatOrchestrationBridgeSupport.ts             (per subsystem CLAUDE.md)
src/main/agentChat/chatOrchestrationBridgeTypes.ts
```

**Phase 3 action:** Delete each file. Run `npx tsc --noEmit` after each deletion to surface broken imports; resolve every break by either removing the importing line or migrating it to the new path.

### `agent-chat:thread-snapshot` DOM CustomEvent

| File | Line | Site |
|---|---|---|
| `src/renderer/components/AgentChat/useAgentChatStreaming.ts` | 215 | `dispatchEvent(new CustomEvent('agent-chat:thread-snapshot', { detail: chunk.thread }))` |
| `src/renderer/components/AgentChat/agentChatWorkspaceSupport.ts` | 270 | `window.addEventListener('agent-chat:thread-snapshot', handleSnapshot)` |
| `src/renderer/components/AgentChat/agentChatWorkspaceSupport.ts` | 276 | `window.removeEventListener('agent-chat:thread-snapshot', handleSnapshot)` |
| `src/renderer/out/renderer/assets/index-3td00_gP.js` | 88678, 90279, 90284 | Built artifact (compiled output). Regenerated on next `npm run build`; do not edit by hand. |

**Phase 3 action:** Delete the emit at `useAgentChatStreaming.ts:215` and the listener block in `agentChatWorkspaceSupport.ts:268–278` (approx — confirm exact range during edit). The built artifact regenerates.

### Legacy IPC channel string literals (`agentChat:thread`, `agentChat:status`, `agentChat:stream`)

| File | Lines | Site | Phase 3 disposition |
|---|---|---|---|
| `src/shared/ipc/agentChatChannels.ts` | 58, 60, 61 | Central channel declaration (`{ thread: 'agentChat:thread', status: 'agentChat:status', stream: 'agentChat:stream' }`) | Delete the three entries. Surrounding file may shrink to other surviving channels (e.g., `createThread`, `updateMessage` — confirm during edit) or be deleted entirely if no other channels live here. |
| `src/main/ipc-handlers/agentChat.test.ts` | 46–48 | Test fixture | Delete the three entries; rewrite the test to assert the new contract or delete if no longer meaningful. |
| `src/main/ipc-handlers/agentChatEventForwarders.ts` | (per static-importer list) | Emit sites for the three channels | Delete the emit functions/sites. File may shrink or be deleted entirely. |
| `src/main/ipc-handlers/agentChatEventForwarders.test.ts` | 19–21, 70 | Test fixtures + a `'agentChat:stream'` non-throw test | Delete the three fixture entries; rewrite/delete the stream-not-throw test. |
| `src/main/mobileAccess/channelCatalog.read.ts` | 38 | **NEW finding** — mobile-access channel catalog declares `agentChat:status` as `paired-read` with `timeoutClass: 'short'`. | Delete the entry. If the new channels need mobile-access classification, add them here. **Decision required during Phase 3** — surface to Cole if classification scheme isn't obvious. |
| `src/main/mobileAccess/channelCatalogCoverage.test.ts` | 53–54 | Coverage assertion for `agentChat:stream` + `agentChat:thread` | Delete entries. |
| `src/preload/preloadSupplementalAgentChatApis.test.ts` | 67 | Asserts `mockOn` called with `'agentChat:thread'` on preload bridge wiring | Rewrite to assert the new bridge wiring against `chatState:*` channels, or delete the test if no longer meaningful (the new wiring is tested elsewhere). |
| `src/web/webPreloadApisSupplemental.ts` | 245, 247, 248 | Web preload subscriptions (`onThreadUpdate`, `onStatusChange`, `onStreamChunk`) | **Migrate to `chatState:*` channels**, do not just delete — web mode needs the new contract to work. Wire `onThreadDiff(cb)` / `onThreadSnapshot(cb)` on `chatState:diff/<threadId>` + `chatState:snapshot/<threadId>` channels. |

### `syntheticSessionIds` cleanup delay

| File | Line | Site |
|---|---|---|
| `src/main/hooksDispatchLogic.ts` | 40 | `syntheticSessionIds: [...activeSyntheticIds]` — the active list reference; 2-second cleanup delay logic should be searched for adjacent. |

**Phase 3 action:** Read the full block around line 40 and the `activeSyntheticIds` declaration. Delete the synthetic-id maintenance logic; the new path's `IdentityRegistry` is the canonical source.

## B. Static importers of `threadStore.ts` (Phase 1 must preserve every call site)

| File | Why it imports |
|---|---|
| `src/main/ipc-handlers/agentChatEventForwarders.ts` | Legacy IPC forwarders — will mostly delete in Phase 3, but Phase 1's lazy-init refactor must not break it before Phase 3 lands. |
| `src/main/mainShutdown.ts` | Calls `agentChatThreadStore.close()` on app shutdown. Phase 1 must keep this functional. |
| `src/main/session/softDeleteGc.ts` | Background GC of soft-deleted threads. Phase 1 must keep this functional. |
| `src/main/session/softDeleteGc.test.ts` | Test file — confirms Phase 1's refactor preserved the test's mocking surface. |

**Phase 1 action:** The lazy-init refactor changes the *internal* shape of `threadStore.ts` (when `app.getPath` is called) but MUST NOT change the *exported* surface (functions and signatures listed in `agentChat/CLAUDE.md`'s Public Surface section). After refactor, run the static-importer test sweep:

```bash
npx vitest run src/main/session/softDeleteGc.test.ts
npx tsc --noEmit   # confirms agentChatEventForwarders.ts + mainShutdown.ts still type-check
```

## C. Lazy `require()` instances of `threadStore.ts` (Phase 1 deletes both)

| File | Line | Reason it's lazy |
|---|---|---|
| `src/main/ipc-handlers/chatStateNewPath.ts` | 93 | "threadStore.ts calls `app.getPath('userData')` at module-eval time" (per file comment at lines 20–23). |
| `src/main/session/sessionStartup.ts` | 36 | **NEW finding — same root cause.** Comment in this file likely cites the same reason; confirm during Phase 1. |

**Phase 1 action:** Replace both with static `import` statements once the `threadStore.ts` lazy-init refactor lands. Update the comment blocks documenting why the lazy pattern was needed (the reason is gone after refactor).

## D. `[trace:agent-record]` emit sites (Phase 4 deletes)

| File | Line | Site annotation |
|---|---|---|
| `src/main/hooksDispatchLogic.ts` | 34 (comment), 38 (emit) | Site 1 — `instructions_loaded` passing through dispatcher |
| `src/renderer/hooks/useAgentEvents.ruleSkillDispatchers.ts` | 95 (comment), 96 (emit) | Site 2 — `dispatchRuleLoaded` queueing |
| `src/renderer/components/AgentChat/ComposerContextPreview.tsx` | 99 (comment), 100 (emit) | Site 3 — composer-side rules lookup |

**Phase 4 action:** Delete each emit + its descriptive comment. The 3-site chain is the spam source.

**Note:** Greps earlier surfaced `claudeCodeSubagentHandler.ts` and `useRafBatchedChunks.ts` matches — these are `[trace:stream]` matches, not `[trace:agent-record]`. They stay (Decision 4 locked KEEP for `[trace:stream]`).

## E. `[trace:stream]` emit sites (Phase 4 PRESERVES per Decision 4)

| File | Line | Annotation |
|---|---|---|
| `src/main/ipc-handlers/agentChatEventForwarders.ts` | 97 | Emit on legacy stream-chunk forwarding. **Deletes with the file in Phase 3** — the new path's `[trace:event]` and `[trace:state]` cover this. |
| `src/main/orchestration/providers/claudeCodeSubagentHandler.ts` | 88, 117 | Subagent tool-use trace. Keep. |
| `src/renderer/components/AgentChat/useAgentChatStreaming.ts` | 175 | Renderer receive-side trace. Keep — Phase 2 may move the call inside the rebound send handler but the emit stays. |
| `src/renderer/components/AgentChat/useRafBatchedChunks.ts` | 33 | RAF batch flush trace. Keep. |

**Phase 4 action:** Do NOT touch any `[trace:stream]` emit. The Phase 3 deletion of `agentChatEventForwarders.ts:97` is incidental (the file is gone); the surviving four emits remain.

## F. Baseline gates (Phase 0 entry state)

Run in the orchestrator session before Phase 1 dispatches:

- `npm run lint` — expected clean
- `npx tsc --noEmit` — expected clean
- `npx vitest run src/main/agentChat src/main/ipc-handlers src/renderer/components/AgentChat` — expected clean

(See orchestrator log for actual output. If any fail at Phase 0, the entry state is dirty and Phase 1 cannot start until baseline is green.)

## G. Acceptance tests authored

- `roadmap/wave-87-chat-orchestration-activation/acceptance/phase-1-shadow-path-fires.test.ts` — Phase 1 contract. Currently FAILS (3 of 4 assertions; the static-import assertion has nothing to find yet).
- `roadmap/wave-87-chat-orchestration-activation/acceptance/phase-2-send-path-migration.test.ts` — Phase 2 contract. Currently FAILS (the renderer hook does not yet invoke `chatCommand.sendMessage`).

The orchestrator runs both before dispatching the respective phase and confirms FAIL. After the implementer reports done, the orchestrator runs the test again and confirms PASS.

## H. Notes for the next dispatcher

- The `webPreloadApisSupplemental.ts` migration in Phase 3 is **non-trivial** — web-mode users need the new channels wired through preload, not just the legacy ones removed. Brief Phase 3's subagent explicitly on this.
- The `mobileAccess/channelCatalog.read.ts` entry is a **new finding not in the original wave plan**. Surface to Cole if the right disposition for `chatState:*` channels in the mobile-access catalog isn't obvious during Phase 3.
- Two lazy requires of `threadStore.ts` (not one) — `sessionStartup.ts:36` is the second. Phase 1's acceptance test covers both. The waveplan §"In scope" implicitly assumes one site; Phase 1's brief must reference both.
- `eventProjector.ts` may end up empty or deletable after Phase 3 (its only documented Wave-87 responsibility is `applyStickyLinkFields`). Surface to Cole during Phase 3 review.
