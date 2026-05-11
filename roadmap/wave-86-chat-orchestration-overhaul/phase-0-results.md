---
status: COMPLETE
created: 2026-05-11
phase: 0
wave: 86
---

# Phase 0 — Pre-flight Inventory + Baseline

Phase 0 deliverable per the wave plan. Four work items: ADR transcription, consumer grep for soon-deleted IPC channels, Wave 84 instrumentation inventory, baseline lint+typecheck+vitest. All complete; results below feed Phase 6's deletion brief and Phase 7's instrumentation-finalize brief.

## 1. ADR transcription

`roadmap/wave-86-chat-orchestration-overhaul/wave-86-decisions.md` populated with all ten locked decisions from the wave plan's Locked Decisions section. Each decision carries Context / Pick / Rationale / Consequences per `~/.claude/rules/best-practice-spectrum.md`. No pending user lock — all ten decisions are pre-locked from brainstorming + spec approval.

## 2. Consumer grep — five soon-deleted IPC channels

This is the authoritative deletion checklist for Phase 6. Every entry below must be addressed (migrated to the new contract OR deleted alongside the channel) before Phase 6 closes.

### 2.1 `agentChat:thread` channel

| File | Line | Role | Phase 6 disposition |
|---|---|---|---|
| `src/shared/ipc/agentChatChannels.ts` | 58 | Constant declaration (`thread: 'agentChat:thread'`) | DELETE constant; remove from `AgentChatChannels` type |
| `src/main/ipc-handlers/agentChat.test.ts` | 46 | Test mock referencing channel name | UPDATE: assert against new `chatState:diff` channel |
| `src/main/ipc-handlers/agentChatEventForwarders.test.ts` | 19 | Test mock referencing channel name | UPDATE: assert against `chatState:diff` |
| `src/main/mobileAccess/channelCatalogCoverage.test.ts` | 54 | Channel-catalog coverage test asserts channel registered | UPDATE: replace entry with `chatState:diff` |
| `src/web/webPreloadApisSupplemental.ts` | 245 | Web preload bridge `onThreadUpdate` subscriber | MIGRATE to new contract (web layer consumes `chatState:diff`); flag risk if web exposure broader than trusted network |
| `src/preload/preloadSupplementalAgentChatApis.test.ts` | 67 | Preload bridge unit test asserts old subscription | UPDATE: assert against `chatState:diff` subscription |

**6 sites total.** Web preload is the highest-risk migration — confirm web layer scope (single-user-trusted-network per existing CLAUDE.md tech-debt note) before deciding migrate-vs-delete.

### 2.2 `agentChat:status` channel

| File | Line | Role | Phase 6 disposition |
|---|---|---|---|
| `src/shared/ipc/agentChatChannels.ts` | 60 | Constant declaration | DELETE constant |
| `src/main/ipc-handlers/agentChat.test.ts` | 47 | Test mock | UPDATE: assert against `chatState:diff` |
| `src/main/ipc-handlers/agentChatEventForwarders.test.ts` | 20 | Test mock | UPDATE: assert against `chatState:diff` |
| `src/main/mobileAccess/channelCatalog.read.ts` | 38 | Mobile-access channel catalog entry | UPDATE: remove entry; if mobile chat status needs preserving, mobile consumes `chatState:diff` with status-only filter |
| `src/web/webPreloadApisSupplemental.ts` | 247 | Web `onStatusChange` subscriber | MIGRATE to `chatState:diff` filtered to status events |

**5 sites total.**

### 2.3 `agentChat:stream` channel

| File | Line | Role | Phase 6 disposition |
|---|---|---|---|
| `src/shared/ipc/agentChatChannels.ts` | 61 | Constant declaration | DELETE constant |
| `src/main/agentChat/CLAUDE.md` | 25 | Documentation reference | UPDATE: describe new `chatState:diff` shape |
| `src/main/ipc-handlers/agentChat.test.ts` | 48 | Test mock | UPDATE |
| `src/main/ipc-handlers/agentChatEventForwarders.test.ts` | 21, 70 | Test mock + send assertion | UPDATE assertions to `chatState:diff` |
| `src/main/mobileAccess/channelCatalogCoverage.test.ts` | 53 | Coverage catalog entry | UPDATE |
| `src/web/webPreloadApisSupplemental.ts` | 248 | Web `onStreamChunk` subscriber | MIGRATE to `chatState:diff` (web layer behavior most affected — stream chunks are the highest-frequency event) |

