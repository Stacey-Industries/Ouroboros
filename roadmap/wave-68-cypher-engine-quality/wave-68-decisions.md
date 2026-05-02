# Wave 68 — ADR: Cypher Engine Quality Repair

**Status:** LOCKED 2026-04-30 by orchestrator.
**Plan:** `roadmap/wave-68-cypher-engine-quality.md`

---

Wave 67 confirmed the underlying graph data is correct (3,307 files, 21,863 nodes, 48,367 edges, 18,277 DEFINES edges). But the Cypher engine that lets agents and orchestrators introspect that data is materially broken in five distinct ways. The failures were first visible during Wave 67 smoke testing, when verification queries that should have been simple cross-checks returned wrong answers, threw SQL errors, or silently dropped data. The bugs span parser rejection of valid syntax (anonymous endpoints), filter pushdown that stops at the source node (target-label ignored), column-name bugs in two independent code paths (relationship properties, project node properties), and a silent-drop on unsupported functions that trains agents to believe empty results are correct.

These bugs do not affect the MCP tools agents use for day-to-day work — `search_graph`, `trace_call_path`, `get_code_snippet`, and `index_status` all operate on dedicated code paths and are unaffected. The damage is to `query_graph` specifically: ad-hoc Cypher that orchestrators use to verify data quality, write smoke probes, or build future MCP tools on top of. Left unaddressed, every verification query is untrusted, and the tool's description implicitly promises functionality it doesn't deliver.

---

## Decision 1: Diagnose first, fix second

**Context:** Five separate bugs are described symptomatically. Their proximate causes — the specific file, line, and SQL expression that goes wrong — are not yet named. Two of the bugs (target-label filter, relationship-property access) are likely in `cypherEngineSqlHelpers.ts` or `cypherEngineSupport.ts`. One (anonymous endpoint) is likely in `cypherEngineParser.ts`. Two others (silent `labels()` drop, project property name mapping) could be anywhere in the translation pipeline. Proposing fixes before the causes are named risks patching the wrong layer.

**Options considered:**
- *Diagnose-first:* Phase A is a non-mutating `sonnet-diagnostician` dispatch. Deliverable is `roadmap/wave-68-diagnostic.md` with file:line evidence, the SQL the engine generates, and the SQL it should generate, for each of the five bugs. Phase B blocked until the orchestrator reviews and accepts the diagnosis.
- *Fix-and-test:* Skip structured diagnosis; implement plausible fixes and rely on test assertions to confirm correctness. Faster if the guesses are right; high risk of patching the symptom without naming the cause.
- *Instrument-then-fix in one phase:* Add logging and fix in a single pass. Mixes diagnosis and implementation risk; the fixer may stop when symptoms disappear before the true cause is confirmed.

**Pick:** Diagnose-first. Phase A delivers written evidence before any code changes begin.

**Rationale:** Each of the five bugs is in a different part of the translation pipeline. A fix without a named cause risks patching the wrong layer or masking a deeper issue. The cost of Phase A is one agent dispatch; the cost of skipping it is an unverifiable fix in a path that's already known to produce wrong results silently.

**Consequences:** Phase B (and C, D, E) are blocked on Phase A completing. The orchestrator reviews the diagnostic before dispatching Phase B. If the diagnosis is ambiguous for any bug, a second diagnostician dispatch is authorized. The diagnostic file becomes the authoritative record of what was wrong and why.

---

## Decision 2: No Cypher parser rewrite

**Context:** The engine's parser handles a useful subset of Cypher and has been in production. The five bugs are specific translation failures, not evidence that the parser's grammar is fundamentally wrong. A rewrite would reset all existing coverage and introduce new edge cases.

**Options considered:**
- *Targeted patch:* Find the specific code path responsible for each bug and fix it in place. Scope is bounded by the bug; risk is low. If a parser change exceeds 30 lines, it escalates.
- *Full parser rewrite:* Replace `cypherEngineParser.ts` with a cleaner grammar-driven implementation (e.g., a PEG parser). Eliminates accumulation of case-specific hacks; takes the whole engine offline for the duration of the rewrite.
- *Third-party Cypher parser:* Adopt a library such as `cypher-parser` or `neo4j-cypher-dsl`. Removes maintenance burden; introduces a dependency and version lock. The engine's SQL generation is custom regardless, so only the parsing step would benefit.

