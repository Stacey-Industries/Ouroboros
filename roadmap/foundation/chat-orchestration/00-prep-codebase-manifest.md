---
status: COMPLETE
created: 2026-05-11
updated: 2026-05-11
role: Reading-list manifest for chat orchestration Stage 1 Discovery
produced-by: sonnet-explorer (pre-discovery prep pass)
---

# Chat Orchestration — Pre-Discovery Codebase Manifest

This file is the output of a codebase reading pass across the chat orchestration subsystem. It is consumed by subsequent discovery agents (docs 01–03) and the brainstorming session that produces the MAP (doc 04).

Scope: `src/main/agentChat/`, `src/main/orchestration/providers/`, `src/main/ipc-handlers/`, `src/main/hooks*.ts`, `src/renderer/components/AgentChat/`, `src/renderer/hooks/useAgentEvents.*`, `src/main/storage/`, `src/main/telemetry/`, `src/shared/types/agentChat*.ts`.

---

## 1. State Inventory

### 1.1 Main-Process In-Memory State

| Owner | Variable | Type | Lifetime | File |
|---|---|---|---|---|
| Bridge runtime | `activeSends` | `Map<string, ActiveStreamContext>` | Per active turn; deleted in `emitTurnComplete()` | `chatOrchestrationBridgeTypes.ts` |
| Bridge runtime | `pendingCancels` | `Set<string>` (threadIds) | Cleared when cancel completes | `chatOrchestrationBridgeTypes.ts` |
| Bridge runtime | `streamChunkListeners` | `Set<StreamChunkListener>` | App lifetime (IPC forwarder subscribes once) | `chatOrchestrationBridgeTypes.ts` |
| MinimalOrchestration | `sessions` | `Map<string, TaskSessionRecord>` | App lifetime; NOT persisted across restart | `agentChatOrchestration.ts` |
| Hook server | `activeSessions` | `Map<string, number>` | Per Claude Code process (hook events arrive) | `hooks.ts` |
| Hook server | `sessionCwdMap` | `Map<string, string>` | Per Claude Code process | `hooks.ts` |
| Hook server | `syntheticSessionIds` | `Set<string>` | Set on `agent_start`; removed after 2s delay on `agent_end` | `hooks.ts` |
| Hook server | `pendingQueue` | `HookPayload[]` | Transient; drained after launch counter reaches zero | `hooks.ts` |
| Launch gate | `chatLaunchesInFlight` | `number` (module-level counter) | Incremented by `beginChatSessionLaunch()`, decremented by `endChatSessionLaunch()` | `hooksChatLaunch.ts` |
| Provider state | `activeProcesses` | `Map<string, StreamJsonProcessHandle>` | Keyed by taskId; per active subprocess | `claudeCodeState.ts` |
| Provider state | `cancelledTasks` | `Set<string>` | Per task; cleared after cancel acknowledged | `claudeCodeState.ts` |
| Provider state | `activeAgentPtySessions` | `Map<string, ActiveAgentPtyEntry>` | Per PTY session (currently bypassed for headless) | `claudeCodeState.ts` |
| Context cache | `contextCache` | `Map<string, CachedContext>` | Keyed by sorted workspace roots; 5-minute TTL | `agentChatContext.ts` |
| Session memory | `sessionMemory` | JSON file backed, keyed by sessionId | Per workspace; max 200 entries, confidence decay | `sessionMemory.ts` |

### 1.2 Main-Process Persisted State