**6 sites total.** The web layer migration is the most consequential of the three `agentChat:*` channels — stream chunks fire at token-delta frequency.

### 2.4 `hooks:event` channel

This one is **retained, not deleted** per the wave plan scope. Listed here for completeness because Phase 0's grep surfaced it. The wave plan §Scope says: *"`hooks:event` retained but normalized at receive"* — the channel keeps emitting, but the EventNormalizer (Phase 1) becomes the only consumer that mutates state.

| File | Line | Role | Phase disposition |
|---|---|---|---|
| `src/preload/preload.ts` | 139, 140, 149, 150 | Preload bridge `on` + `removeListener` | RETAIN; no change |
| `src/web/webPreloadApis.ts` | 148, 150 | Web preload bridge `onAgentEvent` | RETAIN; no change |
| `src/main/hooks.ts` | 161, 166 | Main emit site (hook server → renderer + web broadcast) | RETAIN; no change |
| `src/main/hooksNet.ts` | 210, 214 | Network hook emit site | RETAIN; no change |
| `src/main/mobileAccess/channelCatalogCoverage.test.ts` | 83 | Coverage catalog entry | RETAIN |
| `src/main/web/broadcast.ts` | 16 | Documentation comment | RETAIN |

**11 sites total. All RETAIN.** Phase 3+ adds the EventNormalizer as the renderer-side consumer; existing renderer subscribers remain but read through the normalizer.

### 2.5 `agent-chat:thread-snapshot` DOM CustomEvent

| File | Line | Role | Phase 4 disposition |
|---|---|---|---|
| `src/renderer/components/AgentChat/useAgentChatStreaming.ts` | 178 | Emit site (`window.dispatchEvent`) | DELETE: subscribers now listen on `chatState:diff` thread-snapshot events |
| `src/renderer/components/AgentChat/agentChatWorkspaceSupport.ts` | 274, 280 | Subscriber + cleanup | DELETE; replace subscription with `chatState:diff` consumer |

**3 sites total.** Per the wave plan, this DOM bridge path is deleted in Phase 4 (when renderer cuts over to `chatState:diff`), not Phase 6.

### 2.6 Consumer grep — totals

| Channel | Sites | Disposition |
|---|---|---|
| `agentChat:thread` | 6 | DELETE constant + MIGRATE 1 web consumer + UPDATE 4 test references |
| `agentChat:status` | 5 | DELETE constant + MIGRATE 1 web + 1 mobile catalog + UPDATE 2 test refs |
| `agentChat:stream` | 6 | DELETE constant + MIGRATE 1 web + UPDATE 4 doc/test refs |
| `hooks:event` | 11 | RETAIN ALL; normalize at receive in Phase 1 |
| `agent-chat:thread-snapshot` | 3 | DELETE 1 emit + 2 subscribers (Phase 4, not Phase 6) |
| **Total** | **31** | **17 to delete/migrate in Phase 6, 3 in Phase 4, 11 retained** |

**Web layer note:** the web preload bridge (`src/web/webPreloadApisSupplemental.ts`) is the highest-coupling consumer of the three `agentChat:*` channels. Per existing CLAUDE.md tech-debt: *"`tokenStorage` localStorage-on-web (MED) — elevate to HIGH only when web mode is exposed beyond trusted networks."* Web exposure is currently single-user-trusted-network. Phase 6 migrates web preload to the new `chatState:diff` shape, not defers it.

## 3. Wave 84 instrumentation inventory

Every retained `[trace:*]` tag from Wave 84 that Phase 7 will retire. Single emit point per row unless noted.

