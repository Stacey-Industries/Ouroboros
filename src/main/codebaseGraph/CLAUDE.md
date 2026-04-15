# codebaseGraph — In-process codebase knowledge graph engine

Indexes source code into a graph of symbols and relationships. Runs entirely in
the main process with no external dependencies beyond tree-sitter WASM and
SQLite (better-sqlite3).

**Phase E complete**: System 1 (worker-thread + JSON store) has been removed.
System 2 (SQLite + indexing worker client + Cypher query engine) is the only
implementation. `GraphControllerCompat` is the permanent consumer API layer —
callers use `getGraphController()` and receive a `GraphControllerLike`.

## Key Files

| File | Role |
|------|------|
| `graphControllerSupport.ts` | Per-root registry (`setGraphController`, `getGraphController`, `getGraphControllerForRoot`, `acquireGraphController`, `releaseGraphController`). Defines `GraphControllerLike` — the stable consumer interface. |
| `graphControllerCompatRegistry.ts` | Multi-root acquire/release that wraps System 2 registry entries in `GraphControllerCompat` instances. Called by `graphControllerSupport.acquireGraphController`. |
| `graphControllerCompat.ts` | `GraphControllerCompat` — compat shim that implements `GraphControllerLike` over System 2 internals. The permanent consumer API boundary. |
| `graphControllerCompatAdapters.ts` | Adapter helpers used by `GraphControllerCompat` to bridge System 2 query results to the `GraphControllerLike` shape. |
| `graphControllerCompatQueries.ts` | Query implementations for `GraphControllerCompat`: `searchGraph`, `searchCode`, `queryGraph`, `traceCallPath`, `getArchitecture`, `getCodeSnippet`. |
| `graphDatabase.ts` | SQLite-backed graph database (better-sqlite3). Tables: `nodes`, `edges`, per-project catalog hash. All operations synchronous. |
| `graphDatabaseHelpers.ts` | Node/edge insert helpers, row mappers, schema migration utilities. |
| `graphDatabaseSchema.ts` | DDL constants and schema migration runner. |
| `graphDatabaseTraversal.ts` | BFS/DFS traversal helpers over the graph DB. |
| `graphDatabaseTypes.ts` | `GraphNode`, `GraphEdge`, `NodeLabel`, `EdgeType`, `ProjectRecord`, and related type definitions used by System 2. |
| `graphStore.ts` | SQLite-backed `GraphStore` implementing `IGraphStore`. Used by `graphController`-level tests that validate node/edge CRUD via the shared interface. |
| `graphStoreTypes.ts` | `IGraphStore` interface — implemented by `GraphStore`. |
| `graphTypes.ts` | Legacy shared types: `GraphNode`, `GraphEdge`, `IndexStatus`, `ArchitectureView`, `SearchResult`, `CallPathResult`, `ChangeDetectionResult`, `GraphSchema`, `GraphToolContext`. Still used by `GraphControllerLike` surface and some consumers. |
| `indexingPipeline.ts` | Orchestrates a full or incremental index run: file discovery → tree-sitter parse → DB upsert. |
| `indexingPipelineCallResolution.ts` | Post-parse call-edge resolution pass. |
| `indexingPipelinePasses.ts` | Pluggable pipeline passes (enrichment, git co-change, HTTP links, test detection). |
| `indexingPipelineStructure.ts` | File structure analysis helpers for the pipeline. |
| `indexingPipelineSupport.ts` | Shared utilities for the pipeline (file hash, mtime, path normalization). |
| `indexingPipelineTypes.ts` | `IndexingOptions`, `IndexingProgress`, `IndexingResult`, `DiscoveredFile`, `IndexedFile`. |
| `indexingWorker.ts` | Worker thread entry point for CPU-bound tree-sitter parsing. Receives messages from `IndexingWorkerClient`. |
| `indexingWorkerClient.ts` | Main-thread client — spawns the worker, sends `runIndex` jobs, relays `onProgress` callbacks. |
| `indexingWorkerTypes.ts` | Worker message protocol types (`WorkerRequest`, `WorkerResponse`). |
| `queryEngine.ts` | `QueryEngine` — search, trace, architecture, change-detection over the graph DB. |
| `queryEngineSupport.ts` | Query helpers shared by `QueryEngine` and `CypherEngine`. |
| `queryEngineTypes.ts` | Query result types: `SearchResult`, `TraceResult`, `ArchitectureResult`, `DetectChangesResult`, etc. |
| `cypherEngine.ts` | `CypherEngine` — executes simplified Cypher-like queries against the graph DB. |
| `cypherEngineParser.ts` | Cypher query string parser. |
| `cypherEngineSupport.ts` | Execution helpers for `CypherEngine`. |
| `cypherEngineVarpath.ts` | Variable-path traversal for Cypher relationship patterns. |
| `treeSitterParser.ts` | `TreeSitterParser` — wraps tree-sitter WASM for TS/JS/Python/Go/Rust/Java/C++. |
| `treeSitterLanguageConfigs.ts` | Per-language extraction configs (node types, scope rules). |
| `treeSitterParserCalls.ts` | Call-edge extraction from tree-sitter ASTs. |
| `treeSitterParserDefs.ts` | Definition extraction (functions, classes, interfaces, etc.). |
| `treeSitterParserImports.ts` | Import/export extraction. |
| `treeSitterParserSupport.ts` | Shared cursor-walk helpers (`findDescendantsOfType`). |
| `treeSitterTypes.ts` | Extraction result types. |
| `autoSync.ts` | `AutoSyncWatcher` — chokidar watcher that triggers incremental reindex on file changes. |
| `systemTwoRegistry.ts` | Core acquire/release registry keyed by root path, ref-counted. Manages watcher lifecycle. |
| `systemTwoRegistryTypes.ts` | Registry handle and config types. |
| `concurrency.ts` | Async mutex / concurrency helpers used by the pipeline. |
| `graphGc.ts` | GC: prunes stale project graphs from the DB based on last-opened timestamp. |
| `mcpToolHandlers.ts` | MCP tool implementations exposed to Claude Code via the internal MCP server. |
| `mcpToolHandlerDefs.ts` | Tool definition objects (name, description, input schema). |
| `mcpToolHandlerHelpers.ts` | Shared formatting helpers for MCP tool responses. |
| `detectChangesForSessionTypes.ts` | Types for per-session change detection results. |
| `passes/` | Enrichment passes run after initial indexing (git co-change, HTTP links, test detection). |

