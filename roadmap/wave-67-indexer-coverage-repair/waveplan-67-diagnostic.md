# Wave 67 — Phase A Diagnostic: Indexer Definition-Pass Coverage Failure

**Status:** Complete — root cause identified with file:line evidence.
**Author:** sonnet-diagnostician
**Date:** 2026-04-30

---

## 1. Bug Summary

**Proximate cause:** `indexingWorker.ts:getOrInitPipeline()` (lines 45-51) creates a
`new TreeSitterParser()` instance without calling `await parser.init()`. This leaves
`TreeSitterParser.parser` (the internal `Parser | null` field) permanently null in the
worker thread. Every call to `parser.parseFile()` in the worker throws
`TreeSitterParser not initialized — call init() first`
(`treeSitterParser.ts:132`). That exception is silently swallowed in `readAndParseOne`
(`indexingPipelinePasses.ts:73`), returning `parsed: null` for every file. The definition
pass guard `if (!file.parsed) continue` (`indexingPipelinePasses.ts:200`) then skips every
file, producing zero DEFINES edges in every worker-driven index run.

**One-line statement:** The worker thread never initializes the tree-sitter WASM parser, so
`parseFile` throws for every file, the exception is silently caught, and definitions are
never written.

---

## 2. Evidence

### E1 — Missing `parser.init()` call in worker (code-reading evidence)

File: `src/main/codebaseGraph/indexingWorker.ts`, lines 45-51

The worker `getOrInitPipeline()` function:

```ts
function getOrInitPipeline(): IndexingPipeline {
  if (pipeline) return pipeline;
  db = new GraphDatabase(resolveWorkerDbPath());
  parser = new TreeSitterParser();          // init() never called
  pipeline = new IndexingPipeline(db, parser);
  return pipeline;
}
```

The main-thread initialization path in `src/main/mainStartup.ts`
(`initCodebaseGraphImpl`, lines 265-302) does it correctly:

```ts
const parser = new TreeSitterParser();
await parser.init();                        // present here, absent in worker
const pipeline = new IndexingPipeline(db, parser);
```

The worker constructor call is structurally identical to the main-thread one except for the
missing `await parser.init()`. No other code path calls `parser.init()` inside the worker.

### E2 — `parseFile` throws when `init()` was not called (code-reading evidence)

File: `src/main/codebaseGraph/treeSitterParser.ts`, line 132

```ts
if (!this.parser) throw new Error('TreeSitterParser not initialized — call init() first');
```

`this.parser` is declared as `private parser: Parser | null = null` and is only set by
`init()`. A `TreeSitterParser` instance that has never had `init()` called always has
`this.parser === null`, so `parseFile` always throws.

### E3 — Exception is silently swallowed (code-reading evidence)

File: `src/main/codebaseGraph/indexingPipelinePasses.ts`, lines 70-75

```ts
let parsed = null;
try {
  parsed = await parser.parseFile(file.relativePath, content);
} catch {
  /* skip */           // the throw from E2 lands here
}
return { ...file, contentHash, parsed };   // parsed stays null
```

The catch block has no logging, no counter, no re-throw. The caller receives an `IndexedFile`
with `parsed: null` and cannot distinguish "file was unreadable" from "parser is broken" from
"language unsupported".

### E4 — Files with null parsed are silently skipped in definition pass (code-reading evidence)

File: `src/main/codebaseGraph/indexingPipelinePasses.ts`, line 200

```ts
for (const file of files) {
  if (!file.parsed) continue;     // every file skipped when E3 fires
  // ...
}
```

Because every file's `parsed` is null (from E3), the loop body never runs. `acc.nodes` and
`acc.edges` remain empty. No definition nodes and no DEFINES edges are written.

### E5 — Live DB confirms: 5 DEFINES edges for 3,328 File nodes

Live database query against
`C:\Users\coles\AppData\Roaming\ouroboros\codebase-graph.db`
(project `Agent IDE`, `indexed_at: 2026-04-30 21:54:15`):

```
Total nodes:    18,200  (per projects table)
Total edges:    12,954  (per projects table)
File nodes:      3,328
DEFINES edges:       5  (all from ChatControlsBar.rings — see E6)
CALLS edges:    10,031
```

The near-zero DEFINES count is the observable symptom. 10,031 CALLS edges coexist because
they were created by previous pipeline runs that executed correctly (before the worker became
the sole index path), and incremental runs only `deleteNodesByFile` for _changed_ files —
unchanged files retain their CALLS edges from the old run.

### E6 — The 5 surviving DEFINES edges are from a deleted file

