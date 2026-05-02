# Wave 70 (proposed) — Graph MCP polish

**Status:** WAVE-IT — small, bundled
**Source:** `roadmap/audit-verification-pass.md` Section D, items #2, #3, #4
**Filed:** 2026-05-01

## Summary

Three closely-related Wave 66/67 follow-ups against `src/main/codebaseGraph/mcpToolHandler*.ts`. All touch the same files, share the same risk surface (agent-visible schema/behavior changes), and benefit from a single soak window. Bundling them avoids three separate "did we break the graph tools" verification cycles.

## The three items

### Item A — Drop legacy parameter aliases (Wave 66 ADR Decision 2 follow-up)

Wave 66 renamed graph-tool input parameters for consistency. Old names were kept as deprecated aliases for "one wave window." That window is now 4+ waves old.

| Tool | Old name (drop) | New name (keep) |
|---|---|---|
| `search_graph` | `name_pattern` | `query` |
| `get_code_snippet` | `qualified_name` | `symbol` |
| `trace_call_path` | `function_name` | `symbol` |
| `manage_adr` | `adr_id` | `id` |

Locations: `src/main/codebaseGraph/mcpToolHandlers.ts:63, 103, 111, 139` (verified 2026-05-01).

Why drop: schema bloat (deprecated names are sent to the AI on every graph-tool decision), pattern-match confusion (model picks the wrong one sometimes), and ADR discipline (the "one wave" promise has rotted).

### Item B — Migrate `McpToolDefinition` envelope to `{isError, content}`

Wave 66 follow-up. The MCP standard tool-result envelope is `{ isError: boolean, content: ContentBlock[] }`. The current envelope diverges. Migration aligns Ouroboros graph tools with the MCP SDK conventions and makes the standalone Ouroboros MCP server (`src/standalone/ouroborosMcp/`) easier to keep in sync.

Action: trace `McpToolDefinition` shape in `mcpToolHandlerDefs.ts` and `mcpToolHandlers.ts`, migrate handlers to return the standard envelope, update tests, and verify the standalone server passes through unchanged.

### Item C — Fix `parseAnomalies` absent-when-zero in `index_status`

Wave 67 follow-up. Verified at `src/main/codebaseGraph/mcpToolHandlerDefs.ts:83` (2026-05-01): `getParseAnomaliesLines()` returns `[]` when `anomalies.count === 0`, so the field never appears in clean output. Agents reading `index_status` cannot distinguish "no anomalies" from "field omitted" / "indexer regressed and stopped reporting."

Fix: always include `parseAnomalies` in the response. When count is zero, return a positive signal: `parseAnomalies: { count: 0, files: [] }` or equivalent. The signal "we checked, found none" is meaningfully different from "field absent."

## Recommended wave shape (3 phases)

**Phase A — Soft-deprecate (low risk).**
Add a deprecation log line for each of the four aliases: `[graph-mcp] deprecated parameter 'name_pattern' used — please use 'query'`. Ship and watch logs for one usage cycle.

**Phase B — Hard cleanup (the actual change).**
- Remove the four aliases from schemas + handler fallbacks
- Migrate `McpToolDefinition` envelope to `{isError, content}`
- Always emit `parseAnomalies` in `index_status` even when count is zero
- Update tests in `mcpToolHandlers.test.ts` and `mcpToolHandlerDefs.test.ts`

**Phase C — Docs + close.**
- Update any docs referencing the old parameter names
- Mark the Wave 66 ADR Decision 2 + Wave 67 anomalies follow-up CLOSED
- Sync the standalone `src/standalone/ouroborosMcp/` server if needed

## Risk surface

- **Models in flight using the old names** silently get empty results (the field is ignored, not error). Phase A's deprecation log gives observability before Phase B's cliff.
- **Envelope migration** could break any consumer that pattern-matches the old shape. Inventory consumers (renderer? other MCP servers? telemetry log writers?) before Phase B.
- **`parseAnomalies` always-present** could break consumers that test `if (response.parseAnomalies)` truthy. Search for that pattern before changing.

## References

- `src/main/codebaseGraph/mcpToolHandlers.ts` — schemas + handlers
- `src/main/codebaseGraph/mcpToolHandlerDefs.ts` — tool definition objects (anomalies fix lives here)
- `src/main/codebaseGraph/mcpToolHandlerHelpers.ts` — shared formatting helpers
- `src/standalone/ouroborosMcp/ouroborosMcpServer.ts` — keep in sync
- Audit: `roadmap/audit-verification-pass.md` Section D items #2, #3, #4 (high-priority STILL-RELEVANT)
- Wave 66 ADR Decision 2 (parameter rename, "one wave" alias window)
- Wave 67 ADR (anomalies field introduction)
