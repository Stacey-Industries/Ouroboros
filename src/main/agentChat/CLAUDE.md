<!-- claude-md-auto:start -->

The existing CLAUDE.md is already present and accurate. Based on my reads of the source files, here is the up-to-date content:

---

# Agent Chat — Chat thread persistence, orchestration bridge, and session projection

## Key Files

| File                                 | Role                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`                           | Public API — `createAgentChatService()` factory assembles bridge + store into `AgentChatService`. Barrel-exports all submodules.                                         |
| `types.ts`                           | All type definitions — thread records, message records, content blocks, stream chunks, events, API surface (`AgentChatAPI`).                                             |
| `events.ts`                          | IPC channel constants (`agentChat:createThread`, etc.) and event type maps. No logic.                                                                                    |
| `chatOrchestrationBridge.ts`         | Core runtime — bridges chat UI ↔ orchestration layer. Sends messages, manages streaming, buffers chunks for reconnection, handles revert-to-snapshot via `git checkout`. |
| `chatOrchestrationBridgeSupport.ts`  | Pure helpers for the bridge — status mapping (`OrchestrationStatus` → `AgentChatThreadStatus`), link building, result constructors, deterministic message ID scheme.     |
| `chatOrchestrationRequestSupport.ts` | Request preparation — resolves send options (mode, provider, model, effort, permissionMode), builds `TaskRequest`, derives/generates thread titles.                      |
| `threadStore.ts`                     | `AgentChatThreadStore` facade over the SQLite runtime backend. CRUD for threads + messages, branching, workspace filtering, max 100 threads.                             |
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
- **Auto-titling**: First user message → initial title. After first assistant response, `updateTitleFromResponse` replaces it with a summary (first meaningful sentence, skipping decorative lines). Max 60 chars.
- **Content block merging**: `mergeAdjacentTextBlocks` collapses text blocks separated only by `thinking` blocks. Tool-use blocks break the merge to preserve interleaving.
- **`*Support.ts` decomposition**: Large files split into `Foo.ts` (orchestration logic) + `FooSupport.ts` (pure helpers/builders). Keeps cyclomatic complexity under ESLint's limit of 10.

## Gotchas

- **Two storage backends coexist**: SQLite is primary (instantiated in `threadStore.ts`); JSON runtime (`threadStoreRuntimeSupport.ts`) is the original implementation. Both share normalization via `threadStoreSupport.ts`. Title logic (`isDecorativeLine` + `summarizeForTitle`) is duplicated between them — changes must be made in both.
- **Projector vs bridge content ownership**: The event projector derives assistant content from session metadata (`providerArtifact.lastMessage`), but the streaming bridge accumulates real response text from deltas. The projector explicitly preserves existing assistant content to avoid overwriting — see `eventProjector.ts:41-43`.
- **Pre-snapshot hash**: Before each agent turn, the bridge captures `git rev-parse HEAD` into `AgentChatOrchestrationLink.preSnapshotHash`. `revertToSnapshot` uses `git checkout` — destructive and not undoable.
- **`isNonEmptyString` exported from two places**: `utils.ts` (canonical) and re-exported from `threadStoreSupport.ts` for backward compat.
- **Sticky orchestration fields**: `eventProjector.ts:84-92` preserves `linkedTerminalId` and `claudeSessionId` from existing thread link when the session update doesn't carry them — early lifecycle events fire before the adapter populates these fields.
- **Thread status reconciliation**: `AgentChatThreadStatus` has 7 states (`idle` → `submitting` → `running` → `verifying` → `needs_review` → `complete`/`failed`/`cancelled`). The service reconciles stale `running`/`submitting` statuses on every `listThreads` call.

## Dependencies

| Direction       | Module                         | Relationship                                                                |
| --------------- | ------------------------------ | --------------------------------------------------------------------------- |
| **depends on**  | `../orchestration/types`       | `TaskSessionRecord`, `OrchestrationAPI`, `TaskRequest`, `OrchestrationMode` |
| **depends on**  | `../config`                    | `getConfigValue` for settings, `ClaudeCliSettings` type                     |
| **depends on**  | `../hooks`                     | `dispatchSyntheticHookEvent` — fires hook events for agent chat turns       |
| **depends on**  | `../storage/database`          | SQLite helpers (`openDatabase`, `runTransaction`, `setSchemaVersion`)       |
| **consumed by** | `../ipc-handlers/agentChat.ts` | Registers all `agentChat:*` IPC handlers using `AgentChatService`           |

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# Agent Chat — Chat thread persistence, orchestration bridge, and session projection

## Key Files

| File                                 | Role                                                                                                                                                                     |
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
