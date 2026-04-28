# Wave 53d — Graph Tool Adoption Fix
## Implementation Plan

**Status:** ✅ COMPLETED — 2026-04-28 · Released as v2.7.3 · Result: `roadmap/auto-briefs/wave-53d-result.md` · Decision 9 (Wave 54 verdict) PENDING post-restart smoke
**Version target:** v2.7.3 (patch — bug fix to existing internalMcp wiring; no new feature surface; doc corrections)
**Feature flags:** None new. Existing `internalMcpEnabled` (default `true`) and `internalMcp.transport` (default `'sse'`) continue to gate behavior.
**Dependencies:**
- Wave 51 (CodeMode + stdio transport) ✅ shipped — `internalMcpStdioTransport.ts` is the external-terminal path
- Wave 53c (corpus analyzer, 0% adoption finding) ✅ shipped 2026-04-28 — motivates this wave
- `src/main/internalMcp/` and `src/main/codebaseGraph/` subsystems (read for context, fix for wiring)

**References:**
- `roadmap/wave-53c-corpus-analysis.md` — finding that motivates this wave (0/369 sessions used graph tools)
- `roadmap/decisions/wave-53c.md` Decision 11 — verdict reframe
- `~/.claude/projects/C--Web-App-Agent-IDE/memory/project_graph_tool_adoption_gap.md` — durable note
- `src/main/internalMcp/CLAUDE.md`, `src/main/codebaseGraph/CLAUDE.md` — subsystem maps

---

## Why this wave exists

Wave 53c measured 0% graph-tool adoption across 369 Claude Code sessions. A quick post-Phase-C audit found three contributing causes — all wiring, none behavior:

1. The IDE's MCP server (port 57225 at audit time) was not reachable from a fresh shell — `curl http://127.0.0.1:57225/sse` fails connection.
2. The project's `.claude/settings.json` had no `mcpServers` block at audit time, so even if the server were running, sessions wouldn't connect.
3. `~/.claude/rules/graph-tool-routing.md` references the graph-healthy tool names; under degraded-graph fallback, different names are exposed and the rule becomes incomplete (not wrong — just half the picture).

Until adoption is non-zero on a healthy wiring, Wave 54 (TS semantic operations / new symbol tools) cannot ship — it would compound the gap rather than close it.

---

## Goal

Make graph tools reach Claude Code sessions reliably, end-to-end:
- IDE-internal sessions get the tools registered every time the IDE is up.
- External terminal Claude Code sessions in this project's directory get them too (via Wave 51's stdio bridge), as long as the IDE is running.
- The routing rule is accurate for both healthy-graph and degraded-fallback tool surfaces.
- Live testing confirms agents will actually reach for these tools when correctly wired.

Out-of-wave: full standalone (terminal works with IDE off). That's a separate refactor wave.

---

## Scope

### In-scope
- Phase A: rule documentation accuracy (graph-healthy + fallback paths).
- Phase B: read-only diagnostic — why is auto-inject not sticking? Why is the MCP server unreachable? Produces a root-cause document, no code changes.
- Phase C: targeted fix for the diagnosed issue. Cross-file implementation if the root cause spans multiple modules.
- Phase D: external terminal verification + live tool exercise. Subjective adoption observations.
- Phase E: wave wrap-up — decision report on Wave 54 status, full gates, push.

### Out-of-scope
- Standalone MCP server extraction (graph DB + server in a process independent of the IDE). Wave-sized refactor; deferred unless Phase D shows demand.
- Adding new tools. This wave fixes adoption of existing tools.
- Wave 54 implementation. Wave 54 stays BLOCKED until Phase E delivers its verdict on adoption.
- CodeMode changes. CodeMode routing already exists (Wave 51); we use it but don't modify it.

---

## Architecture (current state, to be verified by Phase B)

```text
IDE main process
 ├─ main.ts startup
 │   └─ startInternalMcpServer({transport, port: 0}) → SSE server on random port
 │       └─ injectIntoProjectSettings(projectRoot, port, {transport})
 │           └─ writes .claude/settings.json:
 │               { mcpServers: { ouroboros: { url: "http://127.0.0.1:PORT/sse" } } }
 │                                  OR { command: "node", args: [stdioPath, port] }
 │
 ├─ on shutdown / on root removal
 │   └─ removeFromProjectSettings(projectRoot)  ← may be over-aggressive
 │
 └─ MCP server lifecycle
     ├─ healthy → forwards to graphController (14 tools via mcpToolHandlers.ts)
     └─ degraded → falls back to internalMcpToolsGraph.ts (6 tools)

External terminal Claude Code
 └─ reads project's .claude/settings.json
     └─ if mcpServers.ouroboros exists:
         ├─ SSE: connects directly to http://127.0.0.1:PORT/sse
         └─ stdio: spawns `node <stdioPath> <port>` which forwards to PORT/message
```

The wave does not change this architecture. It fixes the lifecycle so the auto-inject stays applied and the server stays reachable.

---

## Phase A — Rule documentation accuracy

**Goal:** Make `~/.claude/rules/graph-tool-routing.md` accurate for both the healthy-graph and degraded-fallback tool surfaces. Quick docs delta.

### Files modified

| File | Change |
|---|---|
| `~/.claude/rules/graph-tool-routing.md` | Add a "Tool surface depends on graph health" subsection. Document both name sets. Healthy: `search_graph`, `trace_call_path`, `query_graph`, `get_architecture`, `detect_changes`, `get_code_snippet`, `search_code`, `manage_adr`, plus admin (`index_repository`, `list_projects`, `delete_project`, `index_status`, `get_graph_schema`, `ingest_traces`). Degraded: `get_architecture`, `get_codebase_context`, `search_symbols`, `get_symbol`, `trace_imports`, `detect_changes`. |

### Subagent dispatch

Orchestrator-direct, not a subagent. ~15 min.

### Acceptance

- [ ] Rule lists both tool surfaces with one-line each on when each applies.
- [ ] Rule's existing "use graph over Grep/Read" guidance preserved.
- [ ] Commit: `docs(wave-53d): Phase A — align graph-tool-routing rule with both tool surfaces`

---

## Phase B — Diagnostic (read-only)

**Goal:** Produce a root-cause document explaining (a) why port 57225 was dead, (b) why `mcpServers.ouroboros` is missing from `.claude/settings.json` despite auto-inject existing, (c) what's currently in the IDE's runtime state for the MCP server. **No code changes in this phase.**

### Investigation surface

- `src/main/main.ts` — startup sequence, where `startInternalMcpServer` is called.
- `src/main/internalMcp/index.ts` — `startInternalMcpServer` definition.
- `src/main/internalMcp/internalMcpServer.ts` — server lifecycle, listen, error handling.
- `src/main/internalMcp/internalMcpAutoInject.ts` — `injectIntoProjectSettings` and `removeFromProjectSettings` call sites.
- `src/main/windowManager.ts` — when project roots are added/removed; suspected source of over-aggressive `removeFromProjectSettings`.
- `src/main/config.ts` and `configSchemaTail.ts` — `internalMcpEnabled` flag default + handling.
- Any `app.on('before-quit')` / `app.on('window-all-closed')` handlers — look for `removeFromProjectSettings` in shutdown paths.
- Live runtime check: is the IDE process running right now? What port does its MCP server listen on?

### Hypotheses to test (in priority order)

1. **`removeFromProjectSettings` runs on shutdown** and the user closed the IDE, leaving `.claude/settings.json` clean. Plausible — would explain port-dead AND missing `mcpServers` block.
2. **Auto-inject skipped because `internalMcpEnabled === false`** in the user's actual config. Check `electron-store` value, not the schema default.
3. **Port collision or bind failure** — `port: 0` should give a random free port, but something might be intercepting. Less likely.
4. **Multi-window race** — if multiple windows call `injectIntoProjectSettings`/`removeFromProjectSettings` concurrently, the last writer might unintentionally erase. Atomic write is in place but state-level race not addressed.
5. **`removeFromProjectSettings` called when last project root closes**, even though IDE is still running. Plausible — would mean closing one project removes auto-inject for all of them.

### Subagent dispatch

`sonnet-diagnostician` — this is exactly its niche. Read-only investigation, must produce a root-cause document, refuses to propose fixes before evidence.

### Output

- `roadmap/wave-53d-diagnostic.md` (~200 lines) — what's broken, why, with citations to specific code lines. Includes either a working hypothesis with evidence OR a "could not confirm; needs runtime instrumentation" finding.

### Acceptance

- [ ] Diagnostic doc identifies the root cause (or honestly says "needs runtime instrumentation; here's what to add").
- [ ] Every claim cites a specific file:line.
- [ ] No code changes made.
- [ ] Commit: `docs(wave-53d): Phase B — auto-inject root-cause diagnostic`

---

## Phase C — Targeted fix

**Goal:** Apply the fix the Phase B diagnostic identifies. Scope depends on the diagnostic — could be one-line config default flip, could be a few-file lifecycle change.

### Files modified (placeholder — depends on Phase B)

To be filled in once Phase B's root-cause doc is written. Likely candidates:
- `src/main/internalMcp/internalMcpAutoInject.ts` (lifecycle decisions)
- `src/main/main.ts` or `src/main/windowManager.ts` (shutdown / root-removal paths)
- `src/main/configSchemaTail.ts` (if a default flip is the answer)

### Subagent dispatch

`sonnet-implementer` — the fix is likely cross-file (lifecycle bugs typically span 2–3 modules). Brief is written after Phase B lands.

### Acceptance

- [ ] Root cause is fixed; reproduction case from Phase B no longer reproduces.
- [ ] No regressions in existing internalMcp / codebaseGraph tests.
- [ ] New scoped test covers the lifecycle path that was broken (so it can't regress silently).
- [ ] Lint, typecheck clean.
- [ ] Commit: `fix(wave-53d): Phase C — <root cause one-liner>`

---

## Phase D — External terminal verification + live test

**Goal:** Confirm the fix works in two contexts and gather subjective adoption observations.

### Verification steps

1. **Restart the IDE** so the fixed startup path runs.
2. **Verify auto-inject in IDE-internal session.** Check the project's `.claude/settings.json` has `mcpServers.ouroboros` after IDE startup.
3. **Verify port reachable.** `curl http://127.0.0.1:<port>/sse` returns 200 (or appropriate SSE response).
4. **Verify in this Claude Code session.** A new turn after restart should show graph tools in the deferred tools list (`mcp__ouroboros__search_graph`, etc.).
5. **External terminal test.** Open a fresh terminal in `C:\Web App\Agent IDE` (or `cd` there), launch Claude Code, ask it a question that should reach for `search_graph` (e.g., "find all callers of `injectIntoProjectSettings`"). Observe whether it actually does so. If using stdio transport, the spawn should produce a `node <stdioPath>` child process.
6. **Live workflow test (orchestrator).** Run two or three real workflows that benefit from graph tools (e.g., "what depends on `getGraphController()`?", "trace from `main.ts` to `windowManager`"). Note whether the agent reaches for the tools, what tools it picks, and whether the responses are useful.

### Output

- `roadmap/wave-53d-live-test.md` (~120 lines) — observations from the live test. What worked, what didn't, what tool the agent picked, whether responses were useful. This is qualitative; honest > polished.

### Acceptance

- [ ] Auto-inject works after restart.
- [ ] Port is reachable.
- [ ] At least one of the two test contexts (IDE-internal / external terminal) shows graph tools in agent tool list.
- [ ] Live test observations recorded.
- [ ] Commit: `docs(wave-53d): Phase D — live tool exercise + adoption observations`

---

## Phase E — Wrap-up + Wave 54 decision

**Goal:** Wave-level review, full gates, wave-54-status decision, push.

### Tasks

- Full vitest suite (`timeout 480 npx vitest run`) — must be green. (Or skip per user direction; pre-push hook validates.)
- `npm run lint` — zero errors.
- Both typechecks — clean.
- Orchestrator review of cumulative wave diff (Phases A + B's docs + C's fix + D's docs).
- **Wave 54 decision section in result brief**: based on Phase D's adoption observations, does Wave 54 (TS semantic operations) ship next, get redesigned, or stay paused?
- Result brief at `roadmap/auto-briefs/wave-53d-result.md`.
- ADR finalize at `roadmap/decisions/wave-53d.md`.
- `roadmap/wave-54-plan.md` status update — flip from "BLOCKED on Wave 53d" to either "Greenlit" / "Redesigned" / "Retired" per Phase D's findings.
- Memory update: replace or augment `project_graph_tool_adoption_gap.md` with the resolution.
- `package.json` version bump to v2.7.3.
- Release commit + tag + push.

### Acceptance

- [ ] All gates clean (or pre-push hook clears).
- [ ] Result brief captures Phase D's observations and the Wave 54 verdict.
- [ ] ADR finalized.
- [ ] Plan status flipped to ✅ COMPLETED.
- [ ] Pushed with tag v2.7.3.

---

## Subagent execution model

- Phase A: orchestrator (small docs change).
- Phase B: `sonnet-diagnostician` (read-only investigation).
- Phase C: `sonnet-implementer` (cross-file fix).
- Phase D: orchestrator (live test requires judgment + IDE state).
- Phase E: orchestrator.

All phase subagents skip the full test suite. Per-phase scoped lint + typecheck only.

---

## Risks

| Risk | Mitigation |
|---|---|
| Phase B can't determine root cause from code reading alone | Diagnostician is allowed to surface "needs runtime instrumentation" as an honest output. Phase C then becomes "add the instrumentation" before fix. |
| Phase C fix doesn't address adoption (agent still ignores tools even when wired) | Phase D measures qualitatively; result brief honestly reports if so. Wave 54 stays paused with a clearer reason ("agent ignores even when wired correctly" is a stronger statement than "tools never reach the agent"). |
| External terminal stdio transport is also broken | Phase D verifies both contexts; if external is broken, that's a separate sub-finding. Could expand Phase C scope or defer external to a follow-up. |
| Phase B reveals the issue is in Claude Code itself (the consumer), not the IDE (the producer) | Surface it explicitly in the result brief. Could fold into a separate upstream-issue follow-up. |
| Restart-the-IDE step in Phase D affects this Claude Code session | Plan ahead: take notes in roadmap docs before restart so context survives. Subjective observations are gathered in a fresh session post-restart. |

---

## Acceptance criteria (wave-level)

- [ ] Graph tools reliably reach IDE-internal sessions.
- [ ] Graph tools reliably reach external-terminal sessions (assuming IDE is running).
- [ ] Routing rule documents both tool surfaces accurately.
- [ ] Live test produces honest observations of adoption (positive, negative, or mixed).
- [ ] Wave 54 status is explicit (Greenlit / Redesigned / Retired) — no more "Paused, will figure out later".
- [ ] No regressions in existing internalMcp / codebaseGraph tests.

---

## Out-of-wave follow-ups

- **Standalone MCP server** ("Flavor B" — terminal works with IDE off). Wave-sized.
- **Adoption-rate telemetry** — emit a record per session counting graph-tool calls, so we can re-measure adoption durably without re-running corpus analysis. Small additive Phase to a future wave.
- **Better tool descriptions / surface visibility** — if Phase D shows the tools are wired but the agent still ignores them, the next lever is description quality and discoverability, not a new wave.
- **Version-drift cleanup** — separate from this wave; reconcile result-brief version numbers vs git tag history for waves 58, 59, 53b.