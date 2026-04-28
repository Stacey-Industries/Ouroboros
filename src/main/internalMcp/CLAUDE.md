<!-- claude-md-auto:start -->

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# `src/main/internalMcp/` — Internal MCP Server

> **Status: Wired and active.** `main.ts` imports and calls `startInternalMcpServer` in the startup sequence, gated by `config.internalMcpEnabled` (default `true`).

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
| `internalMcpAutoInject.ts` | Reads/writes `.claude/settings.json` atomically — adds or removes the `mcpServers.ouroboros` entry. Transport-aware: writes `{url}` for SSE, `{command, args}` for stdio. |
| `internalMcpStdioTransport.ts` | Wave 51: standalone Node script Claude Code spawns when `transport === 'stdio'`. Forwards stdio JSON-RPC frames to `http://127.0.0.1:<port>/message`. |
| `internalMcpTypes.ts` | Shared types: `InternalMcpServerOptions`, `InternalMcpServerHandle`, `McpToolDefinition`, `InternalMcpTransport` (`'sse' \| 'stdio'`). |

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
- **Transport flag** (`internalMcp.transport`, default `'sse'`): switches the `mcpServers.ouroboros` entry shape between `{url}` (SSE) and `{command: 'node', args: [<stdio-transport-path>, port]}`. Both transports terminate at the same `/message` HTTP endpoint — stdio is a thin adapter, not a parallel implementation.
- **CodeMode routing path**: when `codemode.enabled && codemode.routeInternalMcp && transport === 'stdio'`, `scopedMcpConfig.ts` omits `ouroboros` from the per-spawn config; the agent's CodeMode proxy exposes the graph tools as `servers.ouroboros.*` inside `execute_code` instead. See `src/main/orchestration/providers/internalMcpRoutingPolicy.ts`.

## Dependencies

- `../contextLayer/contextLayerStore` — `readModuleEntry`, `readRepoMap` (module context data)
- `../contextLayer/contextLayerController` — `getContextLayerController` (detect-changes tool)
- `../codebaseGraph/graphController` — `getGraphController` (tool fallback check)
- `../codebaseGraph/mcpToolHandlers` — `createGraphMcpTools` (preferred tool set)

## Gotchas

- **Port 0 = random**: `InternalMcpServerOptions.port` defaults to `0`, which lets the OS assign a free port. The actual port is returned in `InternalMcpServerHandle.port`.
- **`moduleId` path security**: `validateModuleId` is intentionally strict — it only blocks traversal at the input level. The tools still call into `contextLayerStore` which performs its own path resolution.
- **Tool implementations split for lint**: `internalMcpTools.ts` was split into `…Graph.ts` and `…Modules.ts` solely to stay under the ESLint `max-lines: 300` rule. The logical boundary is context-layer vs graph-backed tools.
