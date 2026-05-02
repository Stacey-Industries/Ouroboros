# Wave 77 — Cypher Wave A: Architecture Decision Records

**Wave:** 77  
**Status:** In progress  
**Filed:** 2026-05-02

---

## Decision 1: A.4 UNWIND implementation — inline parameter expansion via VALUES clause

**Context:** UNWIND turns a list into rows. Two implementation paths existed:
- *Inline expansion*: rewrite `UNWIND $list AS var` to a SQL `VALUES (v1), (v2), ...` CTE or a JOIN against a literal values list, generated at parse time from the IN-list literal.
- *Temp-table*: create a temporary SQLite table per query, insert the values, JOIN against it, drop at end.

**Options considered:**
- *Industry standard (inline VALUES CTE)*: SQLite supports `WITH v(x) AS (VALUES (1),(2),(3)) SELECT ...`. Zero temp-table lifecycle, no DDL, fully read-only session. Fits the "read-only engine" invariant exactly.
- *Temp table*: `CREATE TEMP TABLE ... INSERT ... DROP` — more general (no per-query list-size limit) but breaks the "no DDL / no writes" invariant the engine maintains. Requires transaction management.
- *Experimental (window function expansion)*: out of scope.

**Pick:** Inline VALUES CTE — industry standard tier.

**Rationale:** The engine is explicitly read-only (write operations are rejected). Temp tables require DDL and transaction wrapping, violating that invariant. The VALUES CTE approach produces a single read-only SQL statement, no side effects, and is supported by better-sqlite3 natively. List sizes in realistic UNWIND usage (symbol name lists) are tiny (< 50 items), making per-query inline expansion practical. The `better-sqlite3` prepare + bind path handles this without any additional machinery.

**Consequences:** UNWIND is supported only when the list is a literal in the query string (e.g., `UNWIND ['a', 'b'] AS x`). Parametric UNWIND (list from a prior MATCH/WITH stage) remains unsupported — that requires WITH, which is Wave B. Document this in the schema feature advertisement (A.1).

---

## Decision 2: A.6 ISO→epoch coercion — parser-side, property-name-gated

**Context:** `indexed_at` is stored as epoch milliseconds (integer). Agents write ISO date comparisons (`p.indexed_at > '2026-01-01'`) which silently produce wrong results because SQLite string-vs-integer comparison is lexicographic, not numeric.

**Options considered:**
- *Parser-side coercion (chosen)*: when `property === 'indexed_at'` and the value looks like an ISO date string, coerce to `Date.parse(value)` epoch ms at parse time. Zero schema change, zero migration, transparent to agents.
- *Storage change*: convert `indexed_at` column to ISO string. Requires a schema migration, breaks existing numeric comparisons, and makes arithmetic harder.
- *Cypher function (`datetime("...")`)*: requires function-call support in the WHERE parser, which is out of scope for Wave A. Planned for a future wave if function support lands.

**Pick:** Parser-side coercion — simpler tier, correct for Wave A scope.

**Rationale:** No migration, no schema change, transparent to callers. The coercion is narrowly gated on `property === 'indexed_at'` to avoid false positives on other string-vs-number comparisons. The ISO detection regex is conservative: `/^\d{4}-\d{2}-\d{2}/`. If `Date.parse` returns NaN (malformed string), the coercion is skipped and the raw value is passed through — no regression for non-ISO values.

**Consequences:** Commits to `indexed_at` being epoch-ms storage (which is already true). Future waves adding `datetime()` function support can remove this special-case and make coercion explicit. The rule is documented in `get_graph_schema` output (A.1).
