# Wave 66 — ADR: Codebase Graph MCP Tool Surface Repair

**Status:** LOCKED 2026-04-30 by orchestrator.
**Plan:** `roadmap/wave-66-graph-mcp-fixes.md`

---

The codebase knowledge graph is healthy — 18,331 nodes, 13,161 edges, SQLite-backed, tree-sitter parsed, auto-syncing. Adoption across 369 sessions was approximately 0%. A runtime audit confirmed why: every natural call that agents make (per `~/.claude/rules/graph-tool-routing.md`, per Claude Code training data) silently misfires. `search_graph({query: "..."})` returns all 18,331 nodes instead of filtering. `trace_call_path({symbol: "...", direction: "callers"})` throws `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`. `get_code_snippet({symbol: "..."})` returns "Symbol not found: undefined". `index_status({})` reports "Project undefined is not indexed." Root cause: parameter-name drift between handler implementations, their JSON schemas, and the routing rule injected into every session.

These six decisions govern the repair. Five are purely about *how* to fix what already exists; the sixth (schema v1→v2) is the one structural change the wave introduces. The graph internals (System 2, `GraphControllerCompat`, the SQLite layer) are not touched.

---

## Decision 1: Keep `Promise<string>` handler return type — no envelope migration

**Context:** The MCP `{ isError: boolean, content: [...] }` envelope is the canonical MCP protocol error shape. Migrating to it would let callers distinguish errors structurally rather than by string prefix. However, `McpToolDefinition` is consumed by the internal MCP server registrar (`internalMcpServer.ts`) and by renderer-side mocks; its interface is not this wave's scope.

**Options considered:**
- *Industry standard (MCP spec):* Return `{ isError: true, content: [{ type: "text", text: "..." }] }` for failures. Callers detect `isError` structurally rather than by string-prefix matching. Requires changing `McpToolDefinition`, the registrar, and all handler signatures.
- *Current (keep `Promise<string>`):* Handlers return strings; errors are prefixed `"Error: "`. Claude Code already handles this pattern — it treats any tool result starting with "Error:" as an error.
- *Hybrid:* Return `Promise<string | McpError>` with a union discriminant. Adds type complexity for no Claude-Code-visible benefit.

**Pick:** Keep `Promise<string>`. Failures prefix `"Error: <message>"`.

**Rationale:** The `McpToolDefinition` interface change cascades to the registrar and renderer mocks — that's a multi-wave change. Claude Code already handles string-prefixed errors gracefully. No user-visible benefit from the structural envelope at this tooling layer. The wave is a repair job, not a protocol upgrade.

**Consequences:** Error strings must follow the `"Error: "` prefix convention consistently so Claude Code agents can detect them. Phase C enforces this across all 14 handlers. A future wave that migrates `McpToolDefinition` to the MCP envelope can replace Phase C's string prefixes with the structural shape.

---

## Decision 2: Bilingual aliasing — accept both natural and schema names; new name wins

**Context:** Four handlers fail because agents call them with natural parameter names (`query`, `symbol`, `direction: "callers"`) that differ from the schema-declared names (`name_pattern`, `qualified_name`, `function_name`, direction: `inbound`). Three options:

- *Hard rename:* Change the schema to match the natural names, drop legacy names. Any caller using the old schema-correct name breaks immediately.
- *Bilingual aliasing:* Handlers read `args.query ?? args.name_pattern`. Schema advertises the natural name as primary; old name is tagged `deprecated`. Both accepted for one wave.
- *Rename the routing rule only:* Update `~/.claude/rules/graph-tool-routing.md` to match the schema. No code changes. Relies on the routing rule being injected into every session, which has not worked reliably.

**Pick:** Bilingual aliasing. New (natural) name is the primary; old (schema-correct) name is a deprecated alias. Handlers: `args.query ?? args.name_pattern`, `args.symbol ?? args.qualified_name`, etc. New name wins on collision.

**Rationale:** Hard rename breaks any caller already using the schema-correct name. Routing-rule-only fix has zero code reliability — it's the same bet that produced 0% adoption. Aliasing is zero-risk for existing callers and zero-adoption-risk for new ones. One-wave deprecation window gives future cleanup a clean cutover.

**Consequences:** Tool schemas advertise both names; the deprecated alias is documented in the description text. Phase A implements aliases and tests that new name wins when both are passed. A future wave (Wave 67+) drops the `name_pattern` / `qualified_name` / `function_name` aliases and removes the `??` fallbacks.

---

## Decision 3: `confidence REAL DEFAULT 1.0` as a dedicated column on `edges` — not in `props` JSON

**Context:** Call-resolution assigns confidence values to edges: 1.0 for exact symbol+import match, 0.55 for suffix+import match, 0.30 for fuzzy match. These need to be stored and queryable. Two options:

- *Dedicated column:* `ALTER TABLE edges ADD COLUMN confidence REAL DEFAULT 1.0`. Column is indexed, sortable, and trivially readable in Cypher. Bumps `SCHEMA_VERSION` 1→2.
- *`props` JSON field:* Store `{"confidence": 0.55}` in the existing `props TEXT` column. No schema migration, no version bump. Querying requires `json_extract(props, '$.confidence')` — slower, not indexable without a generated column, easy to forget.

**Pick:** Dedicated column. `SCHEMA_VERSION` bumps 1→2. Migration: `ALTER TABLE edges ADD COLUMN confidence REAL DEFAULT 1.0` with backfill of existing rows.

**Rationale:** Confidence is a hot-path sort key for the 3-tier search (Decision 4) and for any future ranking work. JSON-path extraction on 13,000+ edges per query is non-trivially slower and not indexable without a DDL-level generated column, which is functionally identical to just adding the column. The migration is one `ALTER TABLE` statement.

