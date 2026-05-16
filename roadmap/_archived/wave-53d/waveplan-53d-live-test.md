# Wave 53d — Phase D: Live Tool Exercise & Adoption Observations

**Date:** 2026-04-28
**Status:** Partial. Pre-restart verification captured below; live exercise deferred to user-driven post-restart smoke (see "Manual verification checklist" at the bottom).

---

## Why this is partial

The Phase C fix lands in the running IDE only after relaunch. The IDE was not running at the time of this report (confirmed via `tasklist | grep -iE 'electron|ouroboros'` returning empty). Restarting the IDE is the user's call — it ends any active sessions inside it, including the orchestrating Claude Code session that wrote this report. Therefore:

- **Pre-restart state** is captured below as evidence the bug exists.
- **Post-restart verification** is a checklist the user runs on next launch.
- **Live workflow observations** happen in a fresh session post-restart and get appended to this file (or its successor).

This is honest scope: Phase D was always going to be partly manual (per Decision 5 in the ADR — "live test in Phase D is qualitative, not metric-driven"). The qualitative observation can't happen until the fix is live.

---

## Pre-restart state (evidence the bug exists)

### `.claude/settings.json` contents

```
keys: ['hooks']
mcpServers present: False
```

Only the `hooks` block is present. No `mcpServers` entry. This matches the Phase B diagnostic's prediction: between IDE launches, `mcpServers.ouroboros` is absent because `stopInternalMcp` cleaned it on the last shutdown.

### Process state

`tasklist | grep -iE 'electron|ouroboros'` returned no matches. The IDE is not running. (The orchestrating Claude Code session writing this report is therefore an external terminal session in the project directory, which by Phase B's analysis would not have access to graph tools regardless — settings.json has no entry to read, and even if it did, the SSE server isn't running.)

### Port state

`netstat -ano | grep LISTENING` showed Windows RPC-range ports (49664–49677) and a few other unrelated listeners. No high-numbered random port that would correspond to the IDE's MCP server. Consistent with "IDE not running."

---

## Live smoke results (2026-04-28, post-restart)

**Method:** orchestrator ran the smoke checklist directly via curl + JSON-RPC against the live MCP server, since this Claude Code session's tool list was frozen pre-fix and could not be refreshed mid-session.

### What works ✅

