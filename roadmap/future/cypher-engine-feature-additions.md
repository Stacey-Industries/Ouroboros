# Cypher engine — feature additions

**Status:** WAVE-IT (Wave A) + DECIDE-LATER (Wave B) + INVESTIGATE (Wave C)
**Source:** `roadmap/audit-verification-pass.md` Section D items #11, #12 (Wave 68 follow-up)
**Filed:** 2026-05-01

## Background

The graph engine has a custom-built mini-Cypher implementation at `src/main/codebaseGraph/cypherEngine.ts`. It's a pattern-matching subset that recognizes specific query shapes and translates them to SQL against the SQLite graph DB (`better-sqlite3`).

**Currently supported:** MATCH (single pattern + variable-length paths), WHERE (with `=`, `<>`, `CONTAINS`, `STARTS WITH`, `ENDS WITH`, `>`, `<`, `>=`, `<=`, `AND`, **`OR`**, `IN`), RETURN with property access, ORDER BY, LIMIT, COUNT, DISTINCT.

**Currently NOT supported:**
- `OPTIONAL MATCH` (LEFT JOIN equivalent)
- `WITH` (pipeline operator — filter-on-aggregate, multi-stage queries)
- `UNWIND` (turn list into rows)
- Multi-pattern MATCH (`MATCH (a)-[:X]->(b), (b)-[:Y]->(c)`)

### Note on audit accuracy

The audit listed "`OR` in WHERE" as unsupported. **That's wrong** — `OR` is already supported. `cypherEngineParser.ts:148-149` parses it; `cypherEngineSqlHelpers.ts:56-58` translates it to a parenthesized SQL `OR`. Verified 2026-05-01 in the audit verification pass; the audit doc has been corrected.

## Why this matters

The graph tools are exposed to AI agents via MCP (`query_graph`). Agents trained on Cypher reach for these constructs naturally. When they fail silently, the agent doesn't realize and proceeds with wrong assumptions. This degrades agent quality on every code-archaeology task that touches the graph.

## Why we're not replacing the engine wholesale

A 2026-05-01 research pass on the JS Cypher library landscape concluded that no mature, maintained, pluggable Cypher executor exists for JavaScript:

| Candidate | Disposition |
|---|---|
| Kuzu (most mature embedded graph DB w/ Cypher) | ⚠️ Archived Oct 2025 — also bundles its own storage, would replace SQLite entirely |
| cypher-query | WIP / abandoned. Doesn't cover the missing features anyway |
| Cypher.js | Abandoned, browser-only |
| openCypherTranspiler (Microsoft) | Archived Jul 2024. T-SQL output, not a full executor |
| Cytosm | Stagnant, undocumented maturity |

The "Cypher engine over your own schema" middle ground is unmapped territory. Mature graph DBs bundle storage; translators stagnated. The custom engine's "subset over SQLite" architecture is well-aligned with the current state of the art — there's no winning move toward a third-party replacement.

---

## Wave A — Diagnostics + cheap subset wins (small, ship soon)

### A.1 — Schema-level feature advertising

`get_graph_schema` should return a `supportedCypherFeatures` field (or equivalent block) listing the supported subset. ~10 lines. Solves ~80% of agent confusion at near-zero cost — agents that read the schema before composing queries will simply not reach for `WITH`/`UNWIND`/`OPTIONAL MATCH`.

### A.2 — Clear diagnostics for unsupported clauses

When a query contains `WITH`, `UNWIND`, or `OPTIONAL MATCH` (or any other unrecognized clause), the engine should return a structured error: *"Cypher feature not supported by Ouroboros mini-engine: WITH. Supported features: …"* — not silent empty results.

Add tokenization-level recognition in `extractClause` (currently at `cypherEngineParser.ts:31`). Recognize the keyword, route to an explicit error.

### A.3 — Add `OPTIONAL MATCH`

Translates to SQL `LEFT JOIN`. The existing pattern-recognizer can add another shape. Moderate effort.

Common use: *"find all functions and their tests, including functions without tests."*

### A.4 — Add `UNWIND`

Inline parameter expansion or temp-table construction. Less common in real-world queries but mechanically simple.

Common use: *"for each name in `['parseConfig', 'buildOptions']`, find the symbol."*

### A.5 — Add multi-pattern `MATCH`

`MATCH (a)-[:X]->(b), (b)-[:Y]->(c)` — multiple patterns in one MATCH with shared bindings. Multi-join SQL generation. Moderate effort.

### A.6 — `p.indexed_at` ISO conversion at query time (item #12)

Audit item #12 from the same source. The `indexed_at` column stores numeric timestamps (epoch ms). Cypher queries that compare against ISO date strings (`p.indexed_at > '2026-01-01'`) silently fail or return wrong results. Either:
- Convert ISO strings to epoch ms in the query parser when comparing against `indexed_at`
- Or change the storage to ISO strings (bigger migration)
- Or expose helper functions in Cypher (`datetime("...")` style) — out of scope for Wave A, would require function support