### 3.1 `[trace:agent-record]` — 3-site chain for session-ID reconciliation

| Site | File | Line | Logged fields |
|---|---|---|---|
| Site 1 | `src/main/hooksDispatchLogic.ts` | 34, 38 | `instructions_loaded` reaching dispatcher; hook-pipe sessionId, syntheticSessionIds state |
| Site 2 | `src/renderer/hooks/useAgentEvents.ruleSkillDispatchers.ts` | 95, 96 | `sessionIdKey` (hook-pipe sessionId), filePath, source for rules dispatch |
| Site 3 | `src/renderer/components/AgentChat/ComposerContextPreview.tsx` | 99, 100 | `queriedSessionId` (claudeSessionId from stream-json), `foundKey`, `foundUserRulesCount`, `foundProjectRulesCount`, `storeSessionIds` (hook-pipe IDs in AgentEventsContext) |

**Wave 86 successor:** `[trace:identity]` at every `IdentityRegistry` reverse-lookup. Single emit point per method, replacing the cross-file chain.

### 3.2 `[trace:stream]` — stream chunk emit + receive

| Site | File | Line | Logged fields |
|---|---|---|---|
| Emit (main) | `src/main/ipc-handlers/agentChatEventForwarders.ts` | 97 | windowIds, threadId, chunkId, type, ts |
| Receive (renderer) | `src/renderer/components/AgentChat/useAgentChatStreaming.ts` | 144 | threadId, chunkId, type, ts, documentHidden |
| rAF flush (renderer) | `src/renderer/components/AgentChat/useRafBatchedChunks.ts` | 33 | queuedCount, sinceLastFlushMs |
| Subagent emit (main) | `src/main/orchestration/providers/claudeCodeSubagentHandler.ts` | 88, 117 | subagent tool_use; no parent mapping |

**Wave 86 successor:** `[trace:event]` at `ChatSessionStateMachine.dispatch()` — single emit point covering all event ingress.

### 3.3 `[trace:chat-order]` — thread snapshot + ordering

| Site | File | Line | Logged fields |
|---|---|---|---|
| Emit snapshot (main) | `src/main/agentChat/chatOrchestrationBridgePersistHelpers.ts` | 71 | emitSnapshotChunk |
| Body (renderer) | `src/renderer/components/AgentChat/AgentChatBodyHelpers.tsx` | 31 | messagesWithStreaming |
| Workspace reducer | `src/renderer/components/AgentChat/agentChatWorkspaceReducers.ts` | 58 | mergeThreadCollection |
| Snapshot receive | `src/renderer/components/AgentChat/agentChatWorkspaceSupport.ts` | 243 | snapshot received |
| Workspace effect | `src/renderer/components/AgentChat/useAgentChatWorkspace.ts` | 160, 176 | pendingUserClearEffect |

**Wave 86 successor:** `[trace:state]` at `ChatSessionStateMachine` transition method — single emit point covering all state transitions.

### 3.4 `[trace:heat-map]` — file-tree heat-map (Wave 84 Phase B)