**Consequences:** `SCHEMA_VERSION` is 2 after this wave. `graphDatabaseSchema.ts` migration runner must handle v0→v2 and v1→v2 chains. Existing edges are backfilled to 1.0 (correct default: any pre-confidence-tracking edge was inserted via exact resolution). Phase E adds the migration and unit-tests v0→v2, v1→v2, and backfill.

---

## Decision 4: 3-tier symbol search in one UNION query with a rank column — not separate handler calls

**Context:** `compatSearchGraph` currently does substring scan of all nodes. Phase E adds tiering: exact match (rank 0) → prefix match (rank 1) → substring match (rank 2). Implementation options:

- *Separate handler calls:* Caller tries exact first, then prefix, then substring. Three DB round-trips; adds coordination logic to the calling layer.
- *UNION query with rank column:* Single SQL: `SELECT *, 0 AS rank FROM nodes WHERE name = ? UNION ALL SELECT *, 1 AS rank ... UNION ALL SELECT *, 2 AS rank ...`, grouped by `qualified_name` to deduplicate, ordered by `MIN(rank)`. One round-trip; handler returns already-ranked results.
- *Separate query functions:* New `searchExact`, `searchPrefix`, `searchSubstring` helpers the handler can call in sequence.

**Pick:** UNION query with rank column. Single DB round-trip; deduplication via `GROUP BY qualified_name, MIN(rank)`.

**Rationale:** One round-trip is faster and simpler. The caller (handler) receives a ranked flat list and can annotate the response by rank without post-processing state. Separate calls add latency and require coordination logic that belongs in the DB layer anyway.

**Consequences:** `compatSearchGraph` return type gains an optional `rank` field on results (0/1/2 → exact/prefix/substring). The handler annotates each result group. Duplicate symbols (appearing in multiple tiers) show at their best (lowest) rank. Phase E tests: fixture with a symbol that matches all three tiers asserts it appears once at rank 0.

---

## Decision 5: Validation helpers inline — not Zod

**Context:** All 14 handlers currently have no parameter validation. Missing or wrong-type parameters either cause silent misfires (the P0 bugs) or throw uncaught TypeErrors. Options:

- *Zod:* Schema-first validation with detailed error messages. Industry-standard for TypeScript input validation. Adds a runtime dependency in the main process; ~10KB bundle cost. Handlers require async-compatible parse calls. Overkill for 14 handlers with 2–3 params each.
- *Inline helpers:* `assertString(args, name)` / `assertOneOf(args, name, allowed)` / `assertJsonString(args, name)` — ~30 lines in a new `mcpToolHandlerValidation.ts`. Throws with `"Error: missing required parameter '<name>'"` or `"Error: '<name>' must be one of: a, b, c"`. No deps.
- *Ad hoc guards:* `if (!args.name) return "Error: ..."` at the top of each handler. No shared convention; errors diverge in message format.

**Pick:** Inline helpers in `mcpToolHandlerValidation.ts`. Three functions: `assertString`, `assertOneOf`, `assertJsonString`.

**Rationale:** 14 handlers × ~2 params = ~28 validation sites. Zod's benefit (schema composition, `.parse()` type inference) is proportionate to the number of schemas; at 28 flat param reads it's overhead. Ad-hoc guards produce inconsistent error messages that are harder for Claude Code to parse. The helper file is 30 lines and keeps the error-string format consistent across all handlers, which matters because Phase A accepts bilingual names (two names, one validation site per param after aliasing).

**Consequences:** All error strings produced by helpers start with `"Error: "` — matching the `Promise<string>` convention from Decision 1. The helpers are pure (no DB dependency), easily unit-tested in Phase C. Future handlers follow the same pattern. Switching to Zod later is trivial — replace the throw-on-fail helpers with a Zod schema; the error-string format convention remains.

---

## Decision 6: Bilingual direction enum on `trace_call_path` — accept both sets

**Context:** `trace_call_path`'s `direction` parameter schema declares `inbound | outbound | both`. The global routing rule (`~/.claude/rules/graph-tool-routing.md`) shows `direction: 'callers'` in its call example. `callers` is not in the enum → it silently falls through to `both` (or throws, depending on the handler path). The natural vocabulary (`callers`, `callees`) is closer to how every agent and developer thinks about this.

**Options considered:**
- *Rename the enum:* Change schema to `callers | callees | both`. Breaks any caller using `inbound | outbound`.
- *Bilingual enum:* Schema lists all five values. Handler maps: `callers → inbound`, `callees → outbound`. The `inbound | outbound | both` names remain valid; `callers | callees` are aliases.
- *Only update the routing rule:* Change `~/.claude/rules/graph-tool-routing.md` to use `inbound`. No code changes. Relies on the rule being injected — the same bet that produced 0% adoption.

**Pick:** Bilingual enum. Schema enum: `"inbound" | "outbound" | "both" | "callers" | "callees"`. Handler maps `callers → inbound`, `callees → outbound` before passing to the DB query.

**Rationale:** Renaming discards a valid existing vocabulary with no benefit. Rule-only fix has the same reliability problem as the broader parameter-name drift. Bilingual enum is forward-compatible (callers/callees become the informal primary; inbound/outbound stay valid), zero-breaking, and validated by `assertOneOf` from Decision 5.

**Consequences:** Tool description text documents both sets of direction names. Phase A implements the mapping and tests all five values route to the correct DB query direction. A future wave may deprecate `inbound | outbound` in favor of the natural vocabulary — the same one-wave aliasing pattern as Decision 2.

---
