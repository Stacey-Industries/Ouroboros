<!-- claude-md-auto:start -->

`★ Insight ─────────────────────────────────────`
`graphSummaryBuilder.ts` uses defensive property aliasing (`e.callerCount ?? e.fanIn ?? e.fan_in ?? e.inDegree`) to normalize inconsistent shape from the graph engine — a good signal that the `GraphController` API is still evolving and its shape shouldn't be assumed stable.
`─────────────────────────────────────────────────`

Here is the generated CLAUDE.md content:

---

# Orchestration — Context Preparation & Provider Coordination

Builds the **context packet** that feeds every AI task: indexes the repo, selects relevant files, budgets token usage, and assembles a structured payload for provider adapters in `providers/`.

## Key Files

| File                             | Role                                                                                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                       | All shared types — `TaskRequest`, `ContextPacket`, `RepoFacts`, `OrchestrationState`, provider events, verification types. 600+ lines, single source of truth for the orchestration domain.     |
| `repoIndexer.ts`                 | Scans workspace roots: file tree, languages, entry points, git diff, diagnostics, recent commits. Produces `RepoFacts` and `RepoIndexSnapshot`. Two-level cache (root + workspace).             |
| `contextSelector.ts`             | Ranks files by relevance using weighted reasons (`user_selected: 100`, `pinned: 95`, `git_diff: 56`, etc.). Resolves imports, keywords, test companions. Output: scored `RankedContextFile[]`.  |
| `contextSelectionSupport.ts`     | Low-level helpers: file snapshot loading (IDE tool socket or disk fallback), keyword extraction, import specifier parsing, live IDE state collection. Owns the persistent snapshot cache.       |
| `contextPacketBuilder.ts`        | Top-level builder: calls selector → derives snippets → applies budget → assembles `ContextPacket`. Session-level cache with SHA-1 fingerprint (60s TTL). Optionally enriches via context layer. |
| `contextPacketBuilderSupport.ts` | Snippet derivation and budget enforcement. Model-aware profiles (Opus: 128KB/32K tokens, Sonnet: 72KB/18K tokens, default: 48KB/12K tokens). Deduplicates overlapping snippet ranges.           |
| `graphSummaryBuilder.ts`         | Queries native `GraphController` for structural hotspots and uncommitted-change blast radius. Formats as markdown (≤2400 chars / ~600 tokens) for context injection.                            |
| `events.ts`                      | IPC channel name constants (`orchestration:createTask`, etc.) and event type literals. No logic — import from here, never hardcode strings.                                                     |
| `providers/`                     | Provider adapters (Claude Code CLI, Anthropic API, etc.) — has its own CLAUDE.md.                                                                                                               |

## Data Flow

```
TaskRequest
  → repoIndexer.buildRepoFacts()              # scan workspace, git, diagnostics
  → contextSelector.selectContextFiles()       # rank files by multi-signal scoring
  → contextPacketBuilder.buildContextPacket()  # snippet extraction + budget + cache
  → providers/*.ts                             # send packet to AI provider
```

## Context Selection Scoring

Files are scored by summing weighted reasons:

| Reason             | Weight | Notes                                  |
| ------------------ | ------ | -------------------------------------- |
| `user_selected`    | 100    | Explicitly picked for this task        |
| `pinned`           | 95     | Persistent context pin                 |
| `included`         | 85     | Request-level inclusion                |
| `dirty_buffer`     | 68     | Unsaved changes                        |
| `git_diff`         | 56     | In current diff                        |
| `diagnostic`       | 52     | Has LSP errors/warnings                |
| `test_companion`   | 38     | `*.test.ts` sibling of a seed file     |
| `recent_edit`      | 32     | Recently modified                      |
| `keyword_match`    | 26+    | Goal text matches (additive per match) |
| `import_adjacency` | 22+    | Imports or is imported by seed files   |

Confidence tier: `high` if user-selected, pinned, dirty, score ≥ 80, or has diagnostics/diff. `medium` if score ≥ 35 or ≥ 2 reasons. Otherwise `low`.

## Caching

Three independent module-level `Map` caches:

| Cache              | Location                     | Key                                 | TTL                     | Invalidation                                        |
| ------------------ | ---------------------------- | ----------------------------------- | ----------------------- | --------------------------------------------------- |
| **Repo index**     | `repoIndexer.ts`             | root path + state key               | Until state key changes | `clearRepoIndexCache()`                             |
| **Context packet** | `contextPacketBuilder.ts`    | workspace roots + SHA-1 fingerprint | 60 s                    | `clearContextPacketCache()` or fingerprint mismatch |
| **File snapshots** | `contextSelectionSupport.ts` | normalized path                     | Indefinite              | `invalidateSnapshotCache(paths?)`                   |

The SHA-1 fingerprint in `contextPacketBuilder` is computed from file _paths_ and the goal text — not file _contents_ — so fingerprint comparison is nearly free. File content is only read when the fingerprint misses.

## Gotchas

