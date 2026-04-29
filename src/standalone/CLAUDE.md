# `src/standalone/` — Standalone Node binaries

> **Wave 60 complete.** This directory exists for binaries that must run outside Electron, such as the standalone Ouroboros MCP server spawned by Claude Code when the IDE is off. Code here must not import Electron or anything that transitively depends on it.

## Subsystem map

| Path | Role |
|------|------|
| `ouroborosMcp/` | Read-only MCP server exposing the codebase graph over stdio. Spawned by Claude Code; reads the same SQLite DB the IDE writes to. See `ouroborosMcp/CLAUDE.md` for module-level details. |

## Build

`electron.vite.config.ts` includes `ouroborosMcp` in the main-process build inputs. The compiled output lands at `out/main/ouroborosMcp.js` and is what Codemode / Claude Code launch.

## Native bindings

`better-sqlite3` is a native module. The standalone uses the IDE's Electron binary in Node mode (`ELECTRON_RUN_AS_NODE=1`) so the shipped binding matches the runtime ABI.

## Current state

- The standalone server is the Wave 60 end state for `ouroboros`.
- The IDE no longer hosts the graph MCP server in-process.
- The old bridge / port-registry / stdio-transport stack has been deleted.
