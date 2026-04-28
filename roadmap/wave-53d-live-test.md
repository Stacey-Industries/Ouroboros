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