Recommended: parser-side ISO→epoch coercion when the property is `indexed_at` and the comparand is an ISO-shaped string. Document the rule in `get_graph_schema` output.

### Wave A scope

5-6 phases, mostly mechanical. Each adds tests. The whole wave is bounded — no architectural changes to the engine, just additional pattern recognizers and diagnostic improvements.

---

## Wave B — `WITH` support (DECIDE LATER)

`WITH` is the disproportionate one. It's not "another pattern" — it's pipeline semantics. The current engine is single-pass; supporting `WITH` means staged SQL generation (CTEs / subqueries) and a structural change to the SQL builder.

### Why deferred

Wave A's diagnostics will reveal whether agents *actually* keep reaching for `WITH` after they're told it's unsupported. Two outcomes:

- **Agents adapt to the supported subset** (rewrite their queries without `WITH`) — Wave B unnecessary, defer indefinitely
- **Agents keep hitting `WITH` because it's load-bearing for their query class** (filter-on-aggregate is the canonical case) — Wave B becomes high-priority

The decision is data-driven. Don't pre-commit.

### When activated

Two implementation paths to evaluate:

- **CTE rewrite** — translate `WITH` to SQL `WITH ... AS (...)` (CTEs) or temp tables. Bounded scope, but rewrites the SQL generator. Probably 2-3 phases.
- **Subquery rewrite** — express each `WITH` stage as a subquery in the SELECT. Simpler structure, possibly worse perf on chained `WITH`s.

---

## Wave C — Investigate building a full-fledged Ouroboros Cypher engine (INVESTIGATE)

The custom mini-engine is well-aligned with current state of the art for "subset over your own SQLite schema." But the research above also revealed that **the broader ecosystem has stagnated** — Microsoft archived openCypherTranspiler, Kuzu archived themselves, the academic translators are unmaintained. Nobody's actively building this middle-ground tool.

That's both a risk (no upstream support if we hit a wall) and an opportunity (a real, maintained, MIT/Apache-licensed Cypher-over-SQL engine in TypeScript would be uniquely useful — there's a real gap in the JS graph-tooling space).

### Investigate questions

- **Could the existing Ouroboros engine become a full Cypher implementation?** Wave A + Wave B together get us most of the way. What's left after that — function support (`datetime()`, `length()`, `coalesce()`), procedure calls, schema queries, expression-language richness — is incremental, not architectural.
- **What's the openCypher spec scope vs. what we need?** The full openCypher spec is large. We don't need 100% — we need the parts AI agents actually use. Profile real agent-emitted queries to find the 80% target.
- **Could this be extracted as an open-source library?** A hypothetical `@ouroboros/cypher-sqlite` with a published API would (a) attract external contributors and bug reports, (b) signal product seriousness, (c) decouple the engine's evolution from the IDE's release cadence.
- **Maintenance cost vs. value** — does the team have bandwidth to be the maintainer of a Cypher engine? The answer might be no, in which case the opportunity is moot.

### Right shape for the investigation

A spike, not a wave. ~half a day:
1. Read the openCypher reference grammar; tabulate features by frequency in real agent queries (use audit data + telemetry once Wave 70 lands and `traceBatcher` captures the corpus)
2. Estimate the LOC delta from "Wave A + B complete" to "full openCypher subset that covers 95% of agent queries"
3. Propose a public API shape if extraction makes sense
4. Decision: "build it ourselves and ship as OSS" / "build it ourselves and keep internal" / "stay with mini-engine forever"

This investigation is a **prerequisite for any decision to commit, not a commitment itself.** File only when:
- Wave A is shipped (we have the diagnostics + telemetry to know what agents actually need)
- Wave B's decision has been made (`WITH` either landed or punted)
- The team has signaled willingness to take on a "library author" responsibility

---

## References

- `src/main/codebaseGraph/cypherEngine.ts` — main engine (~360 lines)
- `src/main/codebaseGraph/cypherEngineParser.ts` — parser (clause detection, WHERE parsing)
- `src/main/codebaseGraph/cypherEngineSqlHelpers.ts` — SQL builder helpers
- `src/main/codebaseGraph/cypherEngineSupport.ts` — type definitions
- `src/main/codebaseGraph/cypherEngineVarpath.ts` — variable-length path support
- `src/main/codebaseGraph/mcpToolHandlers.ts` — `query_graph` MCP tool
- Audit: `roadmap/audit-verification-pass.md` Section D items #11, #12
- 2026-05-01 research pass: JS Cypher library landscape (Kuzu archived, openCypherTranspiler archived, no viable drop-in replacement)
- openCypher reference: https://opencypher.org/
