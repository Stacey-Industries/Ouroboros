# CodeMode ↔ internalMcp Routing — Archived (pre-Wave-60)

> **This document described the Wave 51 in-process MCP architecture (SSE+stdio transport, per-spawn `routeInternalMcp` flag, stdio-transport adapter). Wave 60 deleted that infrastructure and replaced it with a standalone MCP server.**

## Current state

The graph MCP server is now a **standalone Node binary** at `src/standalone/ouroborosMcp/`. Claude Code spawns it as a stdio child; it reads the IDE's SQLite graph DB directly. Per-spawn config injection happens in `src/main/internalMcp/internalMcpAutoInject.ts`. CodeMode's universal multiplexer (Wave 53l) intercepts the spawn's MCP servers; opt-out per server via `codemode.excludeFromMultiplex`.

For the current architecture and operator-facing details, see:

- `src/standalone/ouroborosMcp/CLAUDE.md` — standalone server module map
- `src/standalone/CLAUDE.md` — standalone binaries directory overview
- `docs/architecture.md` "Graph MCP server (Wave 60)" — high-level integration

## Historical references

The original Wave 51 design (option matrix, paper-spike, transport selection rationale) is preserved at:

- `roadmap/_archived/wave-51-plan.md` — original plan with the SSE-vs-stdio decision matrix
- `roadmap/_archived/wave-51-decision.md` — Phase A architectural decision
- `roadmap/_archived/wave-60-standalone-ouroboros.md` — the wave that retired this stack