| Store | Technology | Path | What's stored | File |
|---|---|---|---|---|
| `threads.db` | SQLite (better-sqlite3), schema v9 | `{userData}/agent-chat/threads/{sha1-of-workspaceRoot}.db` | threads + messages tables with FK cascade | `threadStoreSqlite.ts` |
| Session memory | JSON file | `{userData}/agent-chat/memory/{sha1-of-workspaceRoot}.json` | `sessionId → metadata`, max 200 entries | `sessionMemory.ts` |
| Context cache | JSON file | `{userData}/context-cache.json` | Workspace-keyed context packet snapshots (strips cachedPacket) | `agentChatContext.ts` |
| Config (agentChatSettings) | electron-store | `{userData}/config.json` | `provider`, `model`, `effort`, `maxTokens`, `mode`, `permissionMode`, `maxHistory`, feature flags | `configSchemaTail.ts` |
| Telemetry | SQLite | `{userData}/telemetry.db` | events, outcomes, orchestration_traces, research_invocations | `telemetry/CLAUDE.md` |
| Telemetry parity queue | JSONL | `~/.ouroboros/telemetry/queue/` | Parity events for offline processing | `telemetry/CLAUDE.md` |
| Git checkpoint refs | git | `refs/ouroboros/checkpoints/{threadId}` | Pre-turn HEAD hash; max 50 retained (lazy GC) | `chatOrchestrationBridgeGit.ts` |

### 1.3 Renderer In-Memory State (Zustand)

| Store | Scope | Key Slices | Mounting point |
|---|---|---|---|
| `agentChatStore` | Per `AgentChatWorkspace` mount | `AgentChatThreadState`, `AgentChatContextFilesState`, `AgentChatModelState`, `AgentChatQueueState`, `AgentChatSlashState` | `AgentChatWorkspace` component via React context |

The store is created with `createStore()` (not `create`), one instance per workspace mount, distributed via React context. It is NOT a global singleton — multiple open workspaces have independent stores.

**`AgentChatThreadState` fields** (from `agentChatStore.types.ts`):
- `activeThread`: currently displayed thread record
- `threads`: list of thread summaries
- `draft`: current composer content
- `canSend`, `isSending`, `pendingUserMessage`
- `projectRoot`

**`AgentChatQueueState` fields**:
- `queuedMessages`: messages waiting to send while `isSending === true`

**`AgentChatSlashState` fields**:
- `activeSessionId`: Claude Code session ID for slash-command context

### 1.4 Renderer In-Memory State (Streaming Reducer)

| State | Location | Key fields |
|---|---|---|
| `AgentChatStreamingState` per thread | `AgentChatStreamingReducers.ts` | `isStreaming`, `streamingMessageId`, `blocks: AgentChatContentBlock[]`, `activeTextContent`, `streamingTokenUsage`, `_seenChunkIds` |
| rAF flush batch | `useRafBatchedChunks` | Accumulates deltas per animation frame; `complete`/`error` flush synchronously |

### 1.5 Renderer Persisted State (localStorage)

| Key | Content | Lifetime | File |
|---|---|---|---|
| `agentChat:draft:{threadId}` | Composer draft text | Until sent or cleared | `useAgentChatDraftPersistence.ts` |
| `agentChat:draft:__new__` | Composer draft when no active thread | Until thread created | `useAgentChatDraftPersistence.ts` |
| `__draft:{someId}` | Pre-send tab draft (prefix pattern) | Until tab promoted | `useAgentChatDraftPersistence.ts` |

Draft saves are debounced 500ms. The `DRAFT_ID_PREFIX = '__draft:'` constant is defined in `useAgentChatDraftPersistence.ts`.

### 1.6 Renderer Context State

| Context | Provider | Contents |
|---|---|---|
| `AgentEventsContext` | `AgentEventsProvider` (in `ConfiguredApp`) | `sessions: AgentSession[]`, `pendingSubagentLinks`, tool activity records — populated from hook-pipe events via `useAgentEvents` reducer |
| `ProjectContext` | `ProjectProvider` (innermost in provider stack) | Project root, workspace paths |
| `ApprovalContext` | `ApprovalProvider` | Pending approval requests |

---

## 2. Event Flow

### 2.1 Named-Pipe Hook Events (Hook Server → IPC → Renderer)

