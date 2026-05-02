# Wave 68 — Cypher Engine Bug Diagnostic

**Phase:** A — Read-only investigation
**Status:** COMPLETE
**Date:** 2026-05-01
**Source files read:** `cypherEngine.ts`, `cypherEngineParser.ts`, `cypherEngineSupport.ts`, `cypherEngineSqlHelpers.ts`, `cypherEngineVarpath.ts`, `graphDatabaseSchema.ts`

All five bug causes are confirmed from code-reading evidence. No runtime instrumentation was required; the SQL generation paths are structurally visible.

---

## Section 1 — Bug Roster

| # | Bug Name | File | Line(s) | Proximate Cause | Fix Size |
|---|---|---|---|---|---|
| 1 | Target-node label filter ignored | `cypherEngineSupport.ts` | 89 | `HOP_OUT`/`HOP_IN` regexes fail on named edge variables (`[r:TYPE]`); query degrades to a single-node scan with no edge join and no label filter | Small |
| 2 | Anonymous-endpoint syntax rejected | `cypherEngineSupport.ts` | 89, 91, 93 | All node patterns require `(\w+)` (non-optional alias); bare `()` has zero characters to match | Small |
| 3 | Relationship-property access broken | `cypherEngine.ts` | 185–187, 289–296 | Edge alias `r` (from Cypher) is never mapped to SQL alias `e`; edge property access falls to `json_extract(r.props, ...)` using a nonexistent SQL table name | Small |
| 4 | `labels(n)` silently dropped | `cypherEngineSupport.ts` | 189–210 | `parseReturnField` returns `null` for function-call syntax; the field is silently skipped, producing empty-object rows | Small |
| 5 | Project node `indexed_at` not found | `cypherEngine.ts` / `cypherEngineSupport.ts` | 147–178 / 62–75 | `indexed_at` is a column only on the `projects` table; the engine always routes `MATCH (p:Project)` to the `nodes` table, which has no such column | Medium |

---

## Section 2 — Per-Bug Detail

---

### Bug 1 — Target-node label filter ignored

**Symptom:** `MATCH (a)-[r:CALLS]->(b:Class) RETURN count(r)` returns an unexpected count (~13,273 per wave plan) instead of the actual count of CALLS edges terminating at Class nodes.

**Root cause:** `cypherEngineSupport.ts`, line 89 — the `HOP_OUT` regex constant.

```ts
// cypherEngineSupport.ts:89
const HOP_OUT = /\((\w+)(?::(\w+))?\)\s*-\[\s*:?(\w+)?\s*\]\s*->\s*\((\w+)(?::(\w+))?\)/i;
```

The edge-bracket pattern `\[\s*:?(\w+)?\s*\]` expects an optional leading colon followed by a single word token. For `[r:CALLS]`, the regex engine:
1. Enters the bracket after `[`
2. `\s*` matches empty
3. `:?` matches empty (no colon at position `r`)
4. `(\w+)?` matches `r`
5. `\s*` matches empty
6. `\]` expects `]` but sees `:CALLS]` — FAIL

With `(\w+)?` being optional, the engine retries matching zero characters, then `\]` expects `]` but sees `r:CALLS]` — FAIL again. `HOP_OUT.exec(...)` returns null. `HOP_IN` fails identically. `tryVarpath` fails for the same structural reason.

`parseMatch` then falls through to `SINGLE_NODE`:
```ts
// cypherEngineSupport.ts:93
const SINGLE_NODE = /\((\w+)(?::(\w+))?\)/i;
```

This matches `(a)` at the start of the string, returning `{ kind: 'single', alias: 'a', label: null }`. The query is executed as a single-node scan with no label constraint — just `a.project = ?`.

**Observed SQL** (generated for `MATCH (a)-[r:CALLS]->(b:Class) RETURN count(r)`):
```sql
SELECT COUNT(*) AS _count
FROM nodes a
WHERE a.project = ?
LIMIT 200
```
(Returns the total node count for the project, not the CALLS-to-Class edge count.)

**Expected SQL:**
```sql
SELECT COUNT(*) AS _count
FROM nodes a
JOIN edges e ON e.source_id = a.id
JOIN nodes b ON b.id = e.target_id
WHERE a.project = ? AND b.label = ? AND e.type = ?
LIMIT 200
```
(params: `[projectName, 'Class', 'CALLS']`)

