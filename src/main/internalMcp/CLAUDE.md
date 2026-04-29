# `src/main/internalMcp/` — MCP entry injection (post-Wave-60)

> **Status: shrunken.** Pre-Wave-60 this directory ran an in-process HTTP+SSE MCP server, a stdio bridge, a port registry, a 14-tool registry, and a separate utility-process variant under `mcpHost/`. Wave 60 Phase E deleted all of that. The standalone MCP server lives at `src/standalone/ouroborosMcp/`; this directory now only writes the IDE-side injection that points Claude Code at it.

## File map

| File | Role |
|------|------|
| `index.ts` | Barrel — exports `injectIntoProjectSettings`, `removeFromProjectSettings`, `buildInjectOptions`. |
| `internalMcpAutoInject.ts` | Writes `<root>/.mcp.json mcpServers.ouroboros` and updates `~/.claude.json projects[<root>].enabledMcpjsonServers`. The entry is the standalone shape: `{type:'stdio', command: process.execPath, args: [<ouroborosMcp.js>], env: {ELECTRON_RUN_AS_NODE:'1'}}`. |
| `internalMcpScope.ts` | Pure decision logic for the `internalMcpScope` config (`always` / `task-gated` / `never`). Used by codemodeStartup and scopedMcpConfig. |
| `internalMcpTypes.ts` | Shared `McpToolDefinition` and `InternalMcpTransport` types. Consumed by `mcpToolHandlers.ts` and `ouroborosMcpServer.ts`. |

## What's no longer here (Wave 60 Phase E deletions)

- `internalMcpServer.ts` — HTTP+SSE server. No consumers; standalone replaces it.
- `internalMcpStdioTransport.ts` — stdio→SSE bridge. Was a workaround for the standalone we now have.
- `internalMcpPortRegistry.ts` — port file machinery. Standalone resolves DB path itself; no port.
- `internalMcpTools*.ts` — in-process tool registry. Standalone uses `codebaseGraph/mcpToolHandlers.ts` directly.
- `mcpHost/` directory — parallel utility-process MCP host. Same fate.

## Gotchas

- **`internalMcp.transport` config is vestigial.** Pre-Wave-60 it switched between SSE (URL entry) and stdio (bridge entry). The standalone has only one shape. The field is still accepted on config + `InjectOptions` for back-compat but ignored. Removed in a future cleanup wave.
- **`internalMcpEnabled: false` still honored** as a kill switch — main.ts skips injection when false; Claude Code sees no ouroboros server.
- **Path is `process.execPath`, not `'node'`.** The standalone uses `better-sqlite3` whose native binding is compiled for Electron's Node ABI; spawning under system Node fails module-load. `ELECTRON_RUN_AS_NODE=1` makes Electron run as a plain Node interpreter with the right ABI.
