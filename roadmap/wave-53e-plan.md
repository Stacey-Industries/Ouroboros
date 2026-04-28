# Wave 53e — Graph-Context Runtime Wiring Fix
## Implementation Plan

**Status:** ✅ COMPLETED — 2026-04-28 · Released as v2.7.6 · Result: `roadmap/auto-briefs/wave-53e-result.md`
**Version target:** v2.7.6 (patch — bug fix to existing graph-tool wiring; no new feature surface)
**Feature flags:** None new.
**Dependencies:**
- Wave 53d (auto-inject lifecycle fix) ✅ shipped at v2.7.3
- Wave 53d Phase D smoke (2026-04-28) — surfaced this bug

**References:**
- `roadmap/wave-53d-live-test.md` — smoke artifact with exact JSON-RPC error messages from the live MCP server (preserved evidence)
- `roadmap/decisions/wave-53d.md` Decision 9 — "Wave 54 = PAUSED on Wave 53e"
- `src/main/codebaseGraph/graphTypes.ts` — `GraphToolContext` type definition (line 80)
- `src/main/codebaseGraph/graphControllerCompat.ts:79` — `getGraphToolContext()` implementation
- `src/main/internalMcp/internalMcpTools.ts:57` — the `as any` cast hiding the bug
- `src/main/codebaseGraph/mcpToolHandlerDefs.ts` and `mcpToolHandlerHelpers.ts` — handlers accessing missing context fields

---

## Why this wave exists

The Wave 53d smoke proved the auto-inject lifecycle fix works (settings.json gets the entry, server is reachable, `tools/list` returns 14 graph tools), but every single tool errors at runtime: `Cannot read properties of undefined (reading 'searchNodes' / 'getArchitecture' / 'listProjects' / ...)`.

The orchestrator's investigation pinned the root cause **before drafting this plan**: the `GraphToolContext` type declares 3 fields (`pipeline.index`, `projectRoot`, `projectName`), but the handlers access additional fields (`db`, `queryEngine`, `cypherEngine`) that were never added to the type or populated by `getGraphToolContext()`. An `as any` cast at `internalMcpTools.ts:57` was suppressing the TypeScript error that would have caught the mismatch at compile time. The required fields already exist on `CompatHandle` (line 43–51 of `graphControllerCompat.ts`); they just need to be exposed through `getGraphToolContext()`.

This is a 3-file fix plus a contract test. No startup-order race, no architectural redesign, no scope creep into the codebaseGraph module's other surfaces.

---

## Goal

Make the 14 graph-aware MCP tools return real results when called by an MCP client (IDE-internal Claude Code or external terminal). After this wave, the post-fix smoke should show `search_graph` returning actual node hits, `get_architecture` returning the architecture summary, etc.

The wave's success criterion is binary: tools work, or they don't. Adoption observation (whether the agent actually uses them) is the next layer and resolves Wave 54's verdict — but adoption can't be measured until tools work.

---

## Scope

### In-scope

- Phase A: extend `GraphToolContext` type, populate `getGraphToolContext()` accordingly, remove the `as any` cast, add a contract test.
- Phase B: re-run the smoke against the live MCP server (curl + JSON-RPC). Verify `tools/call` for representative tools returns real results, not error strings.
- Phase C: wrap-up — result brief, ADR finalize, plan status flip, version bump, push. Update Wave 54 verdict path based on smoke results.

### Out-of-scope

- Per-spawn `--mcp-config` injection (Wave 51's path) — separate code path, not affected by this fix. If Phase B reveals it's also broken, surface as out-of-wave follow-up; do not expand scope here.
- Wave 54 implementation. Wave 54 stays BLOCKED until Phase B confirms tools work and the user runs an adoption smoke in a fresh Claude Code session.
- Standalone MCP server extraction. Same as before; out of wave.
- Refactoring or cleaning up `mcpToolHandlerDefs.ts` / `mcpToolHandlerHelpers.ts`. The handlers access the right fields; the type just needs to admit them.

---

## Phase A — The fix

**Goal:** Make `GraphToolContext` and its constructor consistent with handler access patterns.

### Files modified

| File | Change |
|---|---|
| `src/main/codebaseGraph/graphTypes.ts` | Extend `GraphToolContext` interface (line 80) to include `db: GraphDatabase`, `queryEngine: QueryEngine`, `cypherEngine: CypherEngine`. Add the three import statements at the top of the file. |
| `src/main/codebaseGraph/graphControllerCompat.ts` | Update `getGraphToolContext()` (line 79) to return the three new fields from `this.handle`. Existing fields stay. |
| `src/main/internalMcp/internalMcpTools.ts` | Remove the `as any` cast at line 57 (`createGraphMcpTools(graphContext as any)` → `createGraphMcpTools(graphContext)`). The type now matches the parameter shape. |

### New test file

| File | Purpose |
|---|---|
| `src/main/codebaseGraph/graphControllerCompat.contract.test.ts` (or extend existing test) | Contract test: construct a `GraphControllerCompat` with a real `CompatHandle`, call `getGraphToolContext()`, assert the returned object has all of `db`, `queryEngine`, `cypherEngine`, `pipeline.index`, `projectRoot`, `projectName`. Catches any future regression where someone narrows the type or the implementation. |

### Subagent dispatch

`sonnet-implementer` — three-file edit + test. Self-contained; the orchestrator's investigation already provides the full root-cause and the file-line list. The implementer's brief is concrete: extend the type, plumb the fields through, drop the cast, add the assertion.

### Acceptance

- [ ] `GraphToolContext` includes `db`, `queryEngine`, `cypherEngine` (with proper imports).
- [ ] `getGraphToolContext()` returns them.
- [ ] `as any` cast removed; `npx tsc --noEmit -p tsconfig.node.json` clean.
- [ ] Contract test passes — asserts the full shape.
- [ ] Existing `internalMcp/` and `codebaseGraph/` tests still pass.
- [ ] Lint clean on touched files.
- [ ] Commit: `fix(wave-53e): Phase A — populate GraphToolContext with engine refs the handlers need`

---

## Phase B — Re-run smoke

**Goal:** Confirm the fix works end-to-end against a live MCP server.

### Smoke steps (orchestrator-direct, post-restart)

This phase has the same constraint as Wave 53d Phase D: the running IDE process is from before the fix; verification requires a restart that ends the orchestrating session. The checklist is run against a fresh IDE post-rebuild + restart.

1. After IDE restart, read `.claude/settings.json` — confirm `mcpServers.ouroboros` URL.
2. `curl -sS http://127.0.0.1:<port>/sse` → confirm reachable.
3. `curl -X POST .../message -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'` → confirm 14 tools listed (or fallback 6 if graph isn't ready).
4. **The critical step:** call each of these tools via `tools/call`:
   - `list_projects` (no args) — should return a project list, not an error.
   - `get_graph_schema` (no args) — should return node/edge counts.
   - `search_graph` with `{"query":"injectIntoProjectSettings"}` — should return actual node hits with file:line locations.
   - `get_architecture` with `{"aspects":["hotspots"]}` — should return the architecture summary.
5. If all four return real content (not "Error ... Cannot read properties of undefined"), the fix works.
6. If any fail differently than before, capture the new error shape — there may be a second-layer bug Phase A didn't address.

### Output

Append observations to `roadmap/wave-53d-live-test.md` (continuing the same artifact for traceability) under a new section "Wave 53e post-fix smoke (YYYY-MM-DD)."

### Acceptance

- [ ] All four representative tools return real (non-error) content.
- [ ] No regressions in tool list shape (still 14 tools, healthy graph path).
- [ ] Smoke notes appended.

---

## Phase C — Wrap-up + Wave 54 status reassessment

**Goal:** Close the wave, update Wave 54's verdict path.

### Tasks

- Full vitest suite (per user direction in earlier waves: skipped here, pre-push hook validates).
- `npm run lint` — zero errors.
- Both typechecks — clean.
- Result brief at `roadmap/auto-briefs/wave-53e-result.md`.
- ADR finalize at `roadmap/decisions/wave-53e.md`.
- Plan status flip on this file.
- `roadmap/wave-54-plan.md` status update — flip from "BLOCKED on Wave 53e" to "BLOCKED on Wave 54 adoption smoke" if Phase B passes (since now tools work but adoption is the open question), or to a more specific blocker if Phase B revealed a second-layer issue.
- Memory update: replace the Wave 53d "second runtime bug" entry in `project_graph_tool_adoption_gap.md` with this wave's resolution.
- `package.json` v2.7.5 → v2.7.6.
- Release commit + tag + push + GH release.

### Acceptance

- [ ] All gates clean.
- [ ] Result brief captures Phase B's observations.
- [ ] ADR finalized.
- [ ] Wave 54's blocker is updated to reflect post-53e state.
- [ ] Pushed with tag v2.7.6.

---

## Subagent execution model

- Phase A: `sonnet-implementer` (cross-file fix; clear contract from this plan).
- Phase B: orchestrator (live HTTP probe; judgment-driven observation).
- Phase C: orchestrator.

All phase agents skip the full vitest suite; per-phase scoped lint + typecheck only.

---

## Risks

| Risk | Mitigation |
|---|---|
| Removing `as any` reveals a second type mismatch I haven't seen | Surface in Phase A's report; either expand Phase A's scope minimally, or document as a follow-up if it's unrelated to the runtime errors. |
| `getGraphToolContext()` is called when `this.handle` doesn't have `db` / `queryEngine` populated yet (race) | Then the contract test would still pass at construction time but real calls would fail. Phase B's smoke catches this; if so, Phase C reframes as "needs deferred resolution" with a separate fix. |
| Phase B reveals tools work for some calls but not others | Honestly report; surface as out-of-wave follow-up. The wave's bar is "the failing tools from the Wave 53d smoke now work," not "every tool works perfectly." |
| Adoption observation requires fresh Claude Code session post-restart | Same as Wave 53d — manual smoke for the user post-ship. Do not block wave wrap-up on it. |

---

## Acceptance criteria (wave-level)

- [ ] `GraphToolContext` type and implementation are consistent.
- [ ] `as any` cast removed.
- [ ] Contract test prevents regression.
- [ ] Live smoke confirms at least 4 representative tools return real content.
- [ ] Wave 54's blocker is updated to reflect post-53e state.
- [ ] No regressions in existing `internalMcp/` or `codebaseGraph/` tests.

---

## Out-of-wave follow-ups

- **Wave 54 adoption smoke (manual)** — user runs in a fresh Claude Code session post-fix; observes whether the agent reaches for graph tools on graph-shaped queries; appends to `roadmap/wave-53d-live-test.md` and finalizes Decision 9 in `wave-53d.md`'s ADR.
- **Per-spawn `--mcp-config` path verification** — separate from the SSE/stdio file-injection path. If a future investigation reveals it's also broken, that's a small follow-up wave (not 53f — call it "53d-followup" or fold into 54's pre-flight if 54 ships).
- **Standalone MCP server (Flavor B)** — still out-of-wave. Only revisit if the user wants tools accessible with the IDE off.
- **Version-drift cleanup** — still pending; out-of-wave.