```
Claude Code subprocess
  ↓ (TCP/named pipe: OUROBOROS_HOOKS_ADDRESS)
hooks.ts:dispatchToRenderer()
  → traceInstructionsLoaded()          # side-channel trace for ID reconciliation
  → shouldSuppressDispatch()           # gate: true if chatLaunchesInFlight > 0 || syntheticCount > 0
  →   EXCEPTION: 'instructions_loaded' is NEVER suppressed
  → sendPayload() → mainFrame.send('hooks:event', payload)
  ↓ (IPC: hooks:event)
useAgentEvents.ts reducer (renderer)
  → dispatches SESSION_REGISTER, ADD_SESSION, UPDATE_SESSION, etc.
  → updates AgentEventsContext
```

**Synthetic hook events** (bridge → hook server → IPC → renderer):
```
chatOrchestrationBridgeMonitor.ts:dispatchSyntheticHookEvent()
  → hooks.ts:dispatchSyntheticHookEvent()  [skips approval, sets ideSpawned: true]
  → adds to syntheticSessionIds on agent_start
  → removes from syntheticSessionIds after 2s delay on agent_end
  → sendPayload() → hooks:event IPC
```

Synthetic session IDs use thread ID as the session ID (`sessionId: ctx.threadId`), NOT the Claude Code session ID.

### 2.2 Stream-JSON Stdout Events (Provider → Bridge → IPC → Renderer)

```
claude subprocess stdout (NDJSON lines)
  ↓ (parsed in claudeStreamJsonRunner.ts)
claudeCodeEventHandler.ts
  → snapshot diffing: localToGlobal block index mapping
  → computes per-character text deltas (slices past emittedContentLengths)
  ↓ (ProviderProgressSink callback)
chatOrchestrationBridgeProgress.ts:handleProviderProgress()
  → syncProviderSessionId()            # first event carrying session_id lands here
  → routes to streaming/completion/cancellation/failure
  → stream chunks → chatOrchestrationBridgeMonitor.ts
  ↓
chatOrchestrationBridgeMonitor.ts
  → emits AgentChatStreamChunk via streamChunkListeners
  ↓ (IPC forwarder subscribed)
agentChatEventForwarders.ts:onStreamChunk
  → [trace:stream] emit log
  → svc.sendToWindow(windowId, 'agentChat:stream', chunk)
  ↓ (IPC: agentChat:stream)
useAgentChatStreaming.ts
  → [trace:stream] received log
  → dispatchStreamChunk() to AgentChatStreamingReducers
  → rAF batching via useRafBatchedChunks
  → on thread_snapshot chunk: fires DOM CustomEvent 'agent-chat:thread-snapshot'
```

### 2.3 Session Update Events (Orchestration → IPC → Renderer)

```
MinimalOrchestration.onSessionUpdate callback
  ↓
agentChatEventForwarders.ts:projectAndSendSessionUpdate()
  → eventProjector.ts:projectAgentChatSession()
  → sends 'agentChat:thread' IPC only if changed AND NOT actively streaming
  → always sends 'agentChat:status' IPC
  ↓ (IPC: agentChat:thread + agentChat:status)
agentChatWorkspaceSupport.ts:useAgentChatEventSubscriptions()
  → mergeThreadCollection() on thread update
  → onStatusChange() on status update
```

### 2.4 DOM CustomEvent: `agent-chat:thread-snapshot`

```
useAgentChatStreaming.ts
  → window.dispatchEvent(new CustomEvent('agent-chat:thread-snapshot', { detail: chunk.thread }))
  ↓ (renderer-internal only, does NOT cross IPC)
agentChatWorkspaceSupport.ts
  → [trace:chat-order] snapshot received log
  → merges thread data into store
```

Renderer-only event that bypasses IPC. Fires when a stream ends, carrying final thread state directly from streaming layer to workspace store.

### 2.5 User Action Events (Renderer → IPC → Main → Orchestration)

