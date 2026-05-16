# Wave 53i — Architecture Decision Record

**Status:** Decisions 1–4 resolved at Phase A close. Decisions to be added during execution as the SDK API surface forces specific calls.

This wave is a refactor: replace hand-rolled MCP server with `@modelcontextprotocol/sdk`. Most decisions are tactical (which transport class, how to adapt our tool definitions to the SDK's surface). The big-shape decision is "do this at all" — captured in Decision 1 below.

---

## Decision 1: Adopt the SDK rather than continue hand-rolling

**Context:** Six waves of MCP-spec compat fixes (53d–53h) for our hand-rolled server. Each fix matched what the SDK already does. Wave 53h's fix is essentially a partial reproduction of `SSEServerTransport`. Continuing to hand-roll means:
- Each new MCP spec evolution is another wave of catch-up.
- Subtle SDK-implementation details (sessionId routing, body-vs-stream response, schema validation) are easy to miss.
- Bug surface is wider than necessary.

**Pick:** Adopt the SDK as a runtime dependency. Replace hand-rolled transport with `SSEServerTransport`. Keep our HTTP server scaffolding (Node `http.createServer`) and tool registry — just delegate the wire format to the SDK.

**Rationale:** The SDK is the canonical reference implementation. Tracking it via dependency graph is cheaper and more durable than tracking it via diff-driven hand-roll. The cost (a runtime dependency with several transitive packages — express/hono/cors/etc.) is acceptable for a main-process IDE; bundle size constraints don't apply the way they do for renderer code.

**Consequences:**
- Future MCP spec changes ride in via `npm update @modelcontextprotocol/sdk` and a regression smoke, not a new wave.
- We accept the SDK's bundle weight in main-process distribution (electron-builder externalizes server-side deps; this just adds to that list).
- We give up control over the SSE wire format. If Anthropic ships an SDK change that breaks Claude Code, we're at their pace, not ours. Mitigated by pinning a specific SDK version and bumping deliberately.

---

## Decision 2: Stay on SSE transport, do NOT migrate to Streamable HTTP

**Context:** The SDK supports both `SSEServerTransport` (legacy 2024-11-05) and `StreamableHTTPServerTransport` (newer, single endpoint). Claude Code's client tries Streamable HTTP first and falls back to SSE. Either would work.

**Pick:** Stay on SSE for this wave.

**Rationale:** The current `.mcp.json` shape (`type: "sse"` + URL ending in `/sse`) is what Wave 53h's smoke verified working. Migrating to Streamable HTTP would change the URL, the type, the auto-inject output shape, and the Wave 51 stdio bridge's forwarding endpoint — broader scope without a strong "this fixes a problem we have today" justification. SSE works; ship the SDK adoption first, migrate transport later if needed.

**Consequences:**
- `.mcp.json` shape unchanged. Wave 51's stdio adapter unchanged.
- If SDK drops SSE support in a future major (it's marked "legacy" in places), we'd need a transport-migration wave. The dep pin protects against forced migration; the wave is filed as out-of-wave.

---

## Decision 3: Keep our `McpToolDefinition` registry; adapt at the boundary

**Context:** Our existing tools registry (`getActiveTools()` returns `McpToolDefinition[]` with `{name, description, inputSchema, handler}`). The SDK's `Server.setRequestHandler(ListToolsRequestSchema, ...)` and `setRequestHandler(CallToolRequestSchema, ...)` expect schemas as the request shape. Two options: (A) rewrite our tools to use the SDK's `McpServer.registerTool` directly, (B) keep our registry and adapt at the boundary (one `setRequestHandler(ListToolsRequestSchema, ...)` that maps from `getActiveTools()`, one `setRequestHandler(CallToolRequestSchema, ...)` that delegates to `findTool().handler`).

**Pick:** B — keep the registry, adapt at the boundary.

**Rationale:** Our tool registry has its own conventions: 14 tools across 4 files, each with a `handler(args, workspaceRoot)` signature, plus the two-tier fallback (graph-healthy → 14 tools, degraded → 6 fallback tools per `getActiveTools()`). Migrating each tool to `registerTool` directly would touch 4+ files and require restructuring the fallback logic. Adapting at the boundary preserves the existing registry and isolates SDK contact to `internalMcpServer.ts` only.

**Consequences:**
- `internalMcpServer.ts` grows a small adapter that converts `McpToolDefinition[]` to `ListToolsResponse` and routes `CallToolRequest` to `findTool().handler()`.
- Fallback logic (healthy graph → 14 tools, degraded → 6 fallback tools) stays in `getActiveTools()` unchanged.
- Tool input schemas stay as JSON Schema objects (our current convention). If the SDK requires Zod schemas internally, the adapter converts on the way in.

---

## Decision 4: Retire `internalMcpServerSse.contract.test.ts` from Wave 53f/53h

**Context:** The contract test asserts the exact SSE first-message format (`event: endpoint\ndata: /message?sessionId=<uuid>\n\n`). Post-53i, that format is produced by the SDK, not by us. Asserting against SDK-internal output is fragile (SDK could legitimately change format in a non-breaking minor) and tests upstream code.

**Pick:** Delete `internalMcpServerSse.contract.test.ts`. Replace with a lighter integration test (or no test) that asserts: starting the server produces a healthy `/sse` connection that can dispatch at least one tool call end-to-end.

**Rationale:** The wire format is the SDK's responsibility now. Our testing surface should be the boundaries we own — tool registration adapter, fallback selection, port allocation, lifecycle. SDK upstream tests cover the SSE handshake.

**Consequences:**
- One test file removed; the equivalent assertion (server can dispatch tool calls) is in the existing `internalMcp/` integration tests or in a new lightweight smoke. The "what we own" testing surface is stable — only "what the SDK owns" tests are dropping.