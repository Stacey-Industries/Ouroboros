<!-- claude-md-auto:start -->
Here's what changed from the previous version:

**Fixes:**
- `types.ts` row: was described as "600+ lines, single source of truth" — it's actually a 14-line re-export barrel. The description now explains the intentional split across `typesDomain.ts` / `typesContext.ts` / `typesProvider.ts` and why (300-line ESLint limit).
- `events.ts` row: now accurately describes the `satisfies` compile-time type checks it contains, not just "IPC channel constants".

**Additions:**
- `contextWorker.ts` added to the key files table with its actual role (worker thread, 30s proactive refresh).
- A note in the Data Flow section explaining the worker's proactive warm-up pattern.
- A gotcha entry for the `types.ts` barrel to prevent future confusion.
- `@shared/ipc/orchestrationChannels` added to the Dependencies table.
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# Orchestration — Context Preparation & Provider Coordination

Builds the **context packet** that feeds every AI task: indexes the repo, selects relevant files, budgets token usage, and assembles a structured payload for provider adapters in `providers/`.

## Key Files

| File                             | Role                                                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                       | Re-export barrel — imports from `typesDomain.ts`, `typesContext.ts`, `typesProvider.ts`. All three together define `TaskRequest`, `ContextPacket`, `RepoFacts`, `OrchestrationState`, provider events, and verification types. |
| `repoIndexer.ts`                 | Scans workspace roots: file tree, languages, entry points, git diff, diagnostics, recent commits. Produces `RepoFacts` and `RepoIndexSnapshot`. Two-level cache (root + workspace).            |
| `contextSelector.ts`             | Ranks files by relevance using weighted reasons (`user_selected: 100`, `pinned: 95`, `git_diff: 56`, etc.). Resolves imports, keywords, test companions. Output: scored `RankedContextFile[]`. |
| `contextSelectionSupport.ts`     | Low-level helpers for context selection: file snapshot loading (via IDE tool socket or disk), keyword extraction, import specifier parsing, live IDE state collection.                         |
| `contextPacketBuilder.ts`        | Top-level builder: calls selector → derives snippets → applies budget → assembles `ContextPacket`. Session-level cache with SHA-1 fingerprint (60s TTL). Optionally enriches via context layer. |
| `contextPacketBuilderSupport.ts` | Snippet derivation and budget enforcement. Model-aware profiles (Opus: 128KB/32K tokens, Sonnet: 72KB/18K tokens, default: 48KB/12K tokens). Deduplicates overlapping ranges.                  |
| `contextWorker.ts`               | Worker thread entry point — runs `buildRepoIndexSnapshot` + `buildContextPacket` off the main thread so the Electron event loop stays responsive during periodic 30s background refreshes.    |
| `graphSummaryBuilder.ts`         | Queries native `GraphController` for structural hotspots and uncommitted-change blast radius. Formats as markdown for context injection.                                                       |
| `events.ts`                      | Re-exports IPC channel constants and event type literals from `@shared/ipc/orchestrationChannels`. Includes compile-time `satisfies` checks to keep main/shared types in sync.                |
| `providers/`                     | Provider adapters (Claude Code CLI, Anthropic API, etc.) — has its own CLAUDE.md.                                                                                                              |

## Data Flow

```
TaskRequest
  → repoIndexer.buildRepoFacts()               # scan workspace, git, diagnostics
  → contextSelector.selectContextFiles()        # rank files by multi-signal scoring
  → contextPacketBuilder.buildContextPacket()  # snippet extraction + budget + cache
  → providers/*.ts                             # send packet to AI provider
```

The worker thread (`contextWorker.ts`) runs the same pipeline proactively on a 30s interval using a dummy `TaskRequest`, so a warm packet is available before the user submits a task.

## Context Selection Scoring

Files are scored by summing weighted reasons. Key weights:

| Reason             | Weight | Notes                           |
| ------------------ | ------ | ------------------------------- |
| `user_selected`    | 100    | Explicitly picked for this task |
| `pinned`           | 95     | Persistent context pin          |
| `included`         | 85     | Request-level inclusion         |
| `dirty_buffer`     | 68     | Unsaved changes                 |
| `git_diff`         | 56     | In current diff                 |
| `diagnostic`       | 52     | Has errors/warnings             |
| `test_companion`   | 38     | `*.test.ts` sibling             |
| `recent_edit`      | 32     | Recently modified               |
| `keyword_match`    | 26+    | Goal text matches (additive)    |
| `import_adjacency` | 22+    | Imports/imported-by seed files  |

Confidence: `high` if user-selected, pinned, dirty, score ≥ 80, or has diagnostics/diff. `medium` if score ≥ 35 or ≥ 2 reasons. Otherwise `low`.

## Caching

Three independent caches — all module-level `Map`s:

| Cache              | Location                     | Key                                 | TTL                     | Invalidation                                        |
| ------------------ | ---------------------------- | ----------------------------------- | ----------------------- | --------------------------------------------------- |
| **Repo index**     | `repoIndexer.ts`             | root path + state key               | Until state key changes | `clearRepoIndexCache()`                             |
| **Context packet** | `contextPacketBuilder.ts`    | workspace roots + SHA-1 fingerprint | 60s                     | `clearContextPacketCache()` or fingerprint mismatch |
| **File snapshots** | `contextSelectionSupport.ts` | normalized path                     | Indefinite              | `invalidateSnapshotCache(paths?)`                   |

## Gotchas

- **IDE tool socket** (`contextSelectionSupport.ts`): Loads file content via named pipe (`\\.\pipe\ouroboros-tools` on Windows, `/tmp/ouroboros-tools.sock` on Unix). Falls back to `fs.readFile` if socket is unavailable. The "fast" loader (`loadContextFileSnapshotFast`) skips the socket entirely — use it when unsaved buffer content isn't needed.
- **`toPathKey` normalization**: Paths are normalized + lowercased for map keys. Two separate `toPathKey` implementations exist (one in `contextSelectionSupport.ts`, one in `contextPacketBuilderSupport.ts`) — they're identical but not shared.
- **Budget enforcement is greedy**: Snippets are accepted in order until the byte/token budget is exhausted. A large early snippet can crowd out many smaller relevant ones.
- **Context layer enrichment is optional**: `buildContextPacket` dynamically imports `contextLayerController` and silently catches failures — the packet is valid without enrichment.
- **Snapshot cache never expires**: The persistent snapshot cache in `contextSelectionSupport.ts` has no TTL. It relies on callers to invalidate after file saves.
- **`types.ts` is a barrel, not a monolith**: The 300-line ESLint limit forced a split into `typesDomain.ts` / `typesContext.ts` / `typesProvider.ts`. Import from `types.ts` as normal — it re-exports everything.

## Dependencies

| Depends on                         | For                                                            |
| ---------------------------------- | -------------------------------------------------------------- |
| `../contextLayer/`                 | Language strategies, context layer enrichment (dynamic import) |
| `../codebaseGraph/graphController` | Hotspot and blast radius data                                  |
| `../lspState`, `../lspHelpers`     | LSP diagnostics                                                |
| `../ipc-handlers/contextDetectors` | `readTextSafe` for file content                                |
| `../ipc-handlers/contextScanner`   | `scanProject` for entry points                                 |
| `../ptyOutputBuffer`               | Terminal output snapshots for live IDE state                   |
| `@shared/ipc/orchestrationChannels`| IPC channel name constants (shared with renderer)             |