Not surfaced by the grep targeting the four named tags above. May have been removed at Wave 84 closeout (per W84's status, the heat-map fix landed and `[heat-map]` traces "left in place; Phase Z decides retain-vs-remove"). Phase 7 will run a follow-up grep to confirm; if any `[heat-map]` traces remain, they're retired then.

### 3.5 Instrumentation totals

| Tag | Sites | Wave 86 successor |
|---|---|---|
| `[trace:agent-record]` | 3 sites | `[trace:identity]` |
| `[trace:stream]` | 4 sites | `[trace:event]` |
| `[trace:chat-order]` | 5 sites | `[trace:state]` |
| `[trace:heat-map]` | 0 sites found (possibly already removed) | n/a (Phase 7 confirms) |
| **Total to retire at Phase 7** | **12 sites** | — |

The cross-file chain pattern (3 sites for agent-record, 4 for stream, 5 for chat-order) is exactly what the spec §4.7 single-emit-point design eliminates. Phase 7 deletes these 12 sites in one sweep.

## 4. Baseline gates

All three gates ran from a clean working tree at 2026-05-11 18:20 local.

### 4.1 Lint

```
> npm run lint
> eslint src/

✖ 3 problems (0 errors, 3 warnings)
```

**Result: 0 errors, 3 warnings.** Warnings are in unrelated files outside this wave's scope:

| File | Line | Rule | Note |
|---|---|---|---|
| `src/main/delegationCoach/patterns.test.ts` | 57:28 | `security/detect-unsafe-regex` | Test fixture; pre-existing |
| `src/renderer/components/FileViewer/FileViewerChrome.tsx` | 275:5 | `react-hooks/exhaustive-deps` | Pre-existing; FileViewer subsystem |
| `src/renderer/components/FileViewer/HtmlPreview.tsx` | 47:3 | unused eslint-disable directive | Pre-existing |

**Wave 86 entry state: lint clean for the surfaces this wave touches.** No new warnings expected from the overhaul; if Phase 1+ introduces warnings in `src/main/agentChat/`, `src/main/orchestration/`, `src/main/ipc-handlers/`, `src/main/hooks*.ts`, or `src/renderer/components/AgentChat/`, address them in-phase.

### 4.2 Typecheck

```
> npm run typecheck
> tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json
```

**Result: 0 errors. Exit 0.** Both web (renderer + preload + shared) and node (main process) compile clean.

### 4.3 Scoped vitest

```
> npx vitest run src/main/agentChat src/renderer/components/AgentChat

Test Files  156 passed (156)
     Tests  1408 passed (1408)
  Duration  146.34s
```

**Result: 156 test files, 1408 tests, all passed. Exit 0.** Baseline test coverage on the two surfaces Wave 86 reshapes is comprehensive — Phase 3's dual-emit diff comparator will have a strong existing-behavior reference.

### 4.4 Gate summary

| Gate | Result |
|---|---|
| `npm run lint` | PASS (0 errors, 3 unrelated pre-existing warnings) |
| `npm run typecheck` | PASS (0 errors, exit 0) |
| `npx vitest run src/main/agentChat src/renderer/components/AgentChat` | PASS (1408/1408, 146s) |

**Phase 0 baseline confirmed clean.** Phase 1 (walking skeleton) can dispatch.

## 5. Risks / follow-ups noticed during Phase 0

- **Web layer migration in Phase 6 is heavier than the wave plan acknowledged.** The web preload bridge (`src/web/webPreloadApisSupplemental.ts`) subscribes to all three `agentChat:*` channels (thread, status, stream). Migrating to `chatState:diff` is the right call, but the web layer's overall event flow needs a separate read to confirm no other coupling. Surfaced as a Phase 6 brief refinement, not a scope change.

- **Mobile-access channel catalog (`src/main/mobileAccess/`) has its own coverage tests** asserting which channels are registered. Phase 6 brief must include updating these tests (`channelCatalogCoverage.test.ts`, `channelCatalog.read.ts`) — they're not optional adjacent updates, they're load-bearing checks.

- **`[trace:heat-map]` grep returned zero sites.** Either Wave 84 cleanup removed them despite the status note saying "left in place," or they live under a slightly different tag form (e.g., `[heat-map]` without `trace:`). Phase 7's brief should include a broader grep (`grep -rn 'heat.map' src/`) to confirm.

- **`AgentChatBodyHelpers.tsx:31` carries `[trace:chat-order]`** but isn't a chat-order-critical site — it's a body-render helper. Phase 7 may decide to retire this specific entry early if it surfaces as noise during the dual-emit window in Phase 3.

## 6. Phase 1 dispatch readiness

Per the orchestrator dispatch checklist step 3:

- ADR file populated ✓
- Consumer list ready for Phase 6 reference ✓
- Instrumentation inventory ready for Phase 7 reference ✓
- Lint + typecheck + scoped vitest clean ✓

**Phase 1 (walking skeleton) is ready to dispatch.** Implementer: `sonnet-implementer`. Brief should reference this Phase 0 results file as the entry-state baseline.