```
User submits message in composer
  ↓
agentChatStore:sendMessage()
  → window.electronAPI.agentChat.sendMessage(threadId, content)
  ↓ (IPC invoke: agentChat:sendMessage)
ipc-handlers/agentChat.ts
  → svc.bridge.sendMessage(threadId, content, options)
  ↓
chatOrchestrationBridgeSend.ts:executePendingSend()
  → beginChatSessionLaunch()           # increments suppression counter
  → builds TaskRequest (provider, model, context packet)
  → MinimalOrchestration.submitTask()  → creates taskId + sessionId
  → registers ActiveStreamContext in activeSends
  → provider.submitTask()              → spawns 'claude' subprocess
```

---

## 3. Lifecycle

### 3.1 Chat Start

| Step | File | What happens |
|---|---|---|
| User sends first message | `chatOrchestrationBridgeSend.ts` | `executePendingSend()` begins |
| Suppression gate opens | `hooksChatLaunch.ts` | `beginChatSessionLaunch()` increments `chatLaunchesInFlight` |
| Thread created or resolved | `threadStore.ts` | `createThread()` or existing thread loaded |
| Git snapshot captured | `chatOrchestrationBridgeGit.ts` | `captureHeadHash()` stores `preSnapshotHash` in link |
| TaskRequest built | `chatOrchestrationRequestSupport.ts` | Resolves provider, model, effort, permissionMode |
| Context packet assembled | `orchestration/contextPacketBuilder.ts` | Cached or fresh; 60s TTL, SHA-1 fingerprint |
| Task submitted to orchestration | `agentChatOrchestration.ts` | `MinimalOrchestration.submitTask()` creates `taskId`, `sessionId` |
| Provider subprocess spawned | `claudeStreamJsonRunner.ts` | `claude` process spawned via `powershell.exe -Command` on Windows |
| ActiveStreamContext registered | `chatOrchestrationBridgeTypes.ts` | Entry added to `activeSends` keyed by `taskId` |
| First stream-json event arrives | `claudeCodeEventHandler.ts` | `sessionRef.sessionId` set from `event.session_id` (line 310) |
| providerSessionId populated | `chatOrchestrationBridgeProgress.ts` | `syncProviderSessionId()` — first call sets `ctx.providerSessionId` and `ctx.link.claudeSessionId` |
| Monitor session starts | `chatOrchestrationBridgeMonitor.ts` | `ensureMonitorSessionStarted()` waits until providerSessionId set, calls `endChatSessionLaunch()` |
| Synthetic `agent_start` emitted | `chatOrchestrationBridgeMonitor.ts` | `dispatchSyntheticHookEvent('agent_start', { sessionId: ctx.threadId })` |
| Renderer receives agent_start | `useAgentEvents.ts` | SESSION_REGISTER dispatched; AgentEventsContext updated |

### 3.2 Streaming Turn (per tool call / text block)

| Step | File | What happens |
|---|---|---|
| Stream delta received | `claudeCodeEventHandler.ts` | Snapshot diff → compute delta |
| Delta forwarded to sink | `claudeStreamJsonRunner.ts` | `sink.onProgress()` called |
| Chunk assembled | `chatOrchestrationBridgeMonitor.ts` | `AgentChatStreamChunk` built with `seq` counter |
| Chunk IPC-forwarded | `agentChatEventForwarders.ts` | `[trace:stream] emit`; `svc.sendToWindow()` |
| Chunk received in renderer | `useAgentChatStreaming.ts` | `[trace:stream] received`; dedup via `_seenChunkIds` |
| rAF batch | `useRafBatchedChunks` | Coalesces deltas; fires `setStateMap` at most once per frame |
| Streaming state updated | `AgentChatStreamingReducers.ts` | `blocks` updated, `activeTextContent` set |
| Synthetic hook events | `chatOrchestrationBridgeMonitor.ts` | `pre_tool_use` / `post_tool_use` dispatched for tool calls |

### 3.3 Turn Completion

