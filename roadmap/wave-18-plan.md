# Wave 18 — Graph GC & Edit Provenance
## Implementation Plan

**Version target:** v1.4.2 (patch — additive, no user-visible change)
**Feature flag:** `context.provenanceTracking` (default `true` — additive only)
**Upstream dependencies:** Wave 15 (telemetry store singleton pattern)
**Unblocks:** Wave 19 (PageRank + provenance-aware weight rebalance)

---

## 1. Architecture Overview

### Part 1 — Graph GC

`graphParserShared.ts` does not exist in the codebase; the skip-dir logic lives in
`indexingPipelineSupport.ts` (`ALWAYS_IGNORE_DIRS`) and `autoSync.ts` (no worktree
regex). The spec's `isWorktreePath` is not currently in any file, but `.claude/worktrees`
nodes are produced by the indexer running in a worktree root. The path-level filter belongs
in a new exported helper.

**`isPathSkipped(path: string): boolean`** — exported from `indexingPipelineSupport.ts`.
Combines:
- `ALWAYS_IGNORE_DIRS` membership check (any segment)
- worktree path regex: `/.claude/worktrees/`

On startup, `graphGc.ts` gains a second export `purgeSkippedNodes(db, projectName)` that
iterates all nodes for a project, checks each `file_path` against `isPathSkipped`, and
deletes matching nodes + their edges. Guarded by `graph_metadata` key `gc_schema_v2` so
it fires exactly once per DB.

**Incremental reindex**: `indexingPipeline.ts` pass 2 (parsePass) already skips files
caught by `loadIgnoreRules`. The only gap is nodes inserted in a prior version whose paths
now match. The startup GC pass covers that; no incremental change is needed beyond the
`isPathSkipped` guard in the incremental reindex path.

### Part 2 — Edit Provenance

Ring-buffer `Map<absolutePath, { lastAgentEditAt, lastUserEditAt }>` in memory.
Persisted to `{userData}/edit-provenance.jsonl` — append-only, one JSON line per event.
Compacted on startup: merge per-path keeping the latest timestamp for each role.

**JSONL line format:**
```json
{"path":"/abs/path","role":"agent","ts":1712345678901}
```

Agent edits are hooked at `post_tool_use` in `hooks.ts` — same site as
`tapConflictMonitor`. The `CONFLICT_EDIT_TOOLS` set (`Write`, `Edit`, `MultiEdit`) matches
the spec's target tools exactly.

User edits: `nativeWatcher.ts` does not exist in this codebase. File-change events from
the native watcher are delivered through the `file_changed` hook event
(`handleFileChanged` in `hooksLifecycleHandlers.ts`). The user-edit tap goes there —
if the changed file has no recent agent edit within 2s, call `markUserEdit`.

**`contextSelector.ts`**: `RankedContextFile` shape is in `typesContext.ts`. Wave 19
extends `ContextReasonKind` with `provenance_agent` / `provenance_user`. For now, only
the `getEditProvenance` export needs to be exposed — no type changes in Wave 18.

---

## 2. File-by-File Breakdown

### New files

| File | Approx lines | Notes |
|------|-------------|-------|
| `src/main/orchestration/editProvenance.ts` | ~150 | Store factory + singleton + JSONL I/O |
| `src/main/orchestration/editProvenance.test.ts` | ~120 | CRUD + compaction + 2s window tests |

### Modified files

| File | Delta | Change |
|------|-------|--------|
| `src/main/codebaseGraph/indexingPipelineSupport.ts` | +12 | Export `isPathSkipped` |
| `src/main/codebaseGraph/graphGc.ts` | +50 | `purgeSkippedNodes` + migration gate |
| `src/main/codebaseGraph/graphGc.test.ts` | +50 | Tests for `purgeSkippedNodes` |
| `src/main/codebaseGraph/graphDatabase.ts` | +12 | `deleteNodesByFilePath` bulk helper |
| `src/main/hooks.ts` | +8 | `tapEditProvenance` beside `tapConflictMonitor` |
| `src/main/hooksLifecycleHandlers.ts` | +8 | User-edit tap in `handleFileChanged` |
| `src/main/main.ts` | +4 | Init + close provenance store |

---

## 3. Phase Sequencing

### Phase A — Graph GC

1. Add `isPathSkipped` to `indexingPipelineSupport.ts`.
2. Add `deleteNodesByFilePath` to `graphDatabase.ts` (needed by GC).
3. Add `purgeSkippedNodes` to `graphGc.ts` with migration gate.
4. Extend `graphGc.test.ts` with stale-node eviction tests.

### Phase B — Edit Provenance

5. Create `editProvenance.ts` + `editProvenance.test.ts`.
6. Hook agent edits in `hooks.ts` (`tapEditProvenance`).
7. Hook user edits in `hooksLifecycleHandlers.ts` (`handleFileChanged`).
8. Wire init/close in `main.ts`.

---

## 4. Risks + Mitigations

| Risk | Mitigation |
|------|------------|
| Overzealous GC deletes live nodes | `isPathSkipped` uses exact segment match + worktree regex; log purged paths at INFO level |
| Migration gate misfires | Key `gc_schema_v2` written in a transaction; idempotent on re-run |
| JSONL grow unbounded | Compaction on startup merges per-path, keeps one entry per role |
| User-edit over-fires | 2s window checked against in-memory map (no disk I/O on hot path) |

---

## 5. Testing Strategy

- **`isPathSkipped`**: unit — worktree path, ALWAYS_IGNORE_DIRS path, clean path.
- **`purgeSkippedNodes`**: inject stale worktree nodes, run GC, assert evicted; re-run, assert migration gate prevents second pass.
- **`editProvenance`**: markAgentEdit sets timestamp; markUserEdit within 2s is suppressed; markUserEdit after 2s records; compaction merges JSONL on load; close flushes.

---

## 6. Rollback Plan

- `purgeSkippedNodes` is gated by `gc_schema_v2` metadata key. Deleting that key re-arms it.
- `editProvenance.ts` is a module-level singleton; removing the `initEditProvenance` call
  in `main.ts` is a no-op (hooks guard with `getEditProvenanceStore() ?? null`).
- Neither change modifies any stored types consumed by Wave 17 or earlier.

---

## 7. Cross-Wave Stability Commitments

| Artifact | Consumed by |
|----------|-------------|
| `isPathSkipped(path)` | Wave 18 GC; future indexer incremental skip |
| `EditProvenanceStore` interface | Wave 19 (`contextSelector` weight rebalance) |
| `getEditProvenance(path)` | Wave 19 (`recent_edit` weight split) |
| `gc_schema_v2` metadata key | Wave 18 migration gate |
