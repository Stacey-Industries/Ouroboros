# Wave 53h Result — MCP Compat: type Field + sessionId Routing

**Status:** ✅ COMPLETED — 2026-04-28 (code shipped; Phase B smoke pending user post-restart)
**Version:** v2.7.9 (patch)
**Plan:** `roadmap/wave-53h-plan.md`
**ADR:** `roadmap/decisions/wave-53h.md`

---

## What shipped

Two specific compatibility gaps with the official MCP TypeScript SDK's SSE transport, fixed.

### Gap 1: `.mcp.json` schema validation

After Wave 53g made `.mcp.json` the discovery file, the user's adoption smoke surfaced:

```
[Failed to parse] Project config (shared via .mcp.json)
└ [Error] mcpServers.ouroboros: Does not adhere to MCP server configuration schema
```

Working entries in `~/.claude.json mcpServers` (sentry, github, stripe, codebase-memory-mcp) all include a `type` field declaring the transport. Our auto-inject was writing entries without `type`. Schema validator rejects.

**Fix:** `internalMcpAutoInject.ts buildOuroborosEntry` now returns `{type: "sse", url: ...}` for URL entries and `{type: "stdio", command, args}` for stdio entries.

### Gap 2: SSE handshake missing sessionId routing

After manually patching `.mcp.json` to add `type: "sse"`, `claude mcp get ouroboros` discovered the server but reported `Status: ✗ Failed to connect`, and interactive sessions reported "needs authentication."

Research into the SDK's `SSEServerTransport` (the canonical reference implementation) confirmed:
- Endpoint URL must include `?sessionId=<UUID>` query parameter.
- JSON-RPC responses must come back via `event: message` on the SSE stream associated with that sessionId.
- POSTs are routed to their corresponding SSE stream by sessionId.

**Fix:** `internalMcpServer.ts`:
- Module-level `Map<sessionId, ServerResponse>` tracks open SSE streams.
- `handleSse` generates UUID per connection, registers it, writes `event: endpoint\ndata: /message?sessionId=<uuid>\n\n`. Cleanup on close.
- `handleJsonRpc` parses `sessionId` from URL query, dispatches RPC, pushes response as `event: message` on the matching SSE stream **and** returns it in the POST body (dual-write — backward compat with curl smokes).
- Router matches `/sse` and `/message` by path component (ignores query string).

### Why curl smokes worked but the SDK client didn't

Curl POSTs directly to `/message` and reads the response body. Our server returned the body correctly all along. The SDK client opens the SSE stream first, reads the endpoint URL, posts there, then waits for the response on the SSE stream — never sees a response on the stream because we didn't push it.

This is the layer Wave 53f fixed half of (endpoint event format) but missed the routing piece because the spec text wasn't explicit and the earlier research subagent's answer was incomplete. Wave 53h's research read the SDK source directly.

## Phase tally

| Phase | Files | Lines | Tests | Commit |
|---|---|---|---|---|
| A — Server sessionId + auto-inject type | 5 | +94 / -23 | 49/49 | `dfa21fa` |
| B — Adoption smoke (post-restart, user-driven) | n/a | n/a | n/a | (this commit) |
| C — Wrap-up | This brief, ADR, plan, version bump | — | — | (this commit) |

## Gates

| Gate | Result |
|---|---|
| `npm run lint` (touched files) | ✅ 0 errors |
| `npx tsc --noEmit -p tsconfig.node.json` | ✅ clean |
| Phase A scoped tests | ✅ 49/49 across 6 internalMcp test files |
| Full vitest suite | Skipped per user direction; pre-push hook validates |

## Manual smoke (Phase B — pending user post-restart)

Restart the IDE so the new server code runs, then in two parts:

### Part 1 — orchestrator-runnable post-restart

1. Confirm `.mcp.json` has `mcpServers.ouroboros = {type: "sse", url: "..."}` (with `type` field).
2. `claude mcp get ouroboros` should report the server with `Status: ✓ Connected` (not "Failed to parse" or "Failed to connect").
3. `curl -sS -N http://127.0.0.1:<port>/sse` first chunk should match `event: endpoint\ndata: /message?sessionId=<uuid>\n\n`.

### Part 2 — fresh Claude Code session (user)

1. `/mcp` lists `ouroboros` as Connected.
2. Ask "Use `trace_call_path` to find callers of `injectIntoProjectSettings`." Agent should reach for `mcp__ouroboros__trace_call_path` (or appropriate graph tool) with a real response.
3. Append observation to `roadmap/wave-53d-live-test.md` under "Wave 54 adoption smoke run #4".
4. Finalize Wave 53d's Decision 9 (Greenlit / Redesigned / Retired).

## Why this took 5 waves

| Wave | Real bug fixed | Why earlier waves didn't expose this |
|---|---|---|
| 53d | Auto-inject lifecycle wiped entries on shutdown | Bug existed but settings.json wasn't being read anyway |
| 53e | Graph context broken at runtime | Server tools reachable via curl, but no SDK client got that far |
| 53f | SSE handshake sent wrong-direction notification | Wave 53e's curl smoke didn't exercise the SSE handshake path |
| 53g | Auto-inject targeted wrong file (`.claude/settings.json`) | Earlier waves all wrote to that file; symptom was 0% adoption |
| 53h | Schema requires `type` field, SDK requires sessionId routing | Wave 53g made discovery work; the sessionId issue only surfaced once Claude Code actually tried to connect |

Each wave fixed a real bug. Each fix was masked by the next-layer issue. Wave 53h is the layer where the SDK reference is the canonical answer; matching it byte-for-byte should close the chain.

## Subagent observations

Orchestrator-direct (no subagent dispatch). Two PostToolUse hooks fired during execution — `post_edit_eslint` blocked once on unused-import (next edit consumed the import; expected interim state). Hooks earned their keep.

## Known limitations

- **Hand-rolled implementation drift risk.** Five waves of MCP-spec compat fixes argue for replacing with `@modelcontextprotocol/sdk SSEServerTransport`. Tracked as out-of-wave; revisit if 53h's smoke surfaces a sixth wire-format issue or proactively before next MCP spec change.
- **Adoption verification still pending** Phase B Part 2.
- **Status code is 200, not 202** on POST. Strict per-spec is 202; we keep 200 to preserve curl-smoke compat. If a future client refuses 200, switch to 202 + empty body.

## Out-of-wave follow-ups

- **Wave 54 verdict** — pending Phase B Part 2 observation.
- **SDK replacement** — `@modelcontextprotocol/sdk SSEServerTransport`. Could ship as a Wave 54 prerequisite or standalone.
- **Streamable HTTP transport (2025-03-26)** — the SDK client falls back to SSE, so 2024-11-05 is fine for now. Migration only if SDK drops the SSE fallback.
- **Wave 53c corpus re-analysis** with prefix-aware tool naming (`mcp__<server>__<tool>`) — still pending.

## Memory update

Updated `~/.claude/projects/C--Web-App-Agent-IDE/memory/project_graph_tool_adoption_gap.md` with the 53h findings and the SDK-reference-as-canonical-source insight.