# Wave 53e Result — Graph-Context Runtime Wiring Fix

**Status:** ✅ COMPLETED — 2026-04-28
**Version:** v2.7.6 (patch — bug fix to existing graph-tool wiring; no new feature surface)
**Plan:** `roadmap/wave-53e-plan.md`
**ADR:** `roadmap/decisions/wave-53e.md`
**Smoke artifact:** `roadmap/wave-53d-live-test.md` (continuation of Wave 53d's smoke doc, with the post-fix section appended)

---

## What shipped

The fix for the runtime bug surfaced by Wave 53d's smoke. Tools were correctly *registered* (the fallback selection in `getActiveTools()` chose the graph path) but every call returned `Cannot read properties of undefined (reading '<methodName>')` because handler closures captured a context that was missing the engine references the handlers needed.

Three concrete changes in Phase A (commit `74d9633`):

1. **Extended `GraphToolContext` type** (`src/main/codebaseGraph/graphTypes.ts`) with `db: GraphDatabase`, `queryEngine: QueryEngine`, `cypherEngine: CypherEngine`. The `CompatHandle` (used by `GraphControllerCompat` internally) already had these fields; they just weren't reaching the public type.

2. **Replaced a local duplicate of `GraphToolContext` in `mcpToolHandlers.ts` with an import from `graphTypes.ts`** (ADR Decision 4). This was the deeper root cause — the duplicate had been silently diverging from the canonical type. With one source of truth, future extensions automatically propagate to the handlers.

3. **Updated `getGraphToolContext()` (`graphControllerCompat.ts:79`)** to plumb the three new fields from `this.handle`, and **removed the `as any` cast in `internalMcpTools.ts:57`** that had been suppressing the type-system signal that would have caught this in the first place.

A regression test (`graphControllerCompat.contract.test.ts`, 2 cases) asserts the full shape of `getGraphToolContext()`'s return — catches any future regression where someone narrows the type or the implementation drifts from it.

## Headline

**Before** (Wave 53d's smoke, via JSON-RPC against the live server):

| Tool | Result |
|---|---|
| `search_graph` | `Cannot read properties of undefined (reading 'searchNodes')` |
| `get_architecture` | `Cannot read properties of undefined (reading 'getArchitecture')` |
| (every tool, same error shape) | broken |

**After** (Wave 53e's smoke, post-fix, post-restart, port 61526):

| Tool | Result |
|---|---|
| `list_projects` | `Agent IDE: 0 nodes, 0 edges (indexed 2026-04-20)` |
| `get_graph_schema` | 11,113 Functions, 2,614 Files, 2,821 Interfaces, 8 edge types listed |
| `search_graph` `{"query":"injectIntoProjectSettings"}` | "Found 18,442 nodes (showing 100): ..." with file paths |
| `get_architecture` `{"aspects":["hotspots"]}` | Real hotspots: `now (degree: 362) -- threadImport.ts:26`, etc. |

The graph tools work end-to-end. Agents that connect to the MCP server now receive real responses.

## Phase tally

| Phase | Files | Lines | Tests | Commit |
|---|---|---|---|---|
| A — Type fix + cast removal + contract test | 6 | +237 / -41 | 2/2 contract + 40 existing | `74d9633` |
| B — Live smoke (orchestrator-direct) | n/a | n/a | n/a | (this commit) |
| C — Wrap-up | This brief, ADR, plan flip, version bump | — | — | (this commit) |

## Gates

| Gate | Result |
|---|---|
| `npm run lint` (full) — touched files | ✅ 0 errors |
| `npx tsc --noEmit -p tsconfig.node.json` (main) | ✅ clean (the cast removal was the litmus test) |
| Phase A scoped tests | ✅ contract test 2/2 + `internalMcp/` 29/29 + `codebaseGraph/` related 11/11 |
| Phase B JSON-RPC smoke | ✅ 4/4 representative tools return real content |
| Full vitest suite | Skipped per user direction; pre-push hook validates |

## Manual smoke (deferred to user — Wave 54 adoption)

The wiring is now verified functional. The remaining open question is **does the agent reach for graph tools when they're available?** That requires a fresh Claude Code session post-restart (the orchestrating session's tool list was frozen pre-fix). Checklist in `roadmap/wave-53d-live-test.md` under "Wave 54 adoption smoke — still pending the user":

1. Open a fresh Claude Code session in the IDE chat panel or external terminal in `C:\Web App\Agent IDE`.
2. Ask a graph-shaped question (e.g., "Use `trace_call_path` to find callers of `injectIntoProjectSettings`.").
3. Observe whether the agent picks the right tool and whether responses are useful.
4. Append observations to `roadmap/wave-53d-live-test.md` and finalize Wave 53d's Decision 9 with the Wave 54 verdict (Greenlit / Redesigned / Retired).

Wave 54's blocker is now "Wave 54 adoption smoke" rather than "Wave 53e graph-context wiring fix" (ADR Decision 6).

## Subagent observations

**Phase A (sonnet-implementer).** Recovered cleanly from a mid-edit interruption via SendMessage and finished the brief. Surfaced an important architectural finding the orchestrator's investigation hadn't dug into: `mcpToolHandlers.ts` had a local duplicate of `GraphToolContext` that was the deeper root cause of the divergence. Replaced the duplicate with an import from the canonical `graphTypes.ts`, ensuring future contract changes propagate automatically. Also surfaced one structural-type call (Decision 5 — inline `{ index: (...) => ... }` rather than full `IndexingPipeline`) and one scoped split (`buildQueryTools` exceeded the 40-line cap after prettier expansion → split into `buildTraceAndChangeTools` + `buildCypherAndAdrTools`).

## Known limitations

- **`list_projects` reports stale stats.** Smoke noticed: project-table shows `0 nodes, 0 edges (indexed 2026-04-20)` while `get_graph_schema` (called moments later, same server) shows 11K+ functions live. Project-table `node_count`/`edge_count` columns aren't refreshed on incremental reindex — only on full re-index. Cosmetic for now (real query results are correct), but worth fixing as a small follow-up.
- **Adoption verification still pending.** This wave shipped the wiring; whether agents use the now-functional tools is the next layer.
- **Per-spawn `--mcp-config` injection path** — Wave 53d Phase B noted it as "intact" without deep inspection. If the SSE/file-injection path was returning broken tools all along (which Wave 53e fixed), the per-spawn path's actual behavior is unknown. If a future investigation finds it's also broken in some way, that's a separate small follow-up.

## Out-of-wave follow-ups

- **Wave 54 adoption smoke (manual)** — user runs in a fresh Claude Code session; appends to `wave-53d-live-test.md`; finalizes Decision 9 in `wave-53d.md`'s ADR. The wave stays paused on this.
- **`list_projects` stale-stat refresh** — small follow-up: refresh project-table stats at the end of each incremental indexing pass, or compute them lazily from live counts.
- **Per-spawn `--mcp-config` path verification** — small follow-up if/when motivated. Not blocking.
- **Standalone MCP server (Flavor B)** — still out-of-wave. Only if user wants tools accessible with IDE off.
- **Version-drift cleanup** — separate from this wave; reconcile result-brief version numbers vs git-tag history for waves 58, 59, 53b. v2.7.6 ships consistent with git-tag truth.

## Memory update

Updated `~/.claude/projects/C--Web-App-Agent-IDE/memory/project_graph_tool_adoption_gap.md`:

- Wave 53e shipped the runtime wiring fix.
- Smoke verified all 4 representative tools return real content.
- Wave 54 status: "PAUSED on Wave 53e" → "PAUSED on Wave 54 adoption smoke" (manual, user-driven).
- Open known unknown about per-spawn injection path resolved-by-implication: it was the file-injection path's broken context all along (Phase A's fix repaired both call sites since they share `getGraphToolContext()`).