| Step | File | What happens |
|---|---|---|
| Stream result event arrives | `claudeStreamJsonRunner.ts` | `StreamJsonResultEvent` parsed; `Promise<StreamJsonResultEvent>` resolves |
| Provider reports completed | `chatOrchestrationBridgeProgress.ts` | `handleCompleted()` called; `ctx.streamEnded = true` |
| Final chunk emitted | `chatOrchestrationBridgePersistHelpers.ts` | `[trace:chat-order] emitSnapshotChunk` (line 71); `complete` chunk type sent |
| Messages persisted to SQLite | `chatOrchestrationBridgePersist.ts` | `upsertOrAppendMessage()` writes assistant message |
| `emitTurnComplete()` | `chatOrchestrationBridgePersistHelpers.ts` | Calls `emitMonitorSessionEnd()`, then deletes from `activeSends` |
| Synthetic `agent_end` emitted | `chatOrchestrationBridgeMonitor.ts` | `dispatchSyntheticHookEvent('agent_end', ...)` |
| `syntheticSessionIds` cleanup | `hooks.ts` | 2-second delay, then session ID removed from set |
| thread_snapshot DOM event | `useAgentChatStreaming.ts` | `CustomEvent('agent-chat:thread-snapshot')` dispatched with final thread |
| Workspace store updated | `agentChatWorkspaceSupport.ts` | `[trace:chat-order] snapshot received`; `mergeThreadCollection()` |
| Draft cleared | `useAgentChatDraftPersistence.ts` | `agentChat:draft:{threadId}` removed from localStorage |

### 3.4 Cancellation

| Step | File | What happens |
|---|---|---|
| User triggers cancel | `chatOrchestrationBridge.ts` | `cancelTask(threadId)` looks up `taskId` from `activeSends` |
| Cancel registered | `chatOrchestrationBridgeTypes.ts` | `pendingCancels.add(threadId)` |
| Provider killed | `claudeStreamJsonRunner.ts` | Windows: `taskkill /T /F /PID` — kills entire process tree |
| Status updated | `chatOrchestrationBridgeProgress.ts` | `handleCancelled()` cleans up context |
| SQLite written | `chatOrchestrationBridgePersist.ts` | Message marked `cancelled` |

### 3.5 Crash Recovery / Restart

| Step | File | What happens |
|---|---|---|
| App restart | `agentChat/index.ts` | `createAgentChatService()` rebuilds; `MinimalOrchestration.sessions` is empty |
| `listThreads` called | `threadStore.ts` | `reconcileThreadStatus()` checks `activeSends` — empty on restart, so threads stuck in `running`/`submitting` are reset to `idle` |
| Thread rehydration requested | `threadHydrator.ts` | Loads session from MinimalOrchestration + re-projects messages |
| Deterministic IDs prevent duplicates | `eventProjectorSupport.ts` | `agent-chat:{sessionId}:{kind}` IDs already in SQLite; upsert is idempotent |

---

## 4. Identity Model

### 4.1 ID Taxonomy

| ID Name | Field | Created At | Identifies | Namespace |
|---|---|---|---|---|
| `threadId` | `AgentChatThreadRecord.id` | `createThread()` in `threadStore.ts` | A persistent conversation thread in SQLite | IDE-internal |
| `taskId` | `TaskSessionRecord.taskId` | `MinimalOrchestration.submitTask()` | A single task execution (one submit → one result) | IDE-internal |
| `sessionId` (orchestration) | `TaskSessionRecord.id` | Same `submitTask()` call, different field | The orchestration session wrapping the task | IDE-internal |
| `providerSessionId` | `ActiveStreamContext.providerSessionId`, `ctx.link.claudeSessionId` | First stream-json event carrying `session_id` — `syncProviderSessionId()` | The Claude Code CLI's internal session UUID (used for `--resume`) | Claude Code CLI |
| Hook-pipe `sessionId` | `HookPayload.sessionId` | Claude Code subprocess, visible via `CLAUDE_SESSION_ID` env var | The Claude Code process's session identity in hook events | Claude Code CLI (may differ from stream-json session_id) |
| Synthetic session ID | `dispatchSyntheticHookEvent()` in `chatOrchestrationBridgeMonitor.ts` | Set as `threadId` — `sessionId: ctx.threadId` | Synthetic hook events representing the chat session | IDE-internal (deliberately = threadId) |
| Subagent synthetic session ID | `chatOrchestrationBridgeSubagent.ts` | Format: `chat-sub:{threadId}:{toolCallId}` | A sub-tool invocation within a chat turn | IDE-internal |
| `workspaceRoot` hash | `sha1-of-workspaceRoot` | `hashThreadId()` in `threadStoreSupport.ts` | Database file selector for per-workspace SQLite files | IDE-internal |