**Recommended fix shape:** Modify the edge-bracket portion of `HOP_OUT` and `HOP_IN` from `\[\s*:?(\w+)?\s*\]` to `\[\s*(?:(\w+)\s*:)?\s*(\w+)?\s*\]`, making the `name:` prefix optional and capturing the edge alias separately from the edge type. The `MatchPattern` type needs an `edgeAlias` field to carry the captured alias through to the SQL builder (see Bug 3 which depends on this same field).

**Test scenario:** `MATCH (a)-[r:CALLS]->(b:Class) RETURN count(r)` must return a count that is less than the total node count and less than the total CALLS edge count.

---

### Bug 2 — Anonymous-endpoint syntax rejected

**Symptom:** `MATCH ()-[r:DEFINES]->() RETURN count(r)` throws `Error: Unsupported MATCH pattern: ()-[r:DEFINES]->()`.

**Root cause:** `cypherEngineSupport.ts`, lines 89, 91, 93 — node-alias capture groups use `(\w+)` (one or more word characters, non-optional).

```ts
const HOP_OUT   = /\((\w+)(?::(\w+))?\)...\((\w+)(?::(\w+))?\)/i;  // line 89
const HOP_IN    = /\((\w+)(?::(\w+))?\)...\((\w+)(?::(\w+))?\)/i;  // line 91
const SINGLE_NODE = /\((\w+)(?::(\w+))?\)/i;                        // line 93
```

`()` contains zero characters between the parens. `(\w+)` requires at least one; no match is possible. All four patterns fail. `parseMatch` reaches:
```ts
// cypherEngineSupport.ts:160
throw new Error(`Unsupported MATCH pattern: ${matchStr}`);
```

Note: Even if the anonymous-node issue were fixed in isolation, `[r:DEFINES]` would still fail the edge-bracket pattern for the same reason as Bug 1. Bugs 1 and 2 share the same regex constants and must be fixed together in a single change.

**Observed SQL:** None — throws before SQL generation.

**Expected SQL** (for `MATCH ()-[r:DEFINES]->() RETURN count(r)`):
```sql
SELECT COUNT(*) AS _count
FROM nodes _n0
JOIN edges e ON e.source_id = _n0.id
JOIN nodes _n1 ON _n1.id = e.target_id
WHERE _n0.project = ? AND e.type = ?
LIMIT 200
```
(params: `[projectName, 'DEFINES']`)
Anonymous endpoints produce no label constraints on either node. Engine-synthesized placeholder aliases (`_n0`, `_n1`) are required because empty strings are invalid SQL table aliases.

**Recommended fix shape:** Change node-alias capture groups from `(\w+)` to `(\w*)` (zero-or-more). Add alias-synthesis logic in `parseMatch` (or `singleHopSql`) so that an empty string alias produces a guaranteed-unique SQL placeholder. The placeholder only needs to be consistent within a single query.

**Test scenario:** `MATCH ()-[r:DEFINES]->() RETURN count(r)` must parse without error and return a count matching the `index_status` DEFINES count (~18,277).

---

### Bug 3 — Relationship-property access broken

**Symptom:** `MATCH (a)-[r:CALLS]->(b) RETURN r.confidence LIMIT 5` produces a SQL error. The wave plan reports the message as "no such column: r.props" or "r.confidence".

**Root cause — primary:** `cypherEngine.ts`, lines 185 and 187 — the edge SQL alias is hardcoded as `'e'` but is never passed to `buildSelectColumns`.

```ts
// cypherEngine.ts:185-187
const edgeAlias = 'e';
const selectCols = this.buildSelectColumns(parsed, left.alias, right.alias);
// edgeAlias ('e') is NOT included in the availableAliases argument
```

`buildSelectColumns` receives `availableAliases = ['a', 'b']`. For the return field `{ alias: 'r', property: 'confidence' }` (the Cypher edge variable), the alias check at line 285 fails:

```ts
// cypherEngine.ts:285-296
if (availableAliases.includes(field.alias)) {
  cols.push(`${field.alias}.${col} AS ${field.outputName}`);
} else {
  cols.push(
    `json_extract(${field.alias}.props, '$.${field.property}') AS ${field.outputName}`,
  );
}
```

