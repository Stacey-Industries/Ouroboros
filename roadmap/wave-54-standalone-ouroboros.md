# Wave 54 — Standalone Ouroboros MCP Server

## Implementation Plan (DRAFT)

**Status:** DRAFT — six locked decisions below; all confirmed by user 2026-04-29.
**Version target:** v2.8.0 (was tentatively assigned to Wave 53l; reassign 53l to v2.7.13 patch).
**Dependencies:** Wave 53l Phase A merged. The bridge-fix and port-registry scaffolding shipped in 53l (commits 5809ff1, ecc3cb6, a782a96, 5f180bb, 4a32150) becomes redundant in this wave and is deleted in Phase E.

---

## Why this wave exists

User wants graph tools available to Claude Code sessions whether the IDE is running or not. Wave 53l Phase A made codemode universally accessible (multiplex works in external terminal sessions), but ouroboros itself is gated on the IDE process — when IDE is off, the bridge can't reach internalMcp's HTTP server and the proxy reports 0 tools for ouroboros.

The fix is to extract the ouroboros MCP server out of the Electron main process into a standalone Node binary that talks stdio directly to Claude Code. The IDE's job becomes "keep the SQLite graph DB fresh"; the standalone's job is "serve the DB via MCP." Same agent experience whether IDE is running or not.

---

## Goal

After this wave, the user's `~/.claude.json` (or `<root>/.mcp.json`, depending on scope) has:

```json
{
  "mcpServers": {
    "ouroboros": {
      "type": "stdio",
      "command": "node",
      "args": ["<IDE-install-dir>/resources/standalone/ouroborosMcp.js"]
    }
  }
}
```

This entry is identical whether the IDE is running or not. The standalone reads the same SQLite DB the IDE writes. Claude Code sessions get the full 14 graph tools in either state.

The Electron-internal HTTP+SSE MCP server, the stdio bridge, the port registry, the health probe, the bridge port file, the crash-recovery ouroboros-strip — all of this is **deleted**. ~600 LOC + ~80 tests gone.

---

## Locked decisions

1. **Indexing model: read-only standalone.** Standalone never writes the DB. IDE owns indexing exclusively. When IDE is off, standalone serves a snapshot of whatever the IDE last wrote. Self-indexing is a follow-up wave if needed.
2. **Single-instance policy: not needed.** Read-only standalone + better-sqlite3 WAL means concurrent readers are fine; only the IDE writes. No lockfile.
3. **DB path resolution: Electron-userData default + `--db <path>` override.** Default matches Electron's `app.getPath('userData')` per-OS:
   - Windows: `%APPDATA%/ouroboros/codebase-graph.db`
   - macOS: `~/Library/Application Support/ouroboros/codebase-graph.db`
   - Linux: `~/.config/ouroboros/codebase-graph.db`
   Override via `--db <abs-path>` arg in the mcpServers entry.
4. **Naming: single `ouroboros` entry pointing at the standalone.** No co-existing IDE-internal MCP server. With pick (b)/Reading A confirmed.
5. **Distribution: bundled with IDE installer.** Source under `src/standalone/ouroborosMcp/` with no Electron imports — kept architecturally extractable. Future npm package release is mechanical if ever needed.
6. **Migration: automatic on first launch with the new code.** The IDE detects the new standalone binary on disk, writes the new entry shape into `~/.claude.json mcpServers.ouroboros`, removes any legacy bridge entry from `<root>/.mcp.json`. codemodeStartup re-multiplexes with the new entry transparently.

---

## Scope

### In-scope

- New `src/standalone/ouroborosMcp/` directory: standalone Node entry point.
- New electron-vite build entry producing `out/standalone/ouroborosMcp.js`.
- Reuse `mcpToolHandlers.ts`, `queryEngine.ts`, `cypherEngine.ts`, `graphDatabase.ts` (already pure Node).
- DB path resolution: per-OS default + arg override.
- Schema-version handshake at standalone startup — refuse to serve if DB schema doesn't match the binary's expected version.
- "No DB indexed yet" graceful failure mode with a clear error.
- IDE-side migration: replace the bridge injection with the standalone injection at every startup.
- Delete `internalMcpServer.ts`, `internalMcpStdioTransport.ts`, `internalMcpPortRegistry.ts`, `internalMcpAutoInject.ts`'s bridge-shape branch (keep the file for the new shape), plus all the Wave 53l scaffolding around port resolution.
- Rip out: `dropStaleOuroboros`, `stripOuroborosFromProject`, `[internal-mcp] listening on port` log line, `~/.claude/internalMcp-port.json` lifecycle, `probeHealth`, `resolveLivePort`'s registry-file fallback. Some of these become irrelevant; some need an explicit removal pass.
- Update `scopedMcpConfig.ts` direct-inject path to write the standalone entry shape.
- Update codemodeStartup's eligibility check (no more bridge-port comparison; ouroboros is always eligible if standalone binary exists).
- Update `~/.claude.json mcpServers` cleanup on shutdown — does codemode disable correctly when ouroboros entry shape changed?
- New tests for the standalone (stdio handshake, tool list, tool call against a fixture DB, schema-mismatch refusal, missing-DB error).
- Update docs: `src/main/internalMcp/CLAUDE.md` (deprecate-and-shrink), `src/main/codebaseGraph/CLAUDE.md` (note new consumer), top-level CLAUDE.md (folder map), new `src/standalone/CLAUDE.md`.

### Out-of-scope