### 4.2 Conflation Points

**Conflation 1: providerSessionId vs hook-pipe sessionId**
- Location: `src/renderer/components/AgentChat/ComposerContextPreview.tsx` ~line 100
- `[trace:agent-record] Site 3` logs: `queriedSessionId` (claudeSessionId from stream-json) vs `storeSessionIds` (hook-pipe sessionIds in AgentEventsContext)
- `useChatSessionBridge()` dispatches `SESSION_REGISTER` when claudeSessionId is set but no matching agent record exists — explicit bridge for the mismatch
- Root cause: stream-json `session_id` and hook-pipe `sessionId` both originate from the Claude Code process but arrive on different channels with different timing

**Conflation 2: taskId vs sessionId in bridge lookup**
- Location: `src/main/agentChat/chatOrchestrationBridge.ts:findThreadIdForSession()`
- `activeSends` keyed by `taskId`; lookup scans both fields: `taskId === sessionOrTaskId || ctx.sessionId === sessionOrTaskId`

**Conflation 3: monitor session ID = thread ID (not provider session ID)**
- Location: `src/main/agentChat/chatOrchestrationBridgeMonitor.ts:ensureMonitorSessionStarted()`
- Synthetic `agent_start` emits `sessionId: ctx.threadId` — thread UUID, not Claude Code session UUID
- Result: `AgentEventsContext` sessions keyed by `threadId`, not by Claude Code `session_id`
- Permanent divergence between hook-pipe session IDs (real terminals) vs chat monitor session IDs

**Conflation 4: stream-json session_id arrives late**
- Location: `src/main/orchestration/providers/claudeStreamJsonRunner.ts` lines 205, 227; `claudeCodeEventHandler.ts` line 310
- `sessionRef.sessionId` starts `null`; populated on first event carrying `event.session_id`
- `endChatSessionLaunch()` is gated on `providerSessionId` being set
- If first N stream-json events don't carry `session_id`, suppression window is longer than necessary

**Conflation 5: `inferSessionId()` heuristic for tool events**
- Location: `src/main/hooksDispatchLogic.ts:inferSessionId()` (~line 45)
- For unknown sessionIds, uses most-recently-seen active session as a guess
- Explicitly fragile for multi-session scenarios

---

## 5. Boundary Leaks

### 5.1 Suppression Gate Bypass: `instructions_loaded`
- **Where**: `src/main/hooksDispatchLogic.ts:shouldSuppressDispatch()` ~line 25
- **What**: `instructions_loaded` is explicitly exempted from suppression
- **Leak**: A real terminal Claude Code session sending `instructions_loaded` during chat startup is NOT suppressed; resulting agent record has terminal's hook-pipe session ID

### 5.2 2-Second Synthetic Session Cleanup Delay
- **Where**: `src/main/hooks.ts:dispatchSyntheticHookEvent()` `agent_end` path ~line 329
- **Leak**: Real hook events arriving in the 2-second window from unrelated processes are suppressed if `syntheticCount > 0`

### 5.3 `MinimalOrchestration` Is Not Persistent
- **Where**: `src/main/ipc-handlers/agentChatOrchestration.ts:MinimalOrchestration`
- **What**: `sessions: Map<string, TaskSessionRecord>` is pure in-memory; process restart wipes all session state
- **Leak**: `loadSession()` scans `sessions` by `session.id`; after restart any IPC call passing a session ID returns `undefined`
- **Mitigation**: `reconcileThreadStatus()` + `threadHydrator.ts`. But in-flight task state (partial blocks, accumulated text) is lost.