## Architecture

```
initCodebaseGraph() (mainStartup.ts)
  └── initCompatRegistry(db, queryEngine, cypherEngine, workerClient)
  └── GraphControllerCompatRegistry.acquireGraphController(root, pipeline)
       └── SystemTwoRegistry.acquire(root, db, pipeline)
            └── AutoSyncWatcher (chokidar) → incremental reindex on changes
       └── new GraphControllerCompat(handle)
            ├── QueryEngine    (search, trace, architecture, detect-changes)
            ├── CypherEngine   (queryGraph — simplified Cypher subset)
            └── IndexingWorkerClient → IndexingWorker (worker thread)
                 └── TreeSitterParser → GraphDatabase (better-sqlite3)

Consumers call getGraphController() → GraphControllerLike
```

## Consumer API (`GraphControllerLike`)

The stable interface that all consumers depend on. Defined in `graphControllerSupport.ts`, implemented by `GraphControllerCompat`:

| Method | Description |
|--------|-------------|
| `searchGraph(query, limit?)` | Fuzzy symbol search |
| `traceCallPath(fromId, toId, maxDepth?)` | BFS call-path between two symbols |
| `getArchitecture(aspects?)` | Hotspots, modules, file tree |
| `getCodeSnippet(symbolId)` | Source snippet + dependencies for a symbol |
| `queryGraph(query)` | Simplified Cypher query |
| `searchCode(pattern, opts?)` | Regex search across source files |
| `detectChanges()` | Files changed since last index |
| `detectChangesForSession(sessionId, files)` | Per-session blast radius |
| `indexRepository(opts)` | Trigger explicit re-index |
| `onSessionStart() / onGitCommit() / onFileChange(paths)` | Event hooks for incremental sync |
| `getStatus()` / `indexStatus()` | Index health info |
| `manageAdr(action, id?)` | ADR stub (file-system redirects) |
| `ingestTraces(traces)` | Ingest external call traces |

## Startup Sequence

1. `mainStartup.initCodebaseGraph()` is called from `main.ts` after app is ready.
2. A shared `GraphDatabase` is created and injected via `setSystem2Db()`.
3. `initCompatRegistry(deps)` stores the shared DB, query/cypher engine factories, and worker client.
4. `acquireCompatController(root, pipeline)` creates the default-root `GraphControllerCompat`.
5. `setGraphController(compat)` registers it as the default root in `graphControllerSupport`.
6. Background: `IndexingWorkerClient.runIndex()` fires if the catalog hash is stale or node count is zero.

## Gotchas

- **`getGraphController()` may return null** at startup if the graph hasn't initialized yet. All consumers must handle `null`.
- **`acquireGraphController(root)`** is called per window from `windowManager.ts`. It reuses the shared DB via `_system2Db`. First window uses startup-injected DB; subsequent windows reuse it.
- **`initCompatRegistry()` must be called first** — `acquireGraphController` will throw `[compat-registry] initCompatRegistry() not called` if the registry hasn't been initialized.
- **`graphStore.ts` is System 2** — it's the SQLite-backed `IGraphStore` implementation used by test utilities. Not the old in-memory JSON store.
- **`graphTypes.ts` is legacy** — defines `GraphNode` / `GraphEdge` / etc. as used by the `GraphControllerLike` surface. `graphDatabaseTypes.ts` defines the System 2 DB-layer types (different shape). Some adapters bridge between the two.
- **`GraphControllerCompat` is permanent** — it's the abstraction boundary. Do not bypass it to call System 2 internals from consumers.
- **Worker path** — `indexingWorkerClient.ts` resolves the worker path using `__dirname` with an `endsWith('chunks')` check for asar packaging. Same pattern as the old `resolveWorkerPath` from System 1.
- **GC runs at startup** — `graphGc.pruneExpiredProjects()` fires before the initial index if `codebaseGraph.gcEnabled` is true. Pruned project names are tracked to force a full reindex.

## Dependencies

- **Runtime**: `better-sqlite3` (graph DB), `web-tree-sitter` (WASM parser), `tree-sitter-wasms` (pre-built grammars for 30+ languages)
- **Consumed by**: `src/main/orchestration/graphSummaryBuilder.ts`, `src/main/ipc-handlers/graphHandlers.ts`, `src/main/ipc-handlers/filesHelpers.ts`, `src/main/ipc-handlers/gitOperations.ts`, `src/main/hooksLifecycleHandlers.ts`, `src/main/hooksSessionHandlers.ts`, `src/main/agentConflict/conflictMonitorSupport.ts`, `src/main/windowManager.ts`, `src/main/internalMcp/`