All 5 DEFINES edges have `source_id` resolving to the file node for
`ChatControlsBar.rings.tsx`. That file was deleted from disk. Because it no longer appears
in `discoverFiles` output, it is never added to `filesToProcess`, so `deleteNodesByFile` is
never called for it, so its File node (and cascaded DEFINES edges) survive undisturbed.
Every live file's DEFINES edges were cascade-deleted when those files went through an
incremental run (which called `deleteNodesByFile`), and were never recreated because
`parsed: null` skips the write.

### E7 — `catalog_hash` never written confirms every worker run fails

Query: `SELECT key, value FROM graph_metadata WHERE key = 'catalog_hash:Agent IDE'`
Result: 0 rows.

`mainStartup.ts:runInitialIndex` only calls `db.writeCatalogHash(projectName)` on
`result.success === true`. The worker returns `result.success: false` (or the pipeline
catches and returns `success: false`) because every file's `parsed` is null, indicating
zero definitions were indexed, and the hash never gets written. Consequently
`resolveIndexReason` triggers a fresh full reindex on every launch (since
`verifyCatalogHash` returns no-reindex only when a matching hash exists), creating a
cycle where each launch re-runs the buggy worker and still produces zero DEFINES edges.

### E8 — Compiled worker output confirms no `init()` call

File: `out/main/indexingWorker.js`, lines 60-66 (compiled, timestamp 19:59 2026-04-30)

The compiled output is structurally identical to the source: `new TreeSitterParser()` with
no subsequent `.init()` call. The runtime path and the source path are confirmed consistent.

---

## 3. Affected Files Audit

### Scope of impact

Because the worker never calls `parser.init()`, **every file indexed in every worker-driven
run** has `parsed: null`. This means:

- Every incremental run cascade-deletes a changed file's definition nodes and DEFINES edges,
  and fails to recreate them.
- Full-reindex runs (`incremental: false`) delete the entire project via
  `db.deleteProject(projectName)` then also fail to populate any definitions.
- The only surviving definition nodes and DEFINES edges are those from runs that executed
  before the worker became the sole index path (or from files that were never re-processed
  incrementally).

### DB count

Files with File node and zero DEFINES edges (project `Agent IDE`):

- **3,323 of 3,328 File nodes** have zero outgoing DEFINES edges.
- 5 File nodes have DEFINES edges (all from the deleted `ChatControlsBar.rings.tsx`).
- `line_count` is 0 for 3,325 of 3,328 File nodes (never updated by `updateFileProps` in
  recent buggy runs), so the `lineCount > 30` filter from Decision 6 cannot be applied
  reliably against the current DB. The true blast radius is project-wide.

### Named files confirmed failing

| File | File node exists | DEFINES edges |
|---|---|---|
| `src/main/codebaseGraph/graphDatabase.ts` | Yes | 0 |
| `src/main/hooks.ts` | Yes | 0 |
| `src/main/windowManager.ts` | Yes | 0 |
| `src/renderer/hooks/useAgentEvents.ts` | Yes | 0 |
| `src/main/codemode/codemodeManager.ts` | Yes | 0 |
| `src/main/internalMcp/index.ts` | Yes | 0 |

All other source files are in the same state. The 6 named files are not exceptions — they
are representative of the full corpus.

---

## 4. Recommended Fix Shape

**The fix is a single line addition in `indexingWorker.ts:getOrInitPipeline()`.**

Before constructing the `IndexingPipeline`, call `await parser.init()`. Because
`getOrInitPipeline()` is currently synchronous, it must become async.

**Option A — make `getOrInitPipeline` async (minimal, targeted change):**

```ts
async function getOrInitPipeline(): Promise<IndexingPipeline> {
  if (pipeline) return pipeline;
  db = new GraphDatabase(resolveWorkerDbPath());
  parser = new TreeSitterParser();
  await parser.init();           // the fix
  pipeline = new IndexingPipeline(db, parser);
  return pipeline;
}
```

And in `handleIndexRepository` (line 82):

```ts
const pl = await getOrInitPipeline();    // was: getOrInitPipeline()
```

**Option B — init at worker bootstrap (top-level await, idiomatic for worker threads):**

At module level in `indexingWorker.ts`, before the `parentPort.on('message', ...)` line:

```ts
parser = new TreeSitterParser();
await parser.init();
db = new GraphDatabase(resolveWorkerDbPath());
pipeline = new IndexingPipeline(db, parser);
```

Then `getOrInitPipeline()` simply returns `pipeline` (asserted non-null) on every call.

**Recommendation:** Option A is the safer mechanical fix — it touches only the function that
has the bug and preserves the lazy-init pattern. The if-guard on `pipeline` ensures
`parser.init()` is called exactly once. Option B is cleaner architecturally but the
top-level await has no retry mechanism if init fails (the worker would exit silently at
bootstrap with no error message dispatched to the client).

**Secondary fix (strongly recommended for Phase B):**

