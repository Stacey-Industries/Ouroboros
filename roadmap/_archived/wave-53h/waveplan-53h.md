# Wave 53h — MCP Compat: type Field + sessionId Routing
## Implementation Plan

**Status:** ✅ COMPLETED — 2026-04-28 · Released as v2.7.9 · Result: `roadmap/auto-briefs/wave-53h-result.md` · Phase B (adoption smoke) PENDING user post-restart
**Version target:** v2.7.9 (patch — SDK-compat for the SSE transport; no new feature surface)
**Dependencies:** Wave 53g made `.mcp.json` the discovery file. This wave makes the entries Claude Code writes to that file actually work end-to-end with the SDK's SSEClientTransport.

---

## Why this wave exists

Wave 53g shipped the discovery fix (write to `.mcp.json` not `.claude/settings.json`). Post-v2.7.8 smoke produced two new findings:

1. **Schema validation rejected the auto-inject's output:** `mcpServers.ouroboros: Does not adhere to MCP server configuration schema`. Inspection of working `~/.claude.json mcpServers` entries (sentry, github, stripe, codebase-memory-mcp) shows every one has a `type` field — `type: "sse"`, `type: "http"`, or `type: "stdio"`. Our auto-inject was writing entries without `type`. Required by the schema validator.

2. **After manually patching `.mcp.json` to add `type: "sse"`, `claude mcp get ouroboros` discovered the server** but reported `Status: ✗ Failed to connect`, and interactive sessions reported "needs authentication." Research into the official `@modelcontextprotocol/sdk` SSE transport revealed the SDK client expects `/message?sessionId=<uuid>` as the endpoint URL, with JSON-RPC responses delivered via `event: message` on the SSE stream associated with that sessionId. Our server sent `/message` (no sessionId) and responded only in the POST body.

The fix is what Wave 53f *should* have been if we'd read the SDK reference instead of the spec text.

---

## Scope

### In-scope (Phase A)

- `src/main/internalMcp/internalMcpAutoInject.ts buildOuroborosEntry` — add `type: "sse"` (URL entries) / `type: "stdio"` (stdio entries) to the JSON shape.
- `src/main/internalMcp/internalMcpServer.ts`:
  - Module-level `Map<sessionId, ServerResponse>` for SSE connection tracking.
  - `handleSse` generates a UUID per connection, registers it, writes `event: endpoint\ndata: /message?sessionId=<uuid>\n\n`, and unregisters on close.
  - `handleJsonRpc` parses `sessionId` from the request URL query, dispatches the RPC, pushes the response as `event: message` on the matching SSE stream **and** also returns the response in the POST body (dual-write — keeps backward compat with curl-based smokes).
  - Router matches `/sse` and `/message` by path component (ignoring query string).
- Tests updated: `internalMcpAutoInject.test.ts`, `internalMcpShutdownContract.test.ts`, `internalMcpServerSse.contract.test.ts`.

### Out-of-scope

- Replacing the hand-rolled implementation with the SDK's `SSEServerTransport` (Option B from the conversation). Future wave if 53h proves fragile.
- POST returning `202 Accepted` instead of `200` — strictly per-spec but breaks our curl smokes. Dual-write 200 is safer.
- Streamable HTTP (2025-03-26) migration. The SDK client falls back to SSE when Streamable HTTP fails, so 2024-11-05 SSE is still a valid target.

### Phase B — Smoke (PENDING USER)

After IDE restart, verify in two parts:

1. **Filesystem (orchestrator-runnable):** `.mcp.json` has `mcpServers.ouroboros = {type: "sse", url: "..."}`. `claude mcp get ouroboros` reports the server (not "Failed to parse").
2. **Fresh Claude Code session (user):** `/mcp` lists `ouroboros` as Connected (not "Failed to connect" / "Needs authentication"). Asking a graph-shaped question results in the agent reaching for an `mcp__ouroboros__*` tool with a real response.

If Phase B passes, Wave 54's verdict (Wave 53d Decision 9) is finalized as Greenlit / Redesigned / Retired based on adoption observation.

---

## Risks

| Risk | Mitigation |
|---|---|
| SDK requires the POST to return `202 Accepted` strictly, not `200 + body` | If Phase B fails on this, change the POST to return 202 with empty body. The dual-write SSE push is already in place. |
| `type` enum has values we don't know about | We use `'sse' \| 'http' \| 'stdio'` per observed working entries. If a future SDK requires a different transport name, surface in Phase B. |
| Hand-rolled implementation continues to drift from SDK behavior | Out-of-wave: replace with SDK's `SSEServerTransport`. Track as a follow-up if 53h's smoke surfaces issues. |
| Claude Code caches a failed connection state — restart insufficient to re-attempt | Closing and reopening the Claude Code session would clear in-memory state. Worst case, the user runs `claude mcp` interactively to re-validate. |

---

## Acceptance criteria

- [ ] `.mcp.json` written with `type: "sse"` (URL) or `type: "stdio"` (stdio) field.
- [ ] SSE handshake includes sessionId query param matching `/[0-9a-f-]{36}/`.
- [ ] POST `/message?sessionId=...` pushes response on the matching SSE stream.
- [ ] All existing internalMcp tests pass (49/49 pre-53h; 49/49 post-53h with assertion updates).
- [ ] No regressions in lint or typecheck.
- [ ] Phase B Part 1 (filesystem + `claude mcp get`) verified post-restart.
- [ ] Phase B Part 2 (fresh session smoke) recorded in `roadmap/wave-53d-live-test.md`.