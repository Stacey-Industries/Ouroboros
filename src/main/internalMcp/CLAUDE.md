<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
The two-tier tool fallback in `getActiveTools()` is worth noting: it's a resilience pattern that keeps the MCP server useful even when the graph hasn't been indexed yet. The graph tools and context-layer tools overlap in purpose but differ in accuracy — graph tools know call relationships, context-layer tools know module metadata. They're not interchangeable, just substitutable for orientation queries.
`─────────────────────────────────────────────────`

Generated `src/main/internalMcp/CLAUDE.md`. Key things captured:

- **UNWIRED status** is front-and-center — this is the most important fact about the module
- The **two-tier tool fallback** logic in `getActiveTools()` (graph → context-layer)
- The **wiring recipe** for whoever eventually enables this (what to call, where, in what order)
- `validateModuleId`'s security role and its limits
- Why the files are split (`max-lines: 300` lint rule, not logical separation)
- The atomic write pattern in `internalMcpAutoInject.ts`
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# `src/main/internalMcp/` — Internal MCP Server (UNWIRED)

> **Status: Fully implemented, never started.** No callers exist in `main.ts` or any startup path. See `index.ts` `@deprecated` notice and the Known Issues / Tech Debt section of the root CLAUDE.md.

Designed to expose IDE tools to Claude Code sessions by running a local SSE MCP server on `localhost:<random port>` and auto-injecting its URL into `.claude/settings.json` as the `'ouroboros'` MCP server entry.

## File Map

| File | Role |
|------|------|
| `index.ts` | Public barrel — re-exports `startInternalMcpServer`, `injectIntoProjectSettings`, `removeFromProjectSettings`. Carries the `@deprecated UNWIRED` notice. |
| `internalMcpServer.ts` | HTTP server implementing the [MCP SSE transport](https://spec.modelcontextprotocol.io/specification/server/transports/#http-with-sse). Handles `GET /sse` (event stream), `POST /message` (JSON-RPC), and `POST /messages` (batch). |
| `internalMcpTools.ts` | Tool registry — `ALL_TOOLS` array + `getActiveTools()` / `findTool()`. Falls back to context-layer tools when the codebase graph is unavailable. |
| `internalMcpToolsGraph.ts` | Graph-aware tools: `get_architecture`, `get_codebase_context`, `search_symbols`, `get_symbol`, `trace_imports`, `detect_changes`. |
| `internalMcpToolsModules.ts` | Context-layer module tools: `search_modules`, `get_module`, `list_modules`, `get_module_files`. Also owns `validateModuleId`, `truncate`, and `MAX_RESPONSE_CHARS`. |
| `internalMcpToolsHelpers.ts` | Shared formatting helpers used by both tool files: `appendAiSection`, `appendSymbolsSection`, `appendDepsSection`, and graph/import formatters. |
| `internalMcpAutoInject.ts` | Reads/writes `.claude/settings.json` atomically — adds or removes the `mcpServers.ouroboros` entry with the live server URL. |
| `internalMcpTypes.ts` | Shared types: `InternalMcpServerOptions`, `InternalMcpServerHandle`, `McpToolDefinition`. |

## Tool Fallback Strategy

`getActiveTools()` in `internalMcpTools.ts` implements a two-tier fallback:

1. **Graph tools** (`../codebaseGraph/mcpToolHandlers`) — preferred when `graphController.getGraphToolContext()` returns a healthy context. Provides ~14 topology-aware tools.
2. **Context-layer tools** (`ALL_TOOLS` in this module) — fallback when the graph is unavailable. Uses `contextLayerStore` for module data.

This means the tool set exposed to Claude Code depends on whether the codebase graph has been built.

## Key Conventions

- **`McpToolDefinition.handler` signature**: `(args: Record<string, unknown>, workspaceRoot: string) => Promise<string>`. All tools return plain text (truncated to 8000 chars via `truncate()`).
- **`validateModuleId`**: Rejects `..`, absolute paths, and backslashes before any file access. All module-browsing tools must call this before using a user-supplied `moduleId`.
- **Atomic settings write**: `internalMcpAutoInject.ts` writes to a `.tmp` file then `fs.rename` — never partial-writes to the live `.claude/settings.json`.
- **SSE client tracking**: The server keeps a `Set<ServerResponse>` of connected SSE clients and broadcasts tool-result events to all of them. Clients are removed on `close`.

## Dependencies

- `../contextLayer/contextLayerStore` — `readModuleEntry`, `readRepoMap` (module context data)
- `../contextLayer/contextLayerController` — `getContextLayerController` (detect-changes tool)
- `../codebaseGraph/graphController` — `getGraphController` (tool fallback check)
- `../codebaseGraph/mcpToolHandlers` — `createGraphMcpTools` (preferred tool set)

## Gotchas

- **Never started**: Wiring this in requires calling `startInternalMcpServer({ workspaceRoot, port: 0 })` from `mainStartup.ts` and then `injectIntoProjectSettings(projectRoot, url)` with the returned port. The `removeFromProjectSettings` cleanup also needs a shutdown hook.
- **Port 0 = random**: `InternalMcpServerOptions.port` defaults to `0`, which lets the OS assign a free port. The actual port is returned in `InternalMcpServerHandle.port`.
- **`moduleId` path security**: `validateModuleId` is intentionally strict — it only blocks traversal at the input level. The tools still call into `contextLayerStore` which performs its own path resolution.
- **Tool implementations split for lint**: `internalMcpTools.ts` was split into `…Graph.ts` and `…Modules.ts` solely to stay under the ESLint `max-lines: 300` rule. The logical boundary is context-layer vs graph-backed tools.