**Pick:** Targeted patch. Fix the buggy translation paths, not the grammar. If any single parser fix requires more than 30 lines of new parser code, Phase B escalates back to the orchestrator for a re-scope decision rather than expanding scope in place.

**Rationale:** The engine's supported subset is well-defined and working. Rewriting introduces net-new risk across all currently-working patterns. The 30-line escalation threshold catches the case where a bug turns out to be a deeper grammar gap that genuinely needs a different approach, without letting scope creep absorb the wave.

**Consequences:** The engine remains a custom translator. Future Cypher features (OPTIONAL MATCH, WITH, UNWIND) are still out of scope. If the anonymous-endpoint fix requires reworking the parser substantially, that surfaces as a re-scope candidate — it does not silently expand into a parser rewrite.

---

## Decision 3: Relationship-property access uses JSON1

**Context:** Edge properties are stored as a JSON blob in the `edges.props` TEXT column. The engine currently translates `r.confidence` to a SQL reference like `r.props` — a column name that doesn't exist. The fix must resolve `r.<prop>` to the JSON value at `$.prop` inside `edges.props`.

**Options considered:**
- *Dedicated column per property:* Add a `confidence` FLOAT column to the `edges` table. Direct SQL access, no JSON extraction overhead. Wave 66 did this for one specific property in the call-resolution path; extending it to all properties requires schema migration and a list of all expected edge properties.
- *JSON1 `json_extract`:* Translate `r.confidence` to `json_extract(edges.props, '$.confidence')`. No schema change; consistent with how node properties are already handled elsewhere in the engine. Performance is acceptable for the query patterns in scope — the concern would only arise if thousands of rows are fetched with property access on every row.
- *Hybrid:* Promote high-frequency properties to dedicated columns; keep long-tail properties in JSON. Optimal at scale; adds per-property decision overhead and schema drift.

**Pick:** JSON1 `json_extract`. `r.<prop>` translates to `json_extract(edges.props, '$.<prop>')`.

**Rationale:** The `edges.props` JSON column is already the canonical storage for edge properties. JSON1 is part of SQLite's default build; no new dependency. Using dedicated columns for every edge property would require a schema migration and a complete list of all edge properties in advance — neither of which is available or scoped here. The Wave 66 dedicated column for call resolution was a narrowly-targeted optimization for that query's hot path; it's not a pattern to generalize.

**Consequences:** `json_extract` on a TEXT column has modest per-row cost. For queries that return thousands of edges with property access, this may be perceptible. Phase A's SQL evidence will confirm whether the engine over-fetches; if it does, Phase B scopes the fix to apply `json_extract` only when the property is actually referenced in the SELECT or WHERE clause, not preemptively on every edge.

---

## Decision 4: Silent failures become loud failures

**Context:** `labels(n)` currently silently returns empty strings for every row. Agents querying `RETURN labels(n)` see a column populated with empty values — a result that looks valid. Any agent that then acts on those values (filtering by label, enumerating label types) gets incorrect behavior with no signal that the function isn't implemented. The same pattern likely applies to any other unsupported function the engine encounters.

**Options considered:**
- *Silent drop (status quo):* Unsupported functions return empty strings or are omitted. Agents "succeed" but with wrong data. Easy to implement as the existing fallback; trains agents to distrust the tool.
- *Warning (logged server-side, empty value returned):* Log a warning to the Electron main process log but still return an empty value. The agent still sees incorrect results; the warning is only visible to someone reading log files.
- *Error out:* Throw `"unsupported function: <name>"` when the engine encounters an unrecognized function. The agent gets an explicit signal that the query can't be answered as written. The agent can adapt (rewrite the query, use a different tool, or escalate).