### 5.4 Session Update Suppressed During Active Streaming
- **Where**: `src/main/ipc-handlers/agentChatEventForwarders.ts:projectAndSendSessionUpdate()` ~line 97
- **What**: `agentChat:thread` IPC not sent if thread is actively streaming
- **Leak**: Legitimate non-content updates (status `running → completing`) dropped until streaming ends

### 5.5 `inferSessionId()` Multi-Session Heuristic
- **Where**: `src/main/hooksDispatchLogic.ts:inferSessionId()`
- **Leak**: Two simultaneous chat sessions (or chat + terminal) have tool events misattributed by "most recent" heuristic

### 5.6 `applyStickyLinkFields()` Can Suppress New Data
- **Where**: `src/main/agentChat/eventProjector.ts:applyStickyLinkFields()` ~lines 84-92
- **Leak**: Re-launched session with different model/provider retains old sticky `linkedTerminalId`, `claudeSessionId`, `codexThreadId`, `model`, `effort` values

### 5.7 `activeProcesses` Deferred Cancellation Window
- **Where**: `src/main/orchestration/providers/claudeCodeState.ts`
- **By design**: placeholder `ProcessHandle` registered before async launch completes; `cancelTask()` can kill during startup

---

## 6. Persistence Inventory

### 6.1 SQLite: `threads.db`
- **Path**: `{userData}/agent-chat/threads/{sha1-of-workspaceRoot}.db`
- **Schema version**: 9 (`threadStoreSqliteHelpers.ts:SCHEMA_VERSION`)
- **WAL mode**: Yes; FK with cascade
- **threads columns**: `id`, `workspaceRoot`, `status`, `latestOrchestration` (JSON), `branchInfo` (JSON), `tags` (JSON), `pinned`, `deletedAt`, `branchName`, `forkOfMessageId`, `parentThreadId`, `isSideChat`
- **messages columns**: `id`, `threadId` (FK), `role`, `content`, `blocks` (JSON), `toolsSummary`, `costSummary`, `durationSummary`, `tokenUsage` (JSON), `skillExecutions` (JSON), `reactions` (JSON), `collapsedByDefault`, `checkpointCommit`
- **Write triggers**: `upsertOrAppendMessage()` on turn completion; `createThread()` on new; status updates on cancel/complete/fail
- **NOT persisted**: in-progress streaming blocks, `ActiveStreamContext` content, partial `TaskSessionRecord`

### 6.2 JSON File: Session Memory
- **Path**: `{userData}/agent-chat/memory/{sha1-of-workspaceRoot}.json`
- **Contents**: `sessionId → { facts, confidence, timestamp }`; max 200 entries
- **Writes**: `memoryExtractor.ts` after assistant response analysis
- **Retention**: confidence decay; evict on overflow

### 6.3 JSON File: Context Cache
- **Path**: `{userData}/context-cache.json`
- **Contents**: workspace-root-keyed context packet metadata (strips `cachedPacket`)
- **TTL**: 5 min in-memory; file is warm-restart only

### 6.4 electron-store: `agentChatSettings`
- **Path**: `{userData}/config.json` (merged)
- **Fields**: `provider`, `model`, `effort`, `maxTokens`, `mode`, `permissionMode`, `maxHistory`, feature flags
- **Source**: `src/main/configSchemaTail.ts`

### 6.5 Git Refs: Checkpoint Hashes
- **Path**: `refs/ouroboros/checkpoints/{threadId}` (per repo)
- **Contents**: Pre-turn git HEAD hash
- **Writes**: `captureHeadHash()` in `chatOrchestrationBridgeGit.ts` before each send
- **Retention**: max 50; lazy GC on next capture

### 6.6 SQLite: Telemetry
- **Path**: `{userData}/telemetry.db`
- **Tables**: `events`, `outcomes`, `orchestration_traces`, `research_invocations`
- **Parity queue**: JSONL at `~/.ouroboros/telemetry/queue/`