Upgrade the catch block in `readAndParseOne` (`indexingPipelinePasses.ts:73`) from a bare
`/* skip */` to a structured warning:

```ts
} catch (err) {
  log.warn('[indexingPipeline] parseFile failed', {
    file: file.relativePath,
    err: err instanceof Error ? err.message : String(err),
  });
}
```

The current silent catch was the reason this bug produced zero observable signal for the
entire Wave 66 lifecycle. Adding a `log.warn` here ensures any future parse failure is
diagnosable from the application log without requiring a DB audit.

---

## 5. Risks for Phase B

| Risk | Severity | Notes |
|---|---|---|
| `parser.init()` throws in the worker context | Medium | `web-tree-sitter` calls `WebAssembly.instantiate`; worker threads support WASM in Node.js 16+. Likely non-issue but Phase B must confirm by running an end-to-end fixture test with the worker. |
| Grammar path resolution in worker context | Medium | `resolveGrammarPath()` in `treeSitterParser.ts` uses `__dirname`-based path resolution. Worker `__dirname` differs from main-thread `__dirname` in asar packaging. The same `endsWith('chunks')` check already used by `indexingWorkerClient.ts` for the worker path may be relevant. Verify in test. |
| Incremental classifier leaves stale unchanged-stat files unprocessed after fix | Medium | Files whose mtime/size have not changed since the last buggy run are classified `unchanged-stat` and excluded from `filesToProcess`. Their File nodes are intact but have zero DEFINES edges. Phase E's forced full reindex (`incremental: false`) is the correct remediation — confirming Decision 5. |
| `parseAnomalies` count initially very high | Low | After Phase B fix but before Phase E reindex, the detection layer will report ~3,323 anomalies. Expected and transient. Document in Phase C threshold notes. |
| `catalog_hash` was never written | Low | After Phase B + E (full reindex), the hash is written for the first time. Subsequent incremental runs work correctly. No manual DB intervention needed. |
| Silent catch at `readAndParseOne:73` remains if secondary fix is deferred | Medium | Even after the primary fix, any future `parseFile` failure is silently discarded. Including the `log.warn` in Phase B is low-effort and closes the observability gap permanently. |

---

## 6. Verification

### 6a. Unit regression test (vitest)

In `indexingPipelinePasses.test.ts` or a new `indexingWorker.test.ts`:

1. Create a `TreeSitterParser` instance and call `await parser.init()`.
2. Call `parseFile` on a small TypeScript fixture with a known class definition.
3. Assert result is non-null and `result.definitions.length >= 1`.

A parallel negative-path test: create `TreeSitterParser` without calling `init()`, assert
`parseFile` throws `'TreeSitterParser not initialized'`. Documents the init contract.

### 6b. DB audit after forced full reindex (Phase E)

```sql
SELECT count(*) FROM nodes n
WHERE n.project = 'Agent IDE'
  AND n.label = 'File'
  AND NOT EXISTS (
    SELECT 1 FROM edges e WHERE e.source_id = n.id AND e.type = 'DEFINES'
  );
-- Expect: < 5 (barrel/config files with no own definitions)
```

### 6c. Named-file probes

```sql
SELECT count(*) FROM edges e
JOIN nodes n ON n.id = e.source_id
WHERE n.file_path LIKE '%graphDatabase.ts'
  AND e.type = 'DEFINES';
-- Expect: >= 58 (class + methods + types)

SELECT count(*) FROM edges e
JOIN nodes n ON n.id = e.source_id
WHERE n.file_path LIKE '%/hooks.ts'
  AND e.type = 'DEFINES';
-- Expect: >= 1
```

### 6d. MCP tool probes (Wave 66 acceptance criteria)

```ts
await servers.ouroboros.search_graph({ query: 'GraphDatabase' });
// Expect: Class node at rank 0, file path graphDatabase.ts

await servers.ouroboros.get_code_snippet({ symbol: 'GraphDatabase' });
// Expect: snippet body, not 'Symbol not found'

await servers.ouroboros.search_graph({ query: 'buildInjectOptions' });
// Expect: Function node from src/main/internalMcp/index.ts
```

### 6e. `index_status` parseAnomalies (Phase C)

After Phase C adds the detection layer:

```ts
await servers.ouroboros.index_status({});
// Expect: parseAnomalies field with count near 0
```

---

## Summary

The bug is a missing `await parser.init()` in `indexingWorker.ts:getOrInitPipeline()`
(line 48 of source). One line of initialization code absent in the worker thread. Every
other component — tree-sitter grammar, `parseFile` logic, definition extraction, DB writes,
incremental classifier — is working correctly. The fix is a single `await parser.init()`
call. The silent catch at `indexingPipelinePasses.ts:73` should be upgraded to a `log.warn`
to prevent this class of silent failure from recurring undetected.

Phase B may proceed with this diagnosis.