1. **`.claude/settings.json` has the auto-inject entry.** Confirmed: `mcpServers.ouroboros = {"url": "http://127.0.0.1:62683/sse"}`. Wave 53d's lifecycle fix is doing its job — the entry stays after IDE shutdown and the new launch upserted with the new random port (62683).
2. **Server is reachable.** `GET http://127.0.0.1:62683/sse` returns HTTP 200 (streaming, expectedly times out at 3s — that's an SSE long-poll, not a failure).
3. **Tools are registered and enumerable.** `POST /message` with `tools/list` returns 14 graph-aware tools, exactly matching the healthy-graph surface from `src/main/codebaseGraph/mcpToolHandlers.ts`:
   - `index_repository`, `list_projects`, `delete_project`, `index_status`, `get_graph_schema`, `ingest_traces` (admin)
   - `search_graph`, `get_architecture`, `search_code`, `get_code_snippet` (search)
   - `trace_call_path`, `detect_changes`, `query_graph`, `manage_adr` (query)
4. **The routing rule names match reality** for the healthy-graph case. (Wave 53d Phase A's documentation update was correct.)

### What's broken ❌ — new bug surfaced by the smoke

**Every single tool errors at runtime** with the same shape:

| Tool | Error |
|---|---|
| `index_status` | `Cannot read properties of undefined (reading 'getProject')` |
| `list_projects` | `Cannot read properties of undefined (reading 'listProjects')` |
| `get_graph_schema` | `Cannot read properties of undefined (reading 'getGraphSchema')` |
| `get_architecture` | `Cannot read properties of undefined (reading 'getArchitecture')` |
| `search_graph` | `Cannot read properties of undefined (reading 'searchNodes')` |
| `detect_changes` | `Cannot read properties of undefined (reading 'detectChanges')` |

The pattern is unambiguous: handler closures captured a **broken `GraphToolContext` at tool-registration time**. The `context` object exists (otherwise we'd see a different error shape), but its inner service references — `queryEngine`, `cypherEngine`, the graph controller methods — are undefined at the moment they're called.

This is consistent with a startup-order race: the internalMcp server registers tools (calling `getActiveTools()` → which calls `getGraphToolContext()`) **before** the graph controller has finished initializing. Per the IDE log, `[system2] controller initialized for Agent IDE` fired at `15:51:38.939`, ~1 second into startup. If the MCP server's tool registration happened earlier in that second, the context it captured was a stub that never got filled in.

A simpler hypothesis: `getGraphToolContext()` was returning a partially-initialized object (truthy enough to choose the graph path over the fallback path, but missing the actual service references), so registration picked the graph tools but the closures were broken from the start.

**This is a separate bug from Wave 53d's auto-inject fix.** Wave 53d closed the file-injection lifecycle hole. This new bug is in the runtime handler wiring — the tools reach agents but every call returns an error.

### Implication for adoption

Even with Wave 53d's wiring repaired, **agents calling these tools get nothing back but errors**. That fully explains the corpus's 0% adoption: the agent likely tried these tools at least occasionally over the corpus window, got errors, and learned to default to Grep/Read. Or the per-spawn `--mcp-config` path that Phase B flagged as "intact" was actually feeding broken tools the whole time.

Either way, this is a downstream wiring bug that has to be fixed before any meaningful adoption measurement is possible.

### Adoption observations

Skipped — there's nothing to observe at the agent level until the runtime errors are fixed. Once the graph context is wired correctly, repeat the smoke from a fresh Claude Code session and ask it to run `trace_call_path` against a real symbol.

## Wave 53e post-fix smoke (2026-04-28)

After v2.7.6's fix landed and the IDE was restarted, the orchestrator re-ran the four-tool smoke against the new server (port 61526). All four tools returned real content:

| Tool | Result |
|---|---|
| `list_projects` (no args) | `Agent IDE: 0 nodes, 0 edges (indexed 2026-04-20T01:50:26.988Z)` |
| `get_graph_schema` (no args) | Full schema — 11,113 Functions / 2,614 Files / 2,821 Interfaces / 728 Methods / 119 Folders / 876 Types / 12 Routes / 1 Project. Edge types: ASYNC_CALLS 1,110 / CALLS 11,610 / CONTAINS_FILE 2,614 / CONTAINS_FOLDER 119 / DEFINES 15,580 / DEFINES_METHOD 599 / HANDLES 4 / IMPORTS 7,540. |
| `search_graph` `{"query":"injectIntoProjectSettings"}` | "Found 18,442 nodes (showing 100): ..." — returns real nodes with qualified names and file paths. |
| `get_architecture` `{"aspects":["hotspots"]}` | Real hotspots with degree counts and `file:line` locations: `now (degree: 362) -- src/main/agentChat/threadImport.ts:26`, `delete (degree: 229) -- src/main/agentChat/checkpointStore.ts:118`, etc. |

**Conclusion:** The graph-context wiring fix in Wave 53e (commit `74d9633`) is verified end-to-end. Tools work; agents that connect to the MCP server now receive real responses instead of `Cannot read properties of undefined`.

### Out-of-wave observation from this smoke

`list_projects` reported `0 nodes, 0 edges` from a stored timestamp of 2026-04-20, but `get_graph_schema` (called moments later, same server) reported 11K+ functions live. The project-table's `node_count` / `edge_count` columns are not being updated on incremental reindex — only on full re-index. Cosmetic for now (real query results are correct), but worth filing as a small follow-up: refresh project-table stats at the end of each indexing pass, or compute them lazily from the live counts.

## Wave 54 adoption smoke run #4 (2026-04-28, post-v2.7.9) — GREENLIT

**Setup verified before agent test (orchestrator-runnable):**
- `.mcp.json` correct shape with `type: "sse"` field.
- `claude mcp get ouroboros` reports `Status: ✓ Connected`.
- SSE first chunk: `event: endpoint\ndata: /message?sessionId=b8d1b448-232c-401a-8a71-9659d1d01ab8`.

**Agent test (fresh Claude Code session, IDE chat panel):**

Prompt: *"Use trace_call_path to find all callers of injectIntoProjectSettings in this codebase."*

Response (paraphrased):
> Called ouroboros [tool use]
>
> injectIntoProjectSettings is defined at `src/main/internalMcp/internalMcpAutoInject.ts:71` and has one caller:
> - `startInternalMcp` at `src/main/main.ts:126`

**Observations:**
- ✅ Agent saw `mcp__ouroboros__trace_call_path` in its tool list.
- ✅ Reached for it directly without falling back to Grep.
- ✅ Got real graph-edge data, not text matches.
- ✅ The result is **more precise than Grep would have produced**. Earlier smoke #2 (pre-v2.7.9, Grep fallback) found 2 production callers + 4 test callers — Grep counted test-file imports as callers. This run correctly identifies the single function-level call edge from `startInternalMcp`. That's the value: graph filters out comments, docstrings, and test imports.
- ⚠️ One tradeoff: the graph reports function-level edges, not per-call-site references. `injectIntoProjectSettings` is invoked from two distinct lines inside `startInternalMcp` (the `useMcpHost` branch and the standard SSE path). Both collapse into one caller at the graph level. For most "who calls this" questions, function-level is right; for surgery-grade refactors, per-call-site fidelity might still want a Grep follow-up.

**Verdict for Wave 53d Decision 9: GREENLIT.**

## Wave 53i regression smoke (2026-04-28, post-v2.7.10)

After replacing the hand-rolled MCP server with `@modelcontextprotocol/sdk` (Wave 53i), re-ran the same prompt: *"Use trace_call_path to find all callers of injectIntoProjectSettings."*

Same response shape as Wave 53h's smoke — agent called `mcp__ouroboros__trace_call_path`, returned the same graph result. **No behavior regression.** Six waves of hand-rolled compat fixes successfully retired in favor of the SDK; agent UX unchanged.

This is the durable end-state: future MCP spec changes ride in via `npm update @modelcontextprotocol/sdk`, not a new wave.

The wiring works end-to-end. The agent uses the tool when available. The response is useful and arguably better than the Grep alternative. Wave 54 (TS semantic operations) can proceed per its plan.

The original Wave 54 plan also specified Phase A+B (read-only ops) before Phase D (mutations); given the corpus's low Edit-failure rate, that internal staging still applies. But the wave is **no longer paused** on any prerequisite — the discovery / runtime / handshake / sessionId chain is closed.

The runtime is now functional. The remaining question is **does the agent reach for these tools when they're available?** That requires a fresh Claude Code session post-restart (this orchestrating session's tool list was frozen pre-fix). The user can verify by:

1. Opening a fresh Claude Code session inside the IDE chat panel or external terminal in `C:\Web App\Agent IDE`.
2. Asking a graph-shaped question, e.g., "Use `trace_call_path` to find callers of `injectIntoProjectSettings` in this codebase."
3. Observing whether the agent (a) sees the tool, (b) reaches for it, (c) gets useful results.

Append observations here, then finalize Wave 53d's Decision 9 with the Wave 54 verdict (Greenlit / Redesigned / Retired).

## Wave 54 adoption smoke run (2026-04-28, post-v2.7.6)

User asked a fresh Claude Code session: *"Use `trace_call_path` to find all callers of `injectIntoProjectSettings` in this codebase."*

**The agent reported neither the healthy 14-tool surface nor the degraded 6-tool fallback was loaded in its tool list.** ToolSearch returned no matches for `trace_call_path` either. The agent correctly fell back to Grep per the routing rule's "if neither surface is available, the rule is inert" guidance, found the 2 production callers + 4 test callers, and **voluntarily surfaced the adoption-gap finding back to the orchestrator** in its response.

### Strong positives at the agent-behavior layer

- **Tool-availability detection works.** The agent checked its tool list and correctly identified the missing surface before attempting any call.
- **Rule-driven fallback works.** With both surfaces missing, the agent picked Grep — not Glob, not Read — and got correct results.
- **Self-aware reporting works.** Without prompting, the agent flagged the broader adoption-gap implication for Wave 53d/53e.

### Negative finding — third bug layer (server-side spec compliance)

The Wave 53e fix landed end-to-end at the *server* layer (curl JSON-RPC verification, all 4 representative tools return real content), but a fresh Claude Code session does NOT register the tools in its tool list. Investigation of `src/main/internalMcp/internalMcpServer.ts` reveals two MCP-spec violations in the SSE handler:

1. **Wrong-direction notification.** The server's SSE handler at line 52–53 writes `data: {"jsonrpc":"2.0","method":"notifications/initialized"}\n\n` immediately on connection. Per MCP spec (any version including 2024-11-05), `notifications/initialized` is a *client→server* notification, not server→client. Strict clients reject it as a protocol violation.

2. **Missing endpoint event.** Under the 2024-11-05 HTTP+SSE transport (which the server advertises via `protocolVersion: '2024-11-05'` in its `initialize` response), the SSE stream's first message must be `event: endpoint\ndata: <postUrl>\n\n` — that's how the client discovers the POST endpoint. The server skips this entirely.

Both bugs together explain why curl works (curl uses the POST endpoint directly, doesn't depend on SSE handshake) but Claude Code does not (Claude Code's MCP client follows the SSE handshake and bails when it doesn't get an `endpoint` event AND receives a malformed `notifications/initialized` it didn't expect).

### Verdict

**Wave 54 cannot be greenlit yet** — adoption can't be evaluated when tools never reach agent sessions. But the agent-behavior signal is positive enough that the verdict is *not* Retired either. Wave 54 stays **PAUSED on Wave 53f** (server-side SSE handshake fix). Once Wave 53f ships and tools register in fresh sessions, this smoke can be re-run to actually evaluate adoption.

Estimated Wave 53f scope: ~5 lines in `internalMcpServer.ts` plus a contract test that asserts the SSE response shape matches the 2024-11-05 spec. Sub-wave-sized; could ship as a small follow-up.

## What changes after restart

The Phase C fix removes the `removeFromProjectSettings` call from `stopInternalMcp` (commit `ef80784`). On next IDE launch, `startInternalMcp` runs as before — it binds the SSE server on a random port and writes `mcpServers.ouroboros` into `.claude/settings.json` with that port. The difference is that on subsequent shutdowns, the entry is no longer cleaned. So:

- **First launch after fix:** entry written; IDE runs; entry stays after shutdown.
- **External terminal launched while IDE is up:** sees the entry, connects, gets tools.
- **External terminal launched after IDE has shut down:** sees the entry, attempts connection, fails (server is gone). The entry is stale but harmless; next IDE launch overwrites with current port.
- **Next IDE launch:** entry overwritten with new random port; live again.

---

## Manual verification checklist (post-restart)

The user runs these on next IDE launch. Tick the boxes; if any fail, capture the failure mode in this doc and re-open Phase C.

### Inside the IDE

- [ ] Launch the IDE.
- [ ] Read `C:\Web App\Agent IDE\.claude\settings.json`. Confirm a `mcpServers.ouroboros` block is present. The shape will be either `{ url: "http://127.0.0.1:<port>/sse" }` (default SSE) or `{ command: "node", args: [<stdioPath>, <port>] }` (if `internalMcp.transport` was set to `'stdio'`).
- [ ] If SSE: `curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:<port>/sse` (substitute the actual port from settings.json). Should return either 200 or a streaming-style response — anything other than connection-refused proves the server is reachable.
- [ ] Open a fresh Claude Code session inside the IDE (via the chat panel or by spawning a new terminal). Ask: "What tools starting with `mcp__ouroboros__` are available?" If the answer lists `search_graph`, `trace_call_path`, `query_graph`, `get_architecture`, `detect_changes`, `get_code_snippet` (or the degraded-fallback equivalents — see `~/.claude/rules/graph-tool-routing.md`), the wiring is healthy.

### Outside the IDE (external terminal — Flavor A)

- [ ] Open a fresh terminal in `C:\Web App\Agent IDE` while the IDE is still running.
- [ ] Launch Claude Code there: `claude` (or whatever the user's launcher invocation is).
- [ ] Ask the same "What tools starting with `mcp__ouroboros__` are available?" question. Tools should appear.
- [ ] Try a real graph query: "Find all callers of `injectIntoProjectSettings` using `trace_call_path`." Observe whether Claude reaches for the tool. Record the verdict in this file.

### Adoption observations

After running 2–3 real graph-tool-shaped workflows, append a section here noting:
- Did the agent reach for graph tools when they were available, or did it default to Grep?
- If it did reach for them, were the responses useful?
- Were there any tool-name surprises (e.g., agent asked for a tool that doesn't exist; agent picked a worse tool when a better one was available)?

This becomes input to Phase E's Wave 54 verdict.

---

## What can be observed without restart

The fix's correctness is verified by the regression test added in Phase C:
- `src/main/internalMcp/internalMcpShutdownContract.test.ts` — 3 cases, all green.

This test catches any future regression where someone re-adds `removeFromProjectSettings` to the shutdown path. It does not, however, prove agent-level adoption — that requires the post-restart checklist above.

## Surprises during Phase B/C that affect Phase D framing

The Phase B diagnostic surfaced one item the orchestrator wants to flag for Phase E:

> "There are two separate injection systems — startup file injection (broken) and per-spawn `--mcp-config` injection (intact, but only for IDE-orchestrated spawns). External terminal Claude Code sessions have never been getting the tools via either path."

If the second injection system (`--mcp-config` per-spawn) is intact for IDE-orchestrated spawns, then IDE-internal Claude Code sessions launched via the orchestrator *should* have had graph tools all along — yet the corpus shows 0% adoption across all 369 sessions, including sessions that are likely IDE-internal. Two possibilities:

1. The per-spawn `--mcp-config` path is also broken in some way Phase B didn't fully characterize.
2. IDE-internal sessions did get tools via `--mcp-config`, but the agent simply ignored them (because the routing rule was inert without the file-injection path also being live, or because tool descriptions don't pull the agent toward them).

If (1), Phase E discovers a second bug — a follow-up sub-wave is warranted. If (2), Phase E's verdict on Wave 54 is "tools reach the agent, but the agent doesn't use them" — which would be a stronger No-Go signal than the current "wiring is broken." Either outcome is informative.

The post-restart checklist will distinguish these. Specifically: if a fresh IDE-internal session shows tools but the agent still doesn't reach for them on graph-shaped queries, that's signal (2). If the tools don't appear at all in the IDE-internal session despite the file-injection path being fixed, that's signal (1).
