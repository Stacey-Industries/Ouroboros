# Wave 53k Result Brief

**Status:** ✅ COMPLETED — 2026-04-29 · Released as v2.7.12 · Plan: `roadmap/wave-53k-plan.md` · ADR: `roadmap/decisions/wave-53k.md`

**Smoke:** End-to-end verified live via the IDE's chat panel. Agent successfully called `mcp__codemode_proxy__execute_code`, navigated `Object.keys(servers)` to discover multiplexed servers, and executed graph queries (`servers.ouroboros.search_graph`, `servers.ouroboros.query_graph`) returning real data.

---

## What shipped

### Phase A — File targeting fix (the original wave goal)
- `src/main/codemode/codemodeManager.ts` slimmed to public API; logic split across `codemodeManagerFiles.ts` (paths, atomic JSON I/O, restoration record) and `codemodeManagerScopes.ts` (global/project enable+restore).
- File targets corrected: `~/.claude.json mcpServers` for global, `<root>/.mcp.json` for project. Pre-fix code wrote to `~/.claude/settings.json` (Anthropic Desktop's file), which Claude Code CLI ignores.

### Phase B′ — Same bug class in the per-spawn config builder
- `scopedMcpConfig.readGlobalMcpServers()` now reads `~/.claude.json`. Pre-fix it read the same wrong file as Phase A, dropping every user server from the strict-mode temp config.

### Phase B″ — Destructive `.mcp.json` write (Decision 2 reversed)
- Empirical proof in Claude Code v2.1.122 on Windows: `--strict-mcp-config` does NOT isolate `.mcp.json` discovery, and the `disabledMcpjsonServers` flag toggle is non-functional.
- `applyProjectEnable` now removes proxied entries from `<root>/.mcp.json mcpServers` and stores them verbatim in the restoration file.
- Restoration schema bumped v1 → v2 to carry full configs (was: names list).
- `enableCodeMode` calls `maybeRestoreFromCrash()` at start — self-heals from stale restoration files.

### Phase B‴ — Two latent bugs the leak had been masking
- **`proxyServer.js` path resolution.** `__dirname` resolved to `out/main/chunks/` (where the calling code is bundled) but the file is at `out/main/proxyServer.js`. Added `resolveProxyServerPath()` that checks sibling-then-parent.
- **HTTP-only upstreams.** `mcpClient` is stdio-only; HTTP servers (sentry, context7) caused 30s timeouts each. Added `isStdioCapable()` filter at `claudeCodeMode.resolveProxiedServerNames` — HTTP servers stay directly registered, stdio servers go through the proxy.

### Phase B⁗ — Wire format
- `mcpClient.ts` and `proxyServer.ts` used LSP Content-Length framing; MCP stdio transport is NDJSON. Every real upstream's responses were being silently dropped.
- (Subsequently fully replaced by Phase D's SDK adoption, but documented here for completeness.)

### Phase B⁗.5 — Per-upstream startup deadline
- `Promise.allSettled` blocked proxy "ready" on the slowest upstream's 30s timeout. Claude Code's own ~30s safety timeout fired first, disconnecting the proxy at the moment it would have become useful.
- Added `STARTUP_DEADLINE_MS = 15_000` per-upstream race + per-connection real-time logging.

### Phase D — SDK adoption (the architecturally correct version)
- `mcpClient.ts`: 280-line hand-rolled JSON-RPC implementation → ~120 lines using `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`. SDK owns wire format, request correlation, initialize handshake.
- `proxyServer.ts`: hand-rolled `writeMessage` / `parseMessages` / `sendResult` / `handleMessage` / `registerMessageHandler` → SDK `Server` + `StdioServerTransport` + `setRequestHandler(ListToolsRequestSchema, …)` + `setRequestHandler(CallToolRequestSchema, …)`.
- Mirrors Wave 53j precedent for `internalMcpStdioTransport.ts`.
- Tests pivoted: NDJSON parser tests retired (SDK owns wire); replaced with SDK-mocked initialize/listTools/callTool delegation. New `proxyServer.test.ts` covers pure helpers + entry-point guard.

### Diagnostic infrastructure (kept)
- `~/.claude/codemode-proxy.log` — proxy now appends every spawn attempt, upstream connect/fail, and shutdown event with ISO timestamps. Useful for any future field issue.

---

## File changes

| File | Status |
| --- | --- |
| `src/main/codemode/codemodeManager.ts` | Rewritten (Phase A); revised Phases B″, D |
| `src/main/codemode/codemodeManagerFiles.ts` | New (Phase A); revised Phases B″, B‴ |
| `src/main/codemode/codemodeManagerScopes.ts` | New (Phase A); revised Phase B″ |
| `src/main/codemode/codemodeManager.test.ts` | New |
| `src/main/codemode/codemodeManagerFiles.test.ts` | New |
| `src/main/codemode/codemodeManagerScopes.test.ts` | New (revised Phase B″) |
| `src/main/codemode/mcpClient.ts` | Rewrote on SDK (Phase D) |
| `src/main/codemode/mcpClient.test.ts` | New (Phase B⁗ NDJSON tests, then revised Phase D for SDK mocks) |
| `src/main/codemode/proxyServer.ts` | Rewrote on SDK (Phase D); diagnostic log retained |
| `src/main/codemode/proxyServer.test.ts` | New (Phase D) |
| `src/main/codemode/CLAUDE.md` | Updated (file map, architecture diagram, gotchas) |
| `src/main/orchestration/providers/scopedMcpConfig.ts` | File-target fix (Phase B′) |
| `src/main/orchestration/providers/scopedMcpConfig.test.ts` | Mock-path predicate updated |
| `src/main/orchestration/providers/claudeCodeMode.ts` | Added `isStdioCapable()` filter (Phase B‴) |
| `src/main/orchestration/providers/claudeCodeMode.test.ts` | New regression test for HTTP-skip + fixture shape update |
| `src/main/codemode/codemode.internalMcp.integration.test.ts` | Mock-path predicate updated; new `__codemode_proxy` passthrough test |
| `src/main/codemode/crashRecovery.test.ts` | Mock-path predicate updated |
| `src/renderer/styles/globals.css` | Tailwind `@source not` glob extended for archive (incidental fix from roadmap reorganization) |
| `src/renderer/CLAUDE.md` | Gotcha added: Tailwind path-encoding bug + `@source not` extension policy |
| `roadmap/decisions/wave-53k.md` | New ADR (9 decisions documented) |
| `roadmap/wave-53k-plan.md` | Phases B′ → B″ → B‴ → B⁗ → B⁗.5 → D rows added with full context |

---

## Test surface

- **codemode/**: 73 tests (was 0 pre-wave). Covers: file-targeting helpers, scope helpers, public API, SDK-mocked client delegation, proxy pure helpers, integration shape under route-through-codemode.
- **orchestration/providers/**: 40 tests including new HTTP-skip regression and `__codemode_proxy` passthrough.
- **Total related-suite:** 113 passing.
- **Full suite at push time:** TBD per `npm test` final run.

---

## Manual smoke gate

This wave touches main-process MCP plumbing. No renderer surface changes. The `manual-smoke-gate.md` rule applies to renderer Layout edits; not strictly required here. Ad-hoc UI sanity check during the live smoke confirmed no chat-panel regressions.

```
## Manual smoke gate
- [x] Launched IDE with codemode.enabled: true
- [x] Sent graph-shaped chat prompt
- [x] Agent's tool surface contains mcp__codemode_proxy__execute_code (and mcp__sentry__*, mcp__context7__* directly)
- [x] Agent's tool surface does NOT contain mcp__ouroboros__* (proxy isolation verified)
- [x] Agent successfully calls servers.ouroboros.search_graph(...) → returns real graph data (18,442 nodes)
- [x] Agent successfully calls servers.ouroboros.query_graph(...) → executes Cypher → returns real result
- [x] Proxy log shows clean upstream connections (github 26 tools, stripe 31 tools, ouroboros 14 tools)
- [x] No console errors during chat
- [x] Smoke signed: cole on 2026-04-29
```

---

## Out-of-wave follow-ups

- **`codebase-memory-mcp.exe` tools/list hang** — that server (separate product) responds to `initialize` but stalls on `tools/list`. Not our bug; user can either contact that product's vendor or add it to a `codemode.excludeFromMultiplex` list (config option not yet built).
- **Triple-keyed `~/.claude.json projects` map** (Decision 7) — forward-slash, backslash, and worktree subpath variants of the same project root. Less load-bearing post-Phase-B″ since CodeMode no longer uses project-entry flags, but still worth fixing.
- **Auto-sync graph staleness** — `[trace:autoSync.reindex] files=0` despite multiple file edits across the wave. Indexer's change-detection isn't catching git-uncommitted writes correctly.
- **Wave 53l** — universal multiplexer (per-spawn → user-level takeover). Current design depends on Phase D's SDK adoption working, which it does.