- **IDE tool socket for snapshot loading**: `contextSelectionSupport.ts` fetches file content via named pipe (`\\.\pipe\ouroboros-tools` on Windows, `/tmp/ouroboros-tools.sock` on Unix) to get unsaved buffer content from the renderer. Falls back to `fs.readFile` if the socket is unavailable. `loadContextFileSnapshotFast` skips the socket entirely — use it when unsaved content isn't needed.
- **Duplicate `toPathKey`**: A `toPathKey` normalization function exists in both `contextSelectionSupport.ts` and `contextPacketBuilderSupport.ts`. They are identical but not shared; keep them in sync if you change path normalization.
- **Greedy budget enforcement**: Snippets are accepted in ranked order until the byte/token budget is exhausted. A large early snippet can crowd out many smaller relevant ones. There is no backtracking.
- **Context layer enrichment is optional**: `buildContextPacket` dynamically `import()`s `contextLayerController` and silently catches failures — the packet is valid and returned without enrichment if the context layer is unavailable.
- **Snapshot cache never expires**: The persistent cache in `contextSelectionSupport.ts` has no TTL. Callers must call `invalidateSnapshotCache(paths)` after file saves, or the cache will serve stale content indefinitely.
- **`graphSummaryBuilder` normalizes unstable GraphController shape**: Property lookups use aliased chains (`e.callerCount ?? e.fanIn ?? e.fan_in`) because the GraphController API is not yet stable. Don't assume a single canonical field name.

## Dependencies

| Depends on                         | For                                                            |
| ---------------------------------- | -------------------------------------------------------------- |
| `../contextLayer/`                 | Language strategies, context layer enrichment (dynamic import) |
| `../codebaseGraph/graphController` | Hotspot and blast radius data via `getGraphController()`       |
| `../lspState`, `../lspHelpers`     | Per-window LSP diagnostic data                                 |
| `../ipc-handlers/contextDetectors` | `readTextSafe` — safe file content reader                      |
| `../ipc-handlers/contextScanner`   | `scanProject` — entry point discovery                          |
| `../ptyOutputBuffer`               | Terminal output ring buffer for live IDE state snapshots       |

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# Orchestration — Context Preparation & Provider Coordination

Builds the **context packet** that feeds every AI task: indexes the repo, selects relevant files, budgets token usage, and assembles a structured payload for provider adapters in `providers/`.

## Key Files

| File                             | Role                                                                                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                       | All shared types — `TaskRequest`, `ContextPacket`, `RepoFacts`, `OrchestrationState`, provider events, verification types. 600+ lines, the single source of truth for the orchestration domain. |
| `repoIndexer.ts`                 | Scans workspace roots: file tree, languages, entry points, git diff, diagnostics, recent commits. Produces `RepoFacts` and `RepoIndexSnapshot`. Two-level cache (root + workspace).             |
| `contextSelector.ts`             | Ranks files by relevance using weighted reasons (`user_selected: 100`, `pinned: 95`, `git_diff: 56`, etc.). Resolves imports, keywords, test companions. Output: scored `RankedContextFile[]`.  |
| `contextSelectionSupport.ts`     | Low-level helpers for context selection: file snapshot loading (via IDE tool socket or disk), keyword extraction, import specifier parsing, live IDE state collection.                          |
| `contextPacketBuilder.ts`        | Top-level builder: calls selector → derives snippets → applies budget → assembles `ContextPacket`. Session-level cache with SHA-1 fingerprint (60s TTL). Optionally enriches via context layer. |
| `contextPacketBuilderSupport.ts` | Snippet derivation and budget enforcement. Model-aware profiles (Opus: 128KB/32K tokens, Sonnet: 72KB/18K tokens, default: 48KB/12K tokens). Deduplicates overlapping ranges.                   |
| `graphSummaryBuilder.ts`         | Queries native `GraphController` for structural hotspots and uncommitted-change blast radius. Formats as markdown for context injection.                                                        |
| `events.ts`                      | IPC channel constants (`orchestration:createTask`, etc.) and event type literals.                                                                                                               |
| `providers/`                     | Provider adapters (Claude Code CLI, Anthropic API, etc.) — has its own CLAUDE.md.                                                                                                               |

## Data Flow

```
TaskRequest
  → repoIndexer.buildRepoFacts()           # scan workspace, git, diagnostics
  → contextSelector.selectContextFiles()    # rank files by multi-signal scoring
  → contextPacketBuilder.buildContextPacket()  # snippet extraction + budget + cache
  → providers/*.ts                          # send packet to AI provider
```

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

## Dependencies

| Depends on                         | For                                                            |
| ---------------------------------- | -------------------------------------------------------------- |
| `../contextLayer/`                 | Language strategies, context layer enrichment (dynamic import) |
| `../codebaseGraph/graphController` | Hotspot and blast radius data                                  |
| `../lspState`, `../lspHelpers`     | LSP diagnostics                                                |
| `../ipc-handlers/contextDetectors` | `readTextSafe` for file content                                |
| `../ipc-handlers/contextScanner`   | `scanProject` for entry points                                 |
| `../ptyOutputBuffer`               | Terminal output snapshots for live IDE state                   |
