# `src/standalone/ouroborosMcp/` — Standalone Ouroboros MCP server

> **Wave 60 complete.** This is the read-only graph MCP server that Claude Code spawns as a stdio child process. It runs outside Electron and reads the IDE-managed SQLite graph DB directly.

## File map

| File | Role |
|------|------|
| `ouroborosMcp.ts` | Entry point. Parses `--db`, validates the graph DB exists, checks schema version, then connects the MCP server to stdio. Logs to stderr only. |
| `ouroborosMcpPath.ts` | CLI/path helpers. Resolves the database path and parses command-line args. |
| `ouroborosMcpSchema.ts` | Schema handshake. Refuses to serve if the DB schema version does not match the expected version. |
| `ouroborosMcpServer.ts` | Builds the MCP server, reuses the IDE's graph tool handlers, and filters out mutating tools so the standalone remains read-only. |

## What it does

- Exposes the graph-oriented MCP tool surface through stdio.
- Serves the same SQLite DB the IDE writes during indexing.
- Refuses to start cleanly when the DB is missing or the schema version is incompatible.

## Constraints

- No Electron imports.
- No stdout logging outside the MCP transport.
- No DB writes; the IDE remains the sole writer.
- `better-sqlite3` must run with the ABI-compatible Electron binary (`ELECTRON_RUN_AS_NODE=1`).
