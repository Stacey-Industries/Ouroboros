# codebaseGraph — In-process codebase knowledge graph engine

Indexes source code into a graph of symbols and relationships. Native replacement for the external `codebase-memory` MCP server — runs entirely in the main process with no external dependencies beyond tree-sitter WASM.

## Key Files

| File                      | Role                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graphController.ts`      | Singleton facade — owns store + query engine, exposes 14 tool methods mirroring MCP server, handles init/dispose and debounced file-change reindexing with concurrency guard                         |
| `graphStore.ts`           | In-memory `Map<id, GraphNode>` + `GraphEdge[]` with JSON persistence to `.ouroboros/graph.json`. No SQLite.                                                                                          |
| `graphQuery.ts`           | Query engine — fuzzy search (exact/prefix/substring/fuzzy scoring), BFS call-path tracing, architecture views (hotspots, modules, file tree), mtime-based change detection, simplified Cypher parser |
| `graphParser.ts`          | Public parsing API — routes files to AST or regex parser, `resolveEdgeReferences()` resolves `__file::`/`__unresolved::` placeholders after all files parsed                                         |
| `graphParserAst.ts`       | Tree-sitter AST extraction for TS/JS — functions, classes, interfaces, type aliases, imports, exports, containment edges                                                                             |
| `graphParserCallGraph.ts` | Call graph edges — walks function bodies for `call_expression` nodes, maps to local symbols or `__unresolved::` placeholders. Filters `BUILTIN_CALLEES`.                                             |
| `graphParserRegex.ts`     | Regex fallback for TS/JS when tree-sitter unavailable — patterns for functions, arrow functions, classes, methods, interfaces, types, imports                                                        |
| `graphParserGeneric.ts`   | Pluggable tree-sitter extraction for Python, Go, Rust, Java, C/C++ via `LanguageExtractorConfig` objects                                                                                             |
| `graphParserShared.ts`    | Shared constants (`SKIP_DIRS`, `BUILTIN_CALLEES`, `MAX_FILE_SIZE`), helpers (`makeNodeId`, `resolveImportPath`, `findDescendantsOfType`), types (`ParseResult`, `SymbolExtractionContext`)           |
| `treeSitterLoader.ts`     | WASM runtime init + grammar loading with concurrent-load dedup. Maps 30+ extensions to grammar names. Grammars from `tree-sitter-wasms` npm package.                                                 |
| `graphIndexing.ts`        | Full/incremental indexing, single-file reindex, mtime stamping, `TreeCache` (FIFO eviction, max 200 entries)                                                                                         |
| `graphTypes.ts`           | All shared interfaces: `GraphNode`, `GraphEdge`, `SearchResult`, `CallPathResult`, `ArchitectureView`, `ChangeDetectionResult`, `GraphSchema`                                                        |
| `graphStore.test.ts`      | Unit tests for GraphStore CRUD and persistence                                                                                                                                                       |

## Architecture

```
GraphController (singleton via get/setGraphController())
  ├── GraphStore (in-memory nodes/edges + JSON persistence)
  ├── GraphQueryEngine (search, trace, architecture, Cypher)
  ├── TreeCache (FIFO cache of tree-sitter Trees, max 200)
  └── Parsing pipeline:
       parseFile() → tree-sitter AST available?
         ├─ TS/JS → extractSymbolsFromTree() + extractCallEdges()
         ├─ Py/Go/Rust/Java/C/C++ → extractSymbolsGeneric(config)
         └─ No grammar → parseFileRegex() (regex fallback)
       → resolveEdgeReferences() (cross-file link resolution)
```

## Node ID Format

`{relativePath}::{symbolName}::{type}::{lineNumber}` — e.g. `src/main/config.ts::getConfig::function::42`

## Edge Types

| Type         | Meaning                    |
| ------------ | -------------------------- |
| `contains`   | File → symbol it defines   |
| `exports`    | File → exported symbol     |
| `imports`    | File → imported file       |
| `calls`      | Function → called function |
| `extends`    | Class → superclass         |
| `implements` | Class → interface          |
| `depends_on` | Generic dependency         |

## Reindexing

- **Full**: On first init (no persisted graph) or explicit `incremental: false`
- **Incremental**: On file changes (debounced 2s in controller), session start, git commit — compares `mtime` metadata on file nodes vs `fs.stat()`
- **Concurrency**: `indexingInProgress` flag queues changes into `pendingReindex` array, drained via `drainPendingReindex()` after current index completes
- **Delete handling**: If file no longer accessible, `reindexSingleFile` clears its nodes/edges and evicts its tree cache entry

## Cypher-like Query Syntax

`queryGraph()` supports a simplified subset:

- `MATCH (n:function) WHERE n.name CONTAINS 'config' RETURN n LIMIT 10`
- `MATCH (a)-[:calls]->(b) WHERE a.name = 'initialize' RETURN a, b`
- WHERE operators: `CONTAINS`, `=`, `STARTS WITH`

## Gotchas

- **WASM init is async** — `initTreeSitter()` must complete before parsing. Controller calls it in `initialize()`. If it fails, all parsing falls back to regex silently.
- **`web-tree-sitter` has no `descendantsOfType()`** — use `findDescendantsOfType()` from `graphParserShared.ts` (manual cursor walk).
- **Two-pass edge resolution** — `__file::` (import targets) and `__unresolved::` (call targets) are placeholder IDs created during per-file parsing, resolved in bulk by `resolveEdgeReferences()`. This avoids requiring parse order.
- **TreeCache must `.delete()` evicted Trees** — `web-tree-sitter` Trees live in WASM linear memory, not GC'd by V8. Forgetting causes memory leaks.
- **Max file size**: 500KB (`MAX_FILE_SIZE`) — larger files silently skipped.
- **SKIP_DIRS**: `node_modules`, `dist`, `build`, `out`, `.git`, `.ouroboros`.
- **Persistence path**: `{projectRoot}/.ouroboros/graph.json`, directory auto-created on save.
- **Regex parser ESLint overrides** — `graphParserRegex.ts` has many `eslint-disable-next-line security/detect-unsafe-regex` comments; the patterns are intentionally complex for multiline matching.
- **Grammar dedup** — `treeSitterLoader.ts` prevents concurrent loads of the same grammar via `pendingLanguageLoads` Map. Init failure resets the promise so retry works.
- **Controller is a module singleton** — `getGraphController()` / `setGraphController()` at module scope (no DI). Created in `main.ts` boot sequence.

## Dependencies

- **Runtime**: `web-tree-sitter` (WASM parser), `tree-sitter-wasms` (pre-built grammars for 30+ languages)
- **Consumed by**: `src/main/orchestration/graphSummaryBuilder.ts` (passive context injection), `src/main/ipc-handlers/` (IPC exposure to renderer), `codebase-memory` MCP tool handlers
