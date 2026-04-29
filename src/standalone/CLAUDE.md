# `src/standalone/` — Standalone Node binaries

> **Wave 60 — work in progress.** This directory exists for binaries that must run outside Electron (e.g. invoked by Claude Code from a terminal session when the IDE is off). Source here MUST NOT import from `electron` or any module that transitively does.

## Subsystem map

| Path | Role |
|------|------|
| `ouroborosMcp/` | Read-only MCP server exposing the codebase graph via stdio. Spawned by Claude Code; reads the same SQLite DB the IDE writes to. See `ouroborosMcp/CLAUDE.md` (TBD) for module-level details. |

## Architectural rule — keep this clean

The whole reason this directory exists separately from `src/main/` is that Electron's runtime (`app`, `BrowserWindow`, IPC channels) is not available in standalone Node. Any import that transitively pulls in Electron will fail at module-load time when run outside the IDE.

When adding code here:

- Only import from other files in `src/standalone/`, the SDK packages (`@modelcontextprotocol/sdk`, `better-sqlite3`), and node stdlib.
- It IS okay to import constants and pure helpers from `src/main/` if those files have no Electron imports themselves AND no transitive Electron imports through their own dependencies. Verify with `grep -r "from 'electron'" <file-and-its-imports>`.
- The `mcpToolHandlers.ts` chain in `src/main/codebaseGraph/` LOOKS clean but isn't — `queryEngineSupport.ts` imports `ipc-handlers/gitOperations`, which transitively pulls Electron. This is the Phase B refactor target.

## Build

`electron.vite.config.ts` adds `ouroborosMcp` to the main build's `input` map. Compiled output lands at `out/main/ouroborosMcp.js` alongside the IDE's other bundled scripts. The IDE installer ships this file; the IDE's MCP injection points Claude Code's `mcpServers.ouroboros` at it (Wave 60 Phase B).

## Native bindings

`better-sqlite3` is a native module. The IDE's `node_modules` copy is compiled against Electron's Node ABI; the standalone needs Node-ABI bindings. Phase 0 surfaced this; Phase A defers the resolution; Phase B picks one of:

- Dual-compile at build time (electron-builder pattern).
- Bundle Node-ABI prebuilds alongside the script.
- Fall back to `sql.js` (pure-JS SQLite) if native paths prove painful.

## Phase status

- **Phase A (current):** scaffolding + minimal handler set (`get_graph_schema`, `search_graph`) written directly against `better-sqlite3`. Coexists with the IDE's existing internal MCP — does not yet replace anything.
- **Phase B:** refactor the IDE-side handler chain (`queryEngineSupport.ts`) to remove Electron coupling, then plug the full 14-tool surface into `ouroborosMcpServer.ts` via the existing `filterReadOnlyTools` seam.
- **Phase C:** switch the IDE's MCP injection (`internalMcpAutoInject.ts`) to point at the standalone binary. `internalMcpStdioTransport.ts` becomes unused.
- **Phase D:** verification soak across IDE-on / IDE-off / external / internal session shapes.
- **Phase E:** delete `internalMcpServer.ts`, the bridge, the port registry, all the Wave 53l scaffolding around port resolution. ~600 LOC + ~80 tests removed.
- **Phase F:** wrap-up + v2.8.0 release.
