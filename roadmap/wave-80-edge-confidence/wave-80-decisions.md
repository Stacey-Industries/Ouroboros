# Wave 80 — Architecture Decision Records

## Decision 1: Confidence values for each resolution path

**Context:** The call-resolution pass has 4 paths with different reliability. We need calibrated numbers that are distinct and interpretable.

**Options considered:**
- *Industry standard:* No specific standard; confidence scoring in graph databases typically uses domain-calibrated values, not universal scales.
- *Data-driven calibration:* Sample N edges, have a human classify them, compute F1-style confidence. Accurate but requires a live IDE and ~1 hour of manual work.
- *Static code-path analysis:* Read the resolution code, reason about reliability order and magnitude, assign values from first principles. Faster, less precise, but good enough for initial calibration.

**Pick:** Static code-path analysis — this is the Phase A deliverable.

**Values:** Import-resolved: 0.95, Same-file: 0.85, Name-unique: 0.80, New-expression class disambiguation: 0.65.

**Rationale:** Values are distinct, ordered correctly by reliability, none claims certainty (1.0 reserved for absolute ground truth). Post-launch telemetry can refine.

**Consequences:** Values are hardcoded in `indexingPipelineCallResolution.ts` as named constants. Changing them requires a code change + reindex. Future telemetry-driven calibration can compare against these baselines.

---

## Decision 2: Where to store confidence in the edge type

**Context:** `GraphEdge` in `graphDatabaseTypes.ts` currently has no `confidence` field. The DB column exists (`confidence REAL NOT NULL DEFAULT 1.0`) but is not reflected in the TypeScript type or the `insertEdge` SQL.

**Options considered:**
- *Add `confidence` to `GraphEdge` type + update `insertEdge` SQL:* Correct approach. Type-safe, explicit, matches the DB schema.
- *Store confidence in `props` JSON:* Avoids touching the type, but creates a data model inconsistency where confidence is a first-class DB column but treated as an opaque prop.

**Pick:** Add `confidence?: number` to `GraphEdge` (optional with default 1.0 for existing callers), update `insertEdge` SQL to pass the column explicitly.

**Rationale:** The DB already has the column. Not reflecting it in TypeScript is a type-gap. `props` is for ad-hoc data; `confidence` is a first-class schema concept.

**Consequences:** `rowToEdge` needs to map the column. `insertEdge` SQL gains a `confidence` binding. Existing callers that don't set `confidence` get `1.0` via `?? 1.0` fallback in `insertEdge`.

---

## Decision 3: `minConfidence` filter strategy — BFS SQL vs. post-filter

**Context:** `traceCallPath` uses a recursive CTE BFS in SQLite. To support `minConfidence`, we can either:
1. Add `AND e.confidence >= ?` to the BFS edge JOIN condition (SQL-level filter)
2. Traverse all edges, then post-filter result nodes by looking up their incoming edge's confidence

**Options considered:**
- *SQL-level BFS filter:* Correct. Filters mid-traversal so unreachable low-confidence subtrees are never explored. Correct semantics for "only follow edges I trust."
- *Post-filter:* Traverses everything, then removes nodes that arrived via low-confidence edges. Incorrect for deep traversals — a node might be reachable via a high-confidence path even if it was also reachable via a low-confidence path. Post-filtering would incorrectly remove it.

**Pick:** SQL-level BFS filter via `minConfidence` parameter on `BfsOptions` → added to the edge JOIN WHERE clause.

**Rationale:** SQL filter is semantically correct and more efficient. Post-filter has wrong semantics for graph traversal.

**Consequences:** `BfsOptions` gains `minConfidence?: number`. `runBfsTraversal` adds the conditional `AND e.confidence >= ?`. `traceCallPath` and `detectChanges` pass it through from `TraceCallPathOptions` and `DetectChangesOptions`.

---

## Decision 4: `minConfidence` default

**Context:** Existing callers of `traceCallPath`, `searchGraph`, `detectChanges` must not see different results after this wave.

**Pick:** `minConfidence` defaults to `0` (no filtering). Opt-in only.

**Rationale:** Per source plan and risk table. Breaking changes to existing callers would invalidate the graph's usefulness as a stable query surface.

**Consequences:** Every new `minConfidence` param is optional with default 0. Existing callers are unchanged.

---

## Decision 5: Reindex strategy — forced vs. gradual

**Context:** Existing `CALLS` edges in the graph have `confidence = 1.0`. They need to be re-emitted with real confidence values.

**Options considered:**
- *Forced full reindex on first launch:* Clears all existing edges and rebuilds from scratch. Ensures immediate correctness.
- *Gradual refresh:* Auto-sync rewrites edges for changed files as they're detected. Correct eventually, but takes an arbitrary amount of time.
- *Explicit `index_repository` call (user-triggered):* Deferred to user or agent. Correct but requires action.

**Pick:** Gradual refresh via existing auto-sync mechanism, with documentation that a user can trigger `index_repository` for immediate results.

**Rationale:** Forcing a full reindex on every app launch is expensive. The auto-sync on file change already uses `INSERT OR REPLACE` for edges — changed files get re-emitted with correct confidence. The forced-reindex-on-first-launch approach would require storing a "confidence v2 reindexed" marker in DB metadata and clearing it on upgrade, which is scope creep. Instead, document the path: run `index_repository` once after the wave lands, or wait for auto-sync to cover changed files.

**Consequences:** The Phase C verification step is "confirm the distribution is non-uniform after a manual reindex." The app doesn't auto-trigger a full reindex on its own.