### 6.7 localStorage (Renderer)
- **Pattern**: `agentChat:draft:{threadId}` and `agentChat:draft:__new__`
- **Writes**: debounced 500ms on composer change
- **Cleared**: successful send

---

## 7. Instrumentation Inventory

### 7.1 `[trace:stream]` — Stream chunk lifecycle

| Site | File | Logged fields | Purpose |
|---|---|---|---|
| Emit (main) | `src/main/ipc-handlers/agentChatEventForwarders.ts` ~line 97 | `windowIds`, `threadId`, `chunkId`, `type`, `ts` | Verify chunks forwarded to correct windows |
| Receive (renderer) | `src/renderer/components/AgentChat/useAgentChatStreaming.ts` ~line 143 | `threadId`, `chunkId`, `type`, `ts`, `documentHidden` | Confirm arrival; detect hidden-window batching |

### 7.2 `[trace:chat-order]` — Thread snapshot ordering

| Site | File | Notes |
|---|---|---|
| Emit snapshot chunk | `src/main/agentChat/chatOrchestrationBridgePersistHelpers.ts` line 71 | Mark when snapshot emitted |
| Receive snapshot | `src/renderer/components/AgentChat/agentChatWorkspaceSupport.ts` ~line 243 | Verify order: stream complete before snapshot merge |

### 7.3 `[trace:agent-record]` — Session ID reconciliation chain

| Site | Label | File | Purpose |
|---|---|---|---|
| Site 1 | `[trace:agent-record] Site 1` | `src/main/hooksDispatchLogic.ts` ~line 38 | Capture hook-pipe sessionId at `instructions_loaded` |
| Site 2 | `[trace:agent-record] Site 2` | `src/renderer/hooks/useAgentEvents.ruleSkillDispatchers.ts` ~line 96 | Confirm sessionId used when rules dispatched |
| Site 3 | `[trace:agent-record] Site 3` | `src/renderer/components/AgentChat/ComposerContextPreview.tsx` ~line 100 | Detect ID mismatch (queriedSessionId vs storeSessionIds) |

**These 3 sites form the diagnostic chain for "chat not appearing in rules dropdown" bugs.**

### 7.4 Wave 84 Instrumentation Notes
Per Wave 84 close commit (`142566bb`): instrumentation from Phases A/B/D is intentionally preserved as a structural-log exception to Phase Z's "remove investigation logs" step. Reason: the overhaul initiative will need this same instrumentation.

---

## GAPS / UNCERTAIN

1. **`useAgentEvents` SESSION_REGISTER exact trigger condition** — needs focused read of `ComposerContextPreview.tsx` and `useChatSessionBridge.ts` in full.

2. **`loadSession()` vs `findSession()` distinction in MinimalOrchestration** — confirmed `loadSession()` scans by `session.id` not `session.taskId`; whether `findSession()` exists with different semantics not confirmed.

3. **`streamChunkListeners` subscription count** — only `agentChatEventForwarders.ts` identified; web server layer (`src/main/web/`) behavior in multi-window scenarios unconfirmed.

4. **`useRafBatchedChunks` flush timing with `documentHidden`** — flag logged at receive time; whether rAF is paused/flushed differently when document hidden not confirmed.

5. **Exact `session_id` field presence per stream-json event type** — `StreamJsonResultEvent.session_id` is optional; which event types reliably carry it not confirmed.

6. **`agentChatWorkspaceSupport.ts` snapshot merge conflict resolution** — tie-breaking rule when IPC thread update and DOM snapshot event arrive same render cycle not confirmed.

7. **`conversationCompactor.ts` invocation trigger** — exact threshold and trim policy not read.

8. **`adaptiveBudget.ts` interaction with `maxTokens` setting** — whether it overrides or supplements unconfirmed.

9. **`threadHydrator.ts` interaction with MinimalOrchestration restart** — fallback path that reconstructs `TaskSessionRecord` from SQLite (not in-memory) not confirmed.

10. **Web server chat integration** — `src/main/web/` HTTP/WebSocket layer; whether it subscribes to `streamChunkListeners` or has separate event path not investigated.
