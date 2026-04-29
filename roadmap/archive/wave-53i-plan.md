# Wave 53i — Replace Hand-Rolled MCP Server With Official SDK
## Implementation Plan

**Status:** ✅ COMPLETED — 2026-04-28 · Released as v2.7.10 · Result: `roadmap/auto-briefs/wave-53i-result.md` · Phase B (post-restart smoke) PENDING user
**Version target:** v2.7.10 (patch — internal refactor; behavioural superset of pre-53i; no new feature surface)
**Dependencies:** Wave 53h (v2.7.9) shipped the last hand-rolled compat patch (sessionId routing). This wave retires the hand-rolled implementation in favor of `@modelcontextprotocol/sdk` v1.29.0.

---

## Why this wave exists

Six waves of MCP-spec compat fixes for our hand-rolled server (53d/53e/53f/53g/53h). Each fix matched what the official SDK does — just done by hand. Wave 53h's research read the SDK source directly, and the fix it shipped is a partial reproduction of `SSEServerTransport`. Wave 54's adoption smoke now passes, but the hand-rolled implementation is fragile against future MCP spec changes (Streamable HTTP graduating to default, schema additions, etc.).

The cure is to delete the hand-rolled server and use the SDK's `SSEServerTransport` (and/or `StreamableHTTPServerTransport`) directly. The SDK is the canonical reference; matching it via dependency graph is more durable than matching it via diff-driven hand-roll.

The lesson is now memorialized in `project_graph_tool_adoption_gap.md`: *"For Claude-Code-targeted MCP server work, treat `@modelcontextprotocol/sdk` source as canonical, not spec text. Curl-based smokes bypass discovery + SSE handshake layers real clients exercise."* This wave operationalizes that lesson.

---

## Goal

Replace `src/main/internalMcp/internalMcpServer.ts`'s hand-rolled HTTP+SSE implementation with the SDK's transport class. Preserve all current behavior:

- 14 graph-aware tools registered (same names, same handlers).
- SSE endpoint at `/sse`, message endpoint at `/message`, `.mcp.json shape unchanged` (`type: "sse"` + URL).
- Wave 51 stdio bridge (`internalMcpStdioTransport.ts`) continues to work — it forwards to the same `/message` endpoint the SDK transport exposes.
- All existing internalMcp tests pass after assertion updates (or get retired if they're testing what's now SDK-internal).

Out of scope: migration to the newer Streamable HTTP transport (single `/mcp` endpoint). The SDK supports both; SSE keeps the change small and preserves the wire format Claude Code's client successfully connects to (per Wave 53h smoke). Streamable HTTP migration filed as a future follow-up.

---

## Scope

### In-scope (Phase A)

- Install `@modelcontextprotocol/sdk@1.29.0` as a runtime dependency in `package.json`.
- Rewrite `src/main/internalMcp/internalMcpServer.ts`:
  - Import `Server` (or `McpServer`) from the SDK and `SSEServerTransport` from the SDK's SSE transport module.
  - Register each tool from `getActiveTools()` via the SDK's tool-registration API (likely `Server.setRequestHandler` for `ListToolsRequestSchema` and `CallToolRequestSchema`, or `McpServer.registerTool` if that's the higher-level API).
  - Use the SDK transport for the actual HTTP+SSE wire format. Keep the surrounding HTTP server scaffolding (Node `http.createServer`) so the rest of the lifecycle (port allocation, listen, stop) is unchanged.
  - Track sessions per the SDK's lifecycle (transport instances per connection, `transport.close()` in `req.on('close')`).
- Retire `internalMcpServerSse.contract.test.ts` if it's now testing SDK-internal behavior. Replace with an integration smoke that asserts a `/sse` connection produces a usable JSON-RPC channel — but stay light; the SDK has its own test suite upstream.
- Update `internalMcpAutoInject.ts` only if the SDK's transport requires a different URL path or shape. (Default expectation: no auto-inject change needed.)

### Out-of-scope

- Streamable HTTP transport (`type: "http"` in `.mcp.json`, single `/mcp` endpoint). Filed as a separate future wave if and when Claude Code drops SSE fallback.
- Removing `internalMcpStdioTransport.ts` (Wave 51's stdio adapter). It forwards to the same `/message` endpoint our SDK-backed server will expose.
- Refactoring `internalMcpTools.ts` or the graph tool registry. Tool definitions (`McpToolDefinition`) feed into the SDK's request handler; no change to the tool surface itself.
- Bundle-size optimization. The SDK pulls in express/hono/cors/etc. — those are dev-time costs we accept for the canonical implementation.

### Phase B — Smoke (post-restart)

After IDE restart:
1. **Filesystem (orchestrator):** `.mcp.json` unchanged (still `{type: "sse", url: ".../sse"}`). `claude mcp get ouroboros` reports `Status: ✓ Connected`.
2. **JSON-RPC smoke (orchestrator via curl):** GET `/sse` returns the SDK's endpoint event format. POST `/message?sessionId=...` with `tools/list` returns the 14 tools. POST `/message?sessionId=...` with `tools/call` for `search_graph` returns real graph data (same behavior as Wave 53h smoke).
3. **Fresh Claude Code session (user):** Same prompt as Wave 54 smoke #4 ("Use trace_call_path to find callers of injectIntoProjectSettings"). Agent should still call the tool successfully — same UX, more durable implementation underneath.

---

## Risks

| Risk | Mitigation |
|---|---|
| SDK API differs from research-extracted shape | Verify imports immediately after install via TypeScript compiler; iterate on actual exports. |
| Bundle size grows significantly (`express`, `hono`, `cors` are SDK deps) | Accepted cost — main-process bundle is not size-constrained the way renderer is. If electron-builder fails, externalize SDK deps. |
| Existing `internalMcpStdioTransport.ts` (Wave 51) breaks | The stdio transport forwards stdio JSON-RPC frames to `http://localhost:PORT/message` — same endpoint shape. Should work unchanged. Phase B verifies. |
| SDK requires `tools/list` and `tools/call` to use Zod schemas instead of raw JSON Schema | Adapter layer: convert our existing `McpToolDefinition.inputSchema` (JSON Schema object) to whatever the SDK accepts. Light shim if needed. |
| Tests need substantial rewrites | `internalMcpServerSse.contract.test.ts` (sessionId regex) tests SDK-internal behavior — drop it. Other tests (`internalMcpAutoInject.test.ts`, etc.) test our wrapper layer and stay valid. |
| First-time SDK errors are obscure | Phase A's verification includes a manual smoke (curl against the SDK-backed server) before declaring complete. |

---

## Acceptance criteria

- [ ] `@modelcontextprotocol/sdk@^1.29.0` in package.json dependencies.
- [ ] `internalMcpServer.ts` imports from the SDK; no hand-rolled SSE/JSON-RPC dispatch.
- [ ] All 14 graph-aware tools register and respond correctly via SDK transport.
- [ ] Existing `internalMcp/` tests pass (after assertion updates / retirement of now-irrelevant tests).
- [ ] Lint clean. Typecheck clean.
- [ ] Phase B Part 1 (curl JSON-RPC smoke) confirms tools work post-restart.
- [ ] Phase B Part 2 (fresh Claude Code session) confirms agent UX unchanged.

---

## Out-of-wave follow-ups

- **Streamable HTTP transport migration** — if Claude Code drops SSE fallback or if a future MCP spec evolution makes SSE costly to maintain.
- **Bundle externalization** — confirm electron-builder doesn't choke on SDK deps; if it does, externalize them like other native deps.
- **Wave 53c corpus re-analysis with prefix-aware tool names** — still pending; not blocked by this wave.