`'r'` is not in `['a', 'b']`, so the else branch fires: `json_extract(r.props, '$.confidence')`. There is no table aliased as `r` in the generated SQL — the edges table is aliased as `e`. SQLite throws "no such column" at statement preparation time.

**Root cause — secondary:** Even if the alias were corrected to `e`, the expression `json_extract(e.props, '$.confidence')` would return NULL because `confidence` is a dedicated REAL column on the `edges` table, not stored in the `props` JSON blob:

```sql
-- graphDatabaseSchema.ts:59
confidence REAL NOT NULL DEFAULT 1.0
```

The correct SQL expression is `e.confidence`, not `json_extract(e.props, '$.confidence')`.

**Observed SQL** (for `MATCH (a)-[:CALLS]->(b) RETURN r.confidence LIMIT 5`):
```sql
SELECT json_extract(r.props, '$.confidence') AS r_confidence
FROM nodes a
JOIN edges e ON e.source_id = a.id
JOIN nodes b ON b.id = e.target_id
WHERE a.project = ? AND e.type = ?
LIMIT 5
```
(SQL error: `r` is not a known table alias in this query.)

**Expected SQL:**
```sql
SELECT e.confidence AS r_confidence
FROM nodes a
JOIN edges e ON e.source_id = a.id
JOIN nodes b ON b.id = e.target_id
WHERE a.project = ? AND e.type = ?
LIMIT 5
```

**Recommended fix shape:** Three steps: (1) Add `edgeAlias: string | null` to the `MatchPattern` `hop` variant (populated from the captured Cypher edge variable, or null if anonymous). (2) Thread it into `buildSelectColumns` so the edge alias is in `availableAliases`. (3) When resolving an edge property that is a dedicated column (`confidence`, `type`), emit `e.<col>` directly; for all other edge properties emit `json_extract(e.props, '$.property')`. A small `EDGE_PROP_TO_COLUMN` map parallel to `PROP_TO_COLUMN` handles the column lookup.

**Test scenario:** `MATCH (a)-[:CALLS]->(b) RETURN r.confidence LIMIT 5` (once Bugs 1+2 are also fixed) must return rows with numeric `r_confidence` values.

---

### Bug 4 — `labels(n)` silently dropped

**Symptom:** `MATCH (n) WHERE n.name = 'GraphDatabase' RETURN labels(n) LIMIT 1` produces a row with an absent or empty `labels(n)` column instead of `'Class'`.

**Root cause:** `cypherEngineSupport.ts`, lines 189–210 — `parseReturnField` returns `null` for any function-call expression.

```ts
// cypherEngineSupport.ts:189-210
function parseReturnField(fieldStr: string): ReturnField | null {
  // ...
  const propMatch = /^(\w+)\.(\w+)$/.exec(expr);   // handles n.name
  if (propMatch) { ... }
  if (/^\w+$/.test(expr)) { ... }                   // handles bare n
  return null;                                       // ALL other forms fall here
}
```

For `labels(n)`, `expr = 'labels(n)'`:
- `propMatch` regex `^(\w+)\.(\w+)$` does not match (no dot, has parens)
- `/^\w+$/.test('labels(n)')` is false (parens are not `\w`)
- Returns `null`

The null return causes the field to be silently skipped:
```ts
// cypherEngineSupport.ts:231-233
const field = parseReturnField(fieldStr);
if (field) fields.push(field);   // silently skipped when null
```

With `returnFields` empty, `buildSelectColumns` hits the `cols.length === 0` fallback at line 300 and emits `n.*`. The SQL fetches full rows correctly. But the mapping loop in `execute`:
```ts
for (const field of parsed.returnFields) {  // empty array — zero iterations
  mapped[field.outputName] = ...;
}
```
...maps every raw row to `{}`. The returned `columns` is `[]` and every row is an empty object.

**Observed SQL** (for `MATCH (n) WHERE n.name = 'GraphDatabase' RETURN labels(n) LIMIT 1`):
```sql
SELECT n.*
FROM nodes n
WHERE n.project = ? AND n.name = ?
LIMIT 1
```
(SQL itself is correct and would return the full row, but the result mapping discards all data.)

**Expected behavior:** Per Decision 4 of the ADR, the engine should throw `Error: unsupported function: labels` for unrecognized functions. Since `labels()` is in scope for this wave, the preferred outcome is to implement it: return `n.label` as the column value with output name `labels_n`.

**Recommended fix shape:** In `parseReturnField`, add a branch before the final `return null` that matches the pattern `functionName(alias)`. For `labels(alias)`, return `{ alias, property: 'label', outputName: 'labels_<alias>' }`. For any unrecognized function name, throw `Error: unsupported function: <functionName>`. This both implements `labels()` and makes silent drops impossible for future unknowns.

**Test scenario:** `MATCH (n) WHERE n.name = 'GraphDatabase' RETURN labels(n) LIMIT 1` must return `{ 'labels_n': 'Class' }`. A query using `RETURN unknownFn(n)` must throw `unsupported function: unknownFn`.

---

### Bug 5 — Project node `indexed_at` column not found

**Symptom:** `MATCH (p:Project) RETURN p.indexed_at` throws `no such column: p.indexed_at` (SQLite compile-time error).

**Root cause:** `cypherEngine.ts`, lines 147–178 — `singleNodeSql` always queries the `nodes` table. The `indexed_at` column exists only on the `projects` table.

`singleNodeSql` for `MATCH (p:Project)` generates:
```ts
// cypherEngine.ts:166-170
const sql = [
  `SELECT ${distinct}${selectCols}`,
  `FROM nodes ${match.alias}`,   // always 'nodes', never 'projects'
  `WHERE ${conditions.join(' AND ')}`,
  ...
```

`resolveColumn('indexed_at')` returns `'indexed_at'` unchanged (absent from `PROP_TO_COLUMN` at `cypherEngineSupport.ts:62-75`). The generated SQL:

**Observed SQL:**
```sql
SELECT p.indexed_at AS p_indexed_at
FROM nodes p
WHERE p.project = ? AND p.label = ?
LIMIT 200
```
SQLite rejects this at prepare-time because `nodes` has no `indexed_at` column.

The `projects` table has the needed columns:
```sql
-- graphDatabaseSchema.ts:26-33
CREATE TABLE IF NOT EXISTS projects (
  name           TEXT PRIMARY KEY,
  root_path      TEXT NOT NULL,
  indexed_at     INTEGER NOT NULL DEFAULT 0,
  node_count     INTEGER NOT NULL DEFAULT 0,
  edge_count     INTEGER NOT NULL DEFAULT 0,
  last_opened_at INTEGER NOT NULL DEFAULT 0
);
```

**Note:** Whether there are `Project`-labeled rows in `nodes` is secondary — even if there were, `indexed_at` is not a `nodes` column. The SQLite prepare-time error fires regardless of row count.

**Expected SQL:**
```sql
SELECT p.indexed_at AS p_indexed_at
FROM projects p
WHERE p.name = ?
LIMIT 200
```
(params: `[projectName]`)

**Recommended fix shape:** In `singleNodeSql`, detect `match.label === 'Project'` and route to `FROM projects p` with `p.name = ?` (using `projectName` as the filter, rather than `p.project = ?` which doesn't exist on the `projects` table). The `projects` table has no `props` column, so the fallback `json_extract(p.props, ...)` path in `buildSelectColumns` must be suppressed; unknown properties on `Project` should throw rather than generating invalid SQL. A secondary limitation: `MATCH (p:Project)-[...]->(child)` hop queries are out of scope for this wave (see Section 4).

**Test scenario:** `MATCH (p:Project) RETURN p.indexed_at` must return a non-null integer (epoch timestamp). `MATCH (p:Project) RETURN p.name, p.node_count` must also return correct values.

---

## Section 3 — Cross-Bug Observations

**Three of five bugs originate in `cypherEngineSupport.ts`.** That file owns both the regex patterns for `parseMatch` (Bugs 1, 2) and the `parseReturnField` function (Bug 4). It is the densest problem area.

**Bugs 1 and 2 share the same regex constants and must be fixed together.** Fixing Bug 1 alone (named edge alias support) while leaving `(\w+)` in place for node aliases means anonymous endpoints still throw. Fixing Bug 2 alone (changing to `(\w*)`) while leaving the edge-bracket pattern unchanged means named-alias hop queries still degrade to single-node scans. A single coherent regex change handles both.

**Bug 3 depends structurally on Bug 1's fix.** The `MatchPattern` type needs an `edgeAlias` field (added as part of Bug 1) for Bug 3's SQL builder to map the Cypher edge alias to the SQL `e` alias. If Phase B fixes are sequenced per-bug, Bug 3 should be committed after Bug 1.

**Bug 4 is a design failure, not just a code error.** The `return null` sentinel in `parseReturnField` combined with a silent-skip at the call site is the pattern that makes unknown functions invisible. Decision 4 of the ADR calls this out directly. The fix is one `throw` and one recognized case — but the larger lesson is that the `parseReturnField` null-return contract is dangerous and should be tightened.

**Bug 5 is the only fix requiring routing logic.** All other bugs are expressible as regex or column-name changes within existing functions. Bug 5 requires the engine to know that `Project` maps to a different table. This is structurally different but still contained.

**No fix affects any currently-working query.** All five bugs are in paths that either throw or silently return wrong results today. The fixes add net-new correct behavior without changing any passing code path.

---

## Section 4 — Risk for Phase B

**Bugs 1+2 (regex change):**
- The regex must support THREE edge-bracket forms: `[:TYPE]`, `[r:TYPE]`, and `[r]` (alias, no type). The fix must not accidentally match varpath brackets `[TYPE*1..3]` — those are tried first by `tryVarpath` and use `*` quantifiers that distinguish them clearly.
- An anonymous node in a hop produces no alias. `singleHopSql` uses `left.alias` and `right.alias` in SQL table aliases — an empty string produces invalid SQL. The fix must synthesize a placeholder alias when the parsed alias is empty.
- Capture group numbering shifts when the regex changes. All downstream consumers of `m[1]` through `m[7]` in `tryHop` and `tryVarpath` must be re-indexed carefully.

**Bug 3 (edge alias threading):**
- The `MatchPattern` `hop` variant type at `cypherEngineSupport.ts:12` needs `edgeAlias: string | null`. This is a type change that propagates to every consumer of `MatchPattern`. Run `npx tsc --noEmit` to catch all call sites.
- The `EDGE_PROP_TO_COLUMN` map should enumerate `confidence` and `type` as dedicated columns. Any edge property not in this map falls back to `json_extract(e.props, '$.prop')`. Verify that no other edge properties have dedicated columns before Phase B finalizes the map.

**Bug 4 (function dispatch):**
- Adding a throw for unknown functions changes behavior for any caller that previously received empty results silently. If any existing code calls `query_graph` with `RETURN labels(n)` and handles empty columns gracefully, it will now receive an error. Phase C's tool description update should land before or simultaneously with Phase B.
- `labels(n)` in real Cypher returns an array of strings (nodes can have multiple labels). This engine returns a single string. The Phase C description must document this deviation to prevent confusion.

**Bug 5 (Project routing):**
- `MATCH (p:Project)-[:CONTAINS_FOLDER]->(f:Folder)` hop queries are NOT fixed by a single-node routing fix. In the hop path, `singleHopSql` still queries `FROM nodes p`. This is a known limitation — document it in the Phase C tool description and defer to a follow-up if needed.
- The `projects` table has no `props` column. If `buildSelectColumns` is called for a Project node with an unknown property (not in the schema), the fallback `json_extract(p.props, '$.prop')` path generates SQL that will throw "no such column: p.props". The fix must guard against this by throwing a clear error for unknown Project properties.
- Verify before writing the fix: does the indexer create `Project`-labeled rows in the `nodes` table? If yes, the routing fix can still query `nodes` but needs a JOIN to `projects` for columns like `indexed_at`. If no (projects table only), pure reroute is correct.

---

## Section 5 — Re-scope Flags

No bug requires re-scope. All five fixes are within the 30-line escalation threshold from Decision 2 of the ADR:

- **Bugs 1+2** — regex change ~5 lines, alias synthesis ~8 lines = ~13 lines total
- **Bug 3** — type field addition + `buildSelectColumns` branch + edge-property map = ~15 lines
- **Bug 4** — one new branch + one throw in `parseReturnField` = ~10 lines
- **Bug 5** — Project routing branch in `singleNodeSql` + no-props guard = ~18 lines

The Bug 3 type change (`edgeAlias` field on `MatchPattern`) propagates to a few consumers but each change is a one-liner. The Bug 5 hop-query limitation (Project node in a relationship pattern) is explicitly deferred rather than expanded into this wave.