**Pick:** Error out. Unsupported functions throw `"unsupported function: <name>"`.

**Rationale:** Silent wrong results are categorically worse than explicit errors for a tool that agents use to verify data. An agent receiving `"unsupported function: labels"` can adapt — it knows the query needs rewriting. An agent receiving a column of empty strings has no reason to question the result. The Phase C tool description update documents the supported function set, so agents know before querying what is and isn't available.

**Consequences:** Existing callers of `query_graph` that used `labels(n)` were receiving empty values — there is no backward-compat concern since the current behavior is already wrong. After this wave, those callers get an explicit error and can rewrite to use the `label` column directly. The Phase C update to the `query_graph` tool description must enumerate the supported functions so agents know the boundary.

---

## Decision 5: Regression-test fixture covers each bug

**Context:** The five bugs existed in the codebase prior to this wave without any test catching them. The existing `cypherEngine.test.ts` covers happy-path patterns but didn't include anonymous endpoints, target-label filters, relationship-property access, `labels()`, or project node properties. Without per-bug regression tests, a future change to the translation pipeline can reintroduce any of these bugs silently.

**Options considered:**
- *No new test file:* Add cases to the existing `cypherEngine.test.ts`. Simpler; mixes regression coverage with the existing test structure, making it less obvious which tests are guarding against previously-known bugs.
- *Per-bug tests in existing file:* Add a clearly-marked "regression" section to `cypherEngine.test.ts`. Keeps coverage in one file; the section boundary documents intent.
- *New dedicated fixture `cypherEngine.smoke.test.ts`:* One test per bug, each named after the bug it guards. An in-memory `:memory:` SQLite DB seeded with a small representative graph. Isolated from the main test file; the smoke fixture is the authoritative list of known bugs and their fixes.

**Pick:** New `cypherEngine.smoke.test.ts` with one test per bug, running against an in-memory DB.

**Rationale:** A dedicated fixture makes the regression suite self-documenting. Anyone reading `cypherEngine.smoke.test.ts` sees exactly which patterns were broken and what correct behavior looks like. Mixing regression cases into the existing test file obscures that history. The in-memory DB keeps the fixture fast (< 1s target) and isolated from the real graph.

**Consequences:** Phase D is a `haiku-test-author` dispatch responsible for the fixture. The fixture must be seeded with nodes and edges that exercise each bug: a `Class` target node for the label-filter test, edges with a `confidence` property for the property-access test, `File` nodes with `indexed_at` for the project-property test. If Phase B changes the fix shape materially from what Phase A diagnosed, Phase D must be updated to match.

---

## Decision 6: No `query_graph` schema change

**Context:** All five bugs are in the engine's internal Cypher-to-SQL translation. The `query_graph` MCP tool's input shape (a `query` string) and output shape (a JSON array of row objects) are not the source of any bug.

**Options considered:**
- *Change the tool schema:* Add parameters (e.g., `explain: boolean` to return the generated SQL) or change the output shape (e.g., add a `warnings` array for soft failures). Useful for debugging but expands scope.
- *Keep the tool schema exactly as-is:* Internal fixes only. The tool surface stays unchanged; callers that work today continue to work; callers that fail today get either correct results or explicit errors.

**Pick:** No schema change. The `query_graph` MCP tool's input/output shape is frozen for this wave. All bug fixes are internal to `cypherEngine.ts`, `cypherEngineSqlHelpers.ts`, `cypherEngineSupport.ts`, and `cypherEngineParser.ts`.

**Rationale:** The tool surface is the contract with every agent session that uses `query_graph`. Changing it mid-wave — even additively — risks unexpected behavior in sessions that are already running. The bugs are all fixable without touching the schema. Phase C updates only the tool's natural-language description to document supported Cypher syntax; the JSON schema parameters are not changed.

**Consequences:** Debugging tools (explain mode, warnings array) are deferred to a future wave. Agents that need to understand why a query failed must rely on the error message. The Phase C description update is the primary affordance for guiding agents toward supported syntax.

---
