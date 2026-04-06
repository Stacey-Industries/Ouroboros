<!-- claude-md-auto:start -->
The existing CLAUDE.md is mostly accurate but missing the `Bridge*.ts` split files and several support modules. Here's the generated content:

---

# `src/main/agentChat/` — Chat thread persistence, orchestration bridge, and session projection

## Summary

Chat subsystem: manages conversation threads in SQLite, bridges the renderer ↔ orchestration layer (streaming, cancellation, revert), and projects session state into typed thread records.

## Key Files

### Public Surface
| File | Role |
|------|------|
| `index.ts` | `createAgentChatService()` factory — assembles bridge + store into `AgentChatService`. Barrel-exports all submodules. |
| `types.ts` | Re-exports all cross-boundary types from `@shared/types/agentChat`. Canonical consumer for main-process imports. |
| `events.ts` | IPC channel name constants. No logic. |

### Orchestration Bridge (one logical unit split across 7 files for ESLint line limits)
| File | Role |
|------|------|
| `chatOrchestrationBridge.ts` | Hub — runtime state (`AgentChatBridgeRuntime`), `sendMessage`, chunk buffering, subscription setup, revert dispatch. |
| `chatOrchestrationBridgeTypes.ts` | Internal shared types: `ActiveStreamContext`, `AgentChatBridgeRuntime`, `OrchestrationClient`, `StreamChunkListener`. |
| `chatOrchestrationBridgeSend.ts` | Task creation + start flow — builds `TaskRequest`, captures git HEAD hash, links task to thread. |
| `chatOrchestrationBridgeProgress.ts` | Provider progress event handlers — streaming, completion, cancellation, failure routing. |
| `chatOrchestrationBridgePersist.ts` | Persistence for terminal progress events — writes completed/cancelled/failed turns to SQLite. |
| `chatOrchestrationBridgeMonitor.ts` | Emits `agentChat:stream` IPC chunks and monitor events; incremental flush timer. |
| `chatOrchestrationBridgeSupport.ts` | Pure helpers — status mapping, link builders, message ID scheme, failure constructors. |
| `chatOrchestrationBridgeSubTools.ts` | Sub-tool stream chunk accumulation and projection. |
| `chatOrchestrationBridgeGit.ts` | `captureHeadHash` + `revertToSnapshotWithBridge` — git ops for pre/post turn snapshots. |
| `chatOrchestrationBridgePersistHelpers.ts` | Low-level helpers used by `BridgePersist.ts`: `upsertOrAppendMessage`, `emitTurnComplete`, `emitSnapshotChunk`. |

### Request Preparation
| File | Role |
|------|------|
| `chatOrchestrationRequestSupport.ts` | `preparePendingSend` — resolves send options (provider, model, mode, effort, permissionMode), builds `TaskRequest`. |
| `chatOrchestrationRequestSupportHelpers.ts` | Pure builders factored out of request support to stay under line limit. |
| `chatOrchestrationHistorySupport.ts` | Converts thread message history into `TaskRequest` conversation format. |
| `chatTitleDerivation.ts` | `deriveSmartTitle` (heuristic, sync) + `generateLlmTitle` (LLM, async). Skips decorative lines like `★ Insight ───`. Max 60 chars. |

### Thread Store
| File | Role |
|------|------|
| `threadStore.ts` | `AgentChatThreadStore` facade — CRUD, branching, workspace filtering, max 100 threads. |
| `threadStoreSqlite.ts` | SQLite backend — `threads` + `messages` tables with FK cascade, schema v1. |
| `threadStoreSqliteHelpers.ts` | SQL query helpers extracted from the SQLite runtime. |
| `threadStoreRuntimeSupport.ts` | JSON file backend (legacy) — `{sha1(id)}.json` per thread, mutation queue serializes writes. |
| `threadStoreSupport.ts` | Shared normalization: `normalizeThreadRecord`, `upsertMessage`, `hashThreadId`, `isDecorativeLine`. |
| `threadHydrator.ts` | Rehydrates thread from orchestration session on crash recovery. |

### Projectors
| File | Role |
|------|------|
| `eventProjector.ts` | Session-update projector — syncs `TaskSessionRecord` state into thread records. |
| `eventProjectorSupport.ts` | Builds projected messages with deterministic IDs: `agent-chat:{sessionId}:{kind}`. |
| `responseProjector.ts` | Streaming projector — converts `ProviderProgressEvent` results/failures into `AgentChatMessageRecord`. Merges adjacent text blocks. |

### Session & Memory
| File | Role |
|------|------|
| `sessionMemory.ts` | In-memory session store — maps `sessionId` → metadata during active turns. |
| `memoryExtractor.ts` | Extracts memorizable facts from assistant responses. |
| `settingsResolver.ts` | Resolves `AgentChatSettings` + `ClaudeCliSettings` from partial config. Providers: `anthropic-api`, `claude-code`, `codex`. |
| `adaptiveBudget.ts` | Dynamic token budget calculation based on conversation length and model. |
| `conversationCompactor.ts` | Trims conversation history to fit within token limits. |
| `tokenCalibration.ts` | Token count calibration store — tracks actual vs estimated tokens to refine budget math. |
| `utils.ts` | `getErrorMessage`, `isNonEmptyString` — shared micro-utilities. |

## Architecture

```
Renderer (IPC)  →  AgentChatService (index.ts)
                       ├── AgentChatOrchestrationBridge  ←→  OrchestrationAPI
                       │       ├── BridgeSend   — task creation + git snapshot
                       │       ├── BridgeProgress — stream routing
                       │       ├── BridgePersist — SQLite writes on completion
                       │       ├── BridgeMonitor — IPC stream emission + flush timer
                       │       └── BridgeGit    — revert-to-snapshot
                       ├── AgentChatThreadStore
                       │       ├── ThreadStoreSqliteRuntime  (primary)
                       │       └── AgentChatThreadStoreRuntime (JSON, legacy)
                       └── EventProjector (session updates → thread records)
```

## Patterns

- **Bridge file split is intentional, not architectural**: `chatOrchestrationBridge*.ts` is one cohesive module split to stay under ESLint `max-lines: 300`. Don't treat the split files as independent subsystems.
- **Deterministic message IDs**: `agent-chat:{sessionId}:assistant` (also `:context`, `:progress`, `:verification`, `:result`). Bridge and projector write to the same ID — prevents duplicates on crash recovery.
- **Projector preserves streaming content**: `eventProjector.ts` never overwrites existing assistant message content — the streaming bridge owns that field during active turns.
- **`*Support.ts` naming**: Whenever a file would exceed 300 lines, pure helpers are extracted to `*Support.ts` or `*Helpers.ts`. The base file retains orchestration/flow logic.
- **Reconcile-on-list**: `listThreads` cross-references active bridge thread IDs — threads stuck in `running`/`submitting` without an active send are reset to `idle`.
- **Stream chunk buffer**: Bridge holds chunks in memory per-thread for renderer refresh replay.

## Gotchas

- **Two storage backends coexist**: SQLite is primary; JSON runtime is legacy. Both share `threadStoreSupport.ts` normalization. `listThreads` reads from SQLite only — JSON threads not in the DB are invisible.
- **Pre-snapshot hash**: Bridge captures `git rev-parse HEAD` before each turn into `preSnapshotHash`. `revertToSnapshot` runs `git checkout` — **destructive, cannot be undone**.
- **Title logic duplicated**: `threadStoreSqlite.ts` and `threadStoreRuntimeSupport.ts` both implement `isDecorativeLine` + title trimming. Changes must be applied in both.
- **Sticky orchestration fields**: `eventProjector.ts` preserves `linkedTerminalId` and `claudeSessionId` from the existing thread link — early lifecycle events fire before the adapter sets these fields.
- **`isNonEmptyString` exported from two places**: canonical in `utils.ts`, re-exported from `threadStoreSupport.ts` for backward compat.
- **`tokenCalibration` is a module-level singleton**: `tokenCalibrationStore` is imported directly in `BridgePersist.ts` — not injected. Reset state in tests by resetting the module.

## Dependencies

| Direction | Module | Relationship |
|-----------|--------|-------------|
| **depends on** | `../orchestration/types` | `TaskSessionRecord`, `OrchestrationAPI`, `TaskRequest`, `OrchestrationMode` |
| **depends on** | `../config` | `getConfigValue` for settings, `ClaudeCliSettings` type |
| **depends on** | `../hooks` | `beginChatSessionLaunch` — fires hook events for agent chat turns |
| **depends on** | `../storage/database` | SQLite helpers (`openDatabase`, `runTransaction`, `setSchemaVersion`) |
| **depends on** | `@shared/types/agentChat` | All cross-boundary types (re-exported via `types.ts`) |
| **consumed by** | `../ipc-handlers/agentChat.ts` | Registers all `agentChat:*` IPC handlers using `AgentChatService` |
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# Agent Chat — Chat thread persistence, orchestration bridge, and session projection

## Key Files

| File                                 | Role                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`                           | Public API — `createAgentChatService()` factory assembles bridge + store into `AgentChatService`. Barrel-exports all submodules.                                         |
| `types.ts`                           | All type definitions — thread records, message records, content blocks, stream chunks, events, API surface (`AgentChatAPI`).                                             |
| `events.ts`                          | IPC channel constants (`agentChat:createThread`, etc.) and event type maps. No logic.                                                                                    |
| `chatOrchestrationBridge.ts`         | Core runtime — bridges chat UI ↔ orchestration layer. Sends messages, manages streaming, buffers chunks for reconnection, handles revert-to-snapshot via `git checkout`. |
| `chatOrchestrationBridgeSupport.ts`  | Pure helpers for the bridge — status mapping (`OrchestrationStatus` → `AgentChatThreadStatus`), link building, result constructors, deterministic message ID scheme.     |
| `chatOrchestrationRequestSupport.ts` | Request preparation — resolves send options (mode, provider, model, effort, permissionMode), builds `TaskRequest`, derives/generates thread titles.                      |
| `threadStore.ts`                     | `AgentChatThreadStore` class — facade over the SQLite runtime backend. CRUD for threads + messages, branching, workspace filtering, max 100 threads.                     |
| `threadStoreSqlite.ts`               | SQLite runtime — `threads` + `messages` tables with FK cascade. Schema version 1. Auto-titles from assistant responses.                                                  |
| `threadStoreRuntimeSupport.ts`       | JSON file runtime (original backend) — reads/writes `{sha1(threadId)}.json` in `userData/agent-chat/threads/`. Mutation queue serializes writes.                         |
| `threadStoreSupport.ts`              | Normalization — `normalizeThreadRecord`, `normalizeMessages`, `upsertMessage`, `hashThreadId`. Shared by both storage backends.                                          |
| `eventProjector.ts`                  | Session → thread projector — syncs orchestration session state into thread records (status, link, messages). Called on `onSessionUpdate`.                                |
| `eventProjectorSupport.ts`           | Builds projected messages from `TaskSessionRecord` — context, progress, verification, result, assistant. Deterministic IDs: `agent-chat:{sessionId}:{kind}`.             |
| `responseProjector.ts`               | Converts provider results/failures into `AgentChatMessageRecord`. Merges adjacent text blocks, formats tool/cost/duration summaries.                                     |
| `settingsResolver.ts`                | Resolves `AgentChatSettings` + `ClaudeCliSettings` from partial config with validated defaults. Providers: `anthropic-api`, `claude-code`, `codex`.                      |
| `threadHydrator.ts`                  | On-demand rehydration — loads orchestration session for a thread and re-projects messages to recover from crashes/restarts.                                              |
| `utils.ts`                           | `getErrorMessage()` and `isNonEmptyString()` — shared micro-utilities.                                                                                                   |

## Architecture

```
Renderer (IPC)  →  AgentChatService (index.ts)
                       ├── AgentChatOrchestrationBridge  ←→  OrchestrationAPI
                       │       ├── streams chunks → renderer via IPC events
                       │       ├── buffers chunks for reconnection after refresh
                       │       └── captures git HEAD pre-snapshot for revert
                       ├── AgentChatThreadStore
                       │       ├── ThreadStoreSqliteRuntime (primary)
                       │       └── AgentChatThreadStoreRuntime (JSON fallback)
                       └── EventProjector (session updates → thread records)