- Self-indexing standalone (deferred follow-up).
- Context-layer fallback tools (the 6 `get_codebase_context` etc. tools that fire when graph isn't built). Drop the fallback; once graph is built once, it stays.
- npm-package distribution (architecturally ready, not actually shipped).
- Renaming "ouroboros" to anything else.
- Telemetry for the standalone (Wave 53l Phase E was going to add it; defer to a follow-up).

---

## Phases

| Phase | Goal | Subagent / responsibility |
|---|---|---|
| 0 | Verification smokes: confirm Claude Code spawns a standalone stdio MCP server cleanly via the SDK; confirm `better-sqlite3` opens our DB in readonly mode without locking issues; confirm the per-OS `userData` paths resolve correctly outside Electron. ADR (`roadmap/decisions/wave-54.md`) capturing the six locked decisions. | Orchestrator + user. |
| A | Build the standalone in isolation. New directory `src/standalone/ouroborosMcp/`, new electron-vite entry, stdio transport via SDK's `StdioServerTransport`, tool registration reusing `mcpToolHandlers.ts`. Schema-version handshake. `--db` arg parsing. No IDE-side changes yet — coexists. | sonnet-implementer. |
| B | Switch IDE-side injection to the standalone shape. `internalMcpAutoInject.ts` writes the new entry; old shape no longer produced. Existing `internalMcpServer.ts` still runs (decommission deferred). codemodeStartup is unaffected because it reads whatever the entry shape is. Smoke: external `claude mcp list` + IDE-internal chat with codemode-on should both work. | sonnet-implementer. |
| C | Switch per-spawn temp config (`scopedMcpConfig.ts`) to standalone too. The old direct-inject path wrote the bridge entry; now it writes the standalone entry. After this phase, no live consumer of the bridge or internalMcpServer remains. | sonnet-implementer. |
| D | Confirmation soak: external session + IDE-internal session + codemode-multiplex case + IDE-off case. All four should serve graph tools through `servers.ouroboros.*`. | Orchestrator + user. |
| E | Delete internalMcp tangle. Rip out `internalMcpServer.ts`, `internalMcpStdioTransport.ts`, port-registry file machinery, `probeHealth`/`resolveLivePort`'s registry fallback, `dropStaleOuroboros`, `stripOuroborosFromProject`, the `[internal-mcp] listening` log, the SSE handlers in main.ts startup. Deletion is mechanical because Phase C removed the last consumer. ~600 LOC + ~80 tests gone. | sonnet-migration-executor (this is a blueprint-driven mechanical removal). |
| F | Wrap-up: result brief, ADR finalized, plan flipped, version bump v2.8.0, push. Update CLAUDE.mds. Manual smoke gate signed (no UI changes here, but a smoke is worth doing for the migration path). | Orchestrator. |

---

## Risks

| Risk | Mitigation |
|---|---|
| DB schema drifts between IDE writer and standalone reader | Schema-version handshake at standalone startup. If mismatch, refuse to serve with a clear error pointing at the IDE binary version. |
| Standalone can't open DB if IDE has it open with exclusive lock | better-sqlite3 readonly mode + WAL = concurrent readers permitted. Verify in Phase 0 smoke. |
| User has stale `~/.claude.json mcpServers.ouroboros` from pre-Wave-54 (bridge shape) | IDE startup migration in Phase B overwrites it. codemode-managed.json's stale ouroboros also gets stripped (existing self-heal from 53l). |
| codebase-graph.db is missing (fresh install, IDE never indexed) | Standalone returns a single error tool result: "Graph not yet indexed. Open the IDE on a project at least once." Doesn't crash. |
| Per-spawn `--mcp-config` direct-inject path was the only path that knew about the live port — losing that means we lose live-state visibility | Acceptable: graph queries don't need live state. Live-state queries (open buffers, cursor) go through other tools (context-layer), not graph MCP. |
| Removing internalMcp also removes the IDE's `/health` endpoint that other things might call | Verify in Phase E that nothing else hits it (grep for `/health`). |

---

## Acceptance criteria (wave-level)

- [ ] All six locked decisions reflected in `roadmap/decisions/wave-54.md`.
- [ ] `out/standalone/ouroborosMcp.js` exists, is a valid Node script, spawns and serves stdio MCP.
- [ ] `claude mcp list` from a terminal (IDE off) shows `ouroboros` connected.
- [ ] Agent in a terminal session (IDE off) can call `servers.ouroboros.search_graph(...)` via the codemode proxy and get results.
- [ ] Agent in an IDE-internal session can do the same.
- [ ] Schema mismatch (force by editing the binary's expected version) produces a clear refusal, not a corrupted result.
- [ ] No port-binding code paths remain in main.ts startup. No `internalMcp-port.json` written.
- [ ] No file references to `internalMcpServer.ts`, `internalMcpStdioTransport.ts` outside of git history.
- [ ] First-tool-call latency on a fresh standalone spawn (cold) measured and under 3s.
- [ ] Existing external Claude Code sessions on the prior bridge shape get migrated transparently on first IDE launch with the new code.
- [ ] No regressions in IDE-internal codemode multiplex (smoke: agent calls a graph tool via execute_code, gets results).

---

## Out-of-wave follow-ups

- **Self-indexing standalone** — let the standalone reindex incrementally when IDE is off. Wave-sized.
- **Context-layer fallback tools** — file-based reads of contextLayerStore so the 6 fallback tools work in standalone. Smaller than self-indexing; revisit if anyone hits the "graph not yet indexed" error in practice.
- **Per-server namespace docstrings** — agent-discrimination improvement deferred from Wave 53l. Lower priority now that there's only one graph server in the multiplex.
- **JSON tool output migration** — Wave 53l Phase C scope; independent of this wave.
- **npm-package release of the standalone** — unblocked by Wave 54's clean directory boundary; trivial to ship later if desired.
