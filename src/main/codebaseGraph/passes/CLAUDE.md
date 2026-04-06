<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
- These passes run **after** the core tree-sitter parsing pipeline completes — they operate on the already-populated `GraphDatabase`, adding cross-cutting edges that require whole-graph context (all files indexed) rather than per-file analysis.
- `gitCoChangePass` is the only pass that calls an external process (`execSync git log`) and can silently return `null` when git isn't available — it must never throw, so all callers are safe without try/catch.
- The `CO_CHANGE_THRESHOLD = 3` and `MAX_FILES_PER_COMMIT = 20` constants in `gitCoChangePass` are the two most impactful tuning levers: lower threshold = noisier graph, higher max = bulk commits pollute co-change signal.
`─────────────────────────────────────────────────`

# passes/ — Post-indexing enrichment passes

Supplementary graph passes that run after the core tree-sitter indexing pipeline. Each pass receives an already-populated `GraphDatabase` and adds additional edges or updates node properties.

## Key Files

| File | Role |
|------|------|
| `passTypes.ts` | Shared types — `IndexedFile` and `IndexingPassContext` used by all passes |
| `enrichmentPass.ts` | Marks missed entry points (decorator-based, index-file exports, framework patterns); placeholder for `IMPLEMENTS` edges |
| `gitCoChangePass.ts` | Runs `git log` on the project root, creates `FILE_CHANGES_WITH` edges between files that co-change 3+ times in the last 200 commits |
| `httpLinkPass.ts` | Scans call sites for HTTP client patterns (`fetch`, `axios`, `requests`, `httpx`, etc.), creates `HTTP_CALLS` edges with 0.0–1.0 confidence scores linking callers to `Route` nodes |
| `testDetectPass.ts` | Identifies test files by naming convention, creates `TESTS` edges using two heuristics: name-based (test fn name contains subject fn name) and import-based |

## Pass Interface

All passes follow the same functional signature — no class, no state:

```ts
export function xyzPass(db: GraphDatabase, projectName: string, projectRoot?: string): void
```

`IndexingPassContext` exists for bundling arguments if a pass needs all four fields, but passes can also accept them individually.

## Edge Types Added by Passes

| Edge | Created by | Meaning |
|------|-----------|---------|
| `FILE_CHANGES_WITH` | `gitCoChangePass` | Two files frequently co-committed (props: `{ count }`) |
| `HTTP_CALLS` | `httpLinkPass` | Function calls an HTTP endpoint (props: `{ confidence, method }`) |
| `TESTS` | `testDetectPass` | Test function exercises a production function |

## Gotchas

- **`gitCoChangePass` silently no-ops** if `git` is unavailable, not in a git repo, or `git log` fails — `getCommitFiles()` returns `null` on any exception. This is intentional; non-git repos must not crash indexing.
- **Commits touching >20 files are excluded** (`MAX_FILES_PER_COMMIT`) — large refactors/renames would create O(n²) spurious co-change pairs.
- **`httpLinkPass` confidence scoring** uses method match + caller-name/route-path string similarity. A wildcard `'*'` method pattern always matches but gets a lower base score. Edges below confidence threshold are not created.
- **`enrichmentPass` IMPLEMENTS edges are a placeholder** — the comment in the source explicitly notes that `treeSitterParser` would need to expose `implements`/`extends` info from `class_heritage` nodes first. Don't expect these edges to exist yet.
- **Test file pattern** in `testDetectPass` is `\.(test|spec|_test|_spec)\.[^.]+$` — matches `foo.test.ts`, `foo.spec.py`, `foo_test.go`, etc. Files not matching this pattern are skipped entirely.

## Dependencies

- **Consumed by**: `graphIndexing.ts` / `graphController.ts` — passes are called at the end of each full or incremental index run, after `resolveEdgeReferences()` has linked cross-file edges.
- **Reads from**: `GraphDatabase` nodes and edges already in the store.
- **External dependency**: `gitCoChangePass` only — `child_process.execSync` for `git log`.
<!-- claude-md-auto:end -->