```

## Patterns

- **Deterministic message IDs**: `agent-chat:{sessionId}:assistant` (and `:context`, `:progress`, `:verification`, `:result`). The bridge and projector both write to the same ID — prevents duplicates after crash recovery.
- **Mutation queue**: JSON runtime serializes all writes through `runMutation()`. SQLite backend uses transactions instead.
- **Stream chunk buffering**: Bridge holds chunks in memory per-thread so renderer refresh can replay without re-querying.
- **Reconcile on list**: `listThreads` cross-references bridge's active thread IDs — threads stuck in `running`/`submitting` without an active send get reset to `idle`.
- **Auto-titling**: First user message → initial title. After first assistant response, `updateTitleFromResponse` replaces it with a summary (first meaningful sentence, skipping decorative lines like `★ Insight ───`). Max 60 chars.
- **Content block merging**: `mergeAdjacentTextBlocks` collapses text blocks separated only by `thinking` blocks. Tool-use blocks break the merge to preserve interleaving positions.
- **`*Support.ts` decomposition**: Large files split into `Foo.ts` (orchestration logic) + `FooSupport.ts` (pure helpers/builders). Keeps cyclomatic complexity under ESLint's limit of 10.

## Gotchas

- **Two storage backends coexist**: SQLite is primary (instantiated in `threadStore.ts`); JSON runtime (`threadStoreRuntimeSupport.ts`) is the original implementation. Both share normalization via `threadStoreSupport.ts`.
- **Projector vs bridge content ownership**: The event projector derives assistant content from session metadata (`providerArtifact.lastMessage`), but the streaming bridge accumulates real response text from deltas. The projector explicitly preserves existing assistant content to avoid overwriting — see `eventProjector.ts:41-43`.
- **Pre-snapshot hash**: Before each agent turn, the bridge captures `git rev-parse HEAD` into `AgentChatOrchestrationLink.preSnapshotHash`. `revertToSnapshot` uses `git checkout` — destructive and not undoable.
- **Title logic duplicated**: Both `threadStoreSqlite.ts` and `threadStoreRuntimeSupport.ts` implement `isDecorativeLine` + `summarizeForTitle`. Changes must be made in both.
- **`isNonEmptyString` exported from two places**: `utils.ts` (canonical) and re-exported from `threadStoreSupport.ts` for backward compat.
- **Sticky orchestration fields**: `eventProjector.ts:84-92` preserves `linkedTerminalId` and `claudeSessionId` from existing thread link when the session update doesn't carry them (early lifecycle events fire before the adapter populates these).

## Dependencies

| Direction       | Module                         | Relationship                                                                |
| --------------- | ------------------------------ | --------------------------------------------------------------------------- |
| **depends on**  | `../orchestration/types`       | `TaskSessionRecord`, `OrchestrationAPI`, `TaskRequest`, `OrchestrationMode` |
| **depends on**  | `../config`                    | `getConfigValue` for settings, `ClaudeCliSettings` type                     |
| **depends on**  | `../hooks`                     | `dispatchSyntheticHookEvent` — fires hook events for agent chat turns       |
| **depends on**  | `../storage/database`          | SQLite helpers (`openDatabase`, `runTransaction`, `setSchemaVersion`)       |
| **consumed by** | `../ipc-handlers/agentChat.ts` | Registers all `agentChat:*` IPC handlers using `AgentChatService`           |
