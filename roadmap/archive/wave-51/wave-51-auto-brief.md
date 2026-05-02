# Wave 51 Result — CodeMode ⇄ internalMcp Integration

**Status:** ✅ COMPLETED — 2026-04-27
**Version:** v2.9.0 (minor)
**Plan:** `roadmap/wave-51-plan.md`

---

## What shipped

Five concrete changes that take CodeMode from dormant code to a wired-into-launch optimization layer with a real bridge to internalMcp:

1. **Decision (Phase A) — Option 2: stdio in internalMcp.** Paper spike documented at `roadmap/wave-51-decision.md` compared two options (SSE in CodeMode's `mcpClient.ts` vs stdio in internalMcp). Picked Option 2: SSE has zero non-Claude-Code consumers (verified by grep across renderer/main), so modifying internalMcp's transport has near-zero blast radius vs. modifying CodeMode's stdio client which every IDE spawn would depend on. LOC was within noise (~410 vs ~450).

2. **Stdio transport (Phase B) — `internalMcpStdioTransport.ts`.** New subprocess script that parses content-length-framed JSON-RPC from stdin, forwards tool calls to localhost `/message` (the existing HTTP server), and writes responses back. Pure subprocess shape because the graph state lives only in the Electron main process — the stdio wrapper can't serve tool calls itself. JSON-RPC framing matches `codemode/mcpClient.ts` byte-for-byte.

3. **CodeMode launch wiring (Phase B + B-fix).** `codemodeManager` was previously dormant (no launch-path consumer). Phase B added `codemode.enabled` config (default `false`), wired acquire/release into `claudeCodeLaunch.ts` via extracted helpers `claudeCodeMode.ts` + `claudeCodeLaunchInputs.ts` (the launch file hit the 300-line cap). Phase B-fix added `proxyServer.ts` and `internalMcpStdioTransport.ts` to electron-vite's main build entries — without them the runtime had no executable artifact to spawn.

4. **Per-spawn routing policy (Phase C) — `internalMcpRoutingPolicy.ts`.** Pure decision module. Decision matrix:
   - `internalMcpScope === 'never'` → `omit`
   - `internalMcpScope === 'task-gated' && !taskNeedsGraphTools` → `omit`
   - `codemodeEnabled && routeInternalMcp && transport === 'stdio'` → `route-through-codemode`
   - otherwise → `direct-inject`
   Added one constraint not in the spec: `route-through-codemode` requires `transport === 'stdio'` (CodeMode's mcpClient is stdio-only; without this guard the proxy would throw on the SSE URL). Crash-recovery downgrade lives in `claudeCodeLaunch.ts` (acquire-before-build, computes `acquireFailed`) and `scopedMcpConfig.deriveRoutingDecision` (only `route-through-codemode` downgrades). `typeGenerator.ts` needed zero changes — `getActiveTools()` is the single source of truth and the existing chain (proxy → mcpClient → tools/list → stdio transport → server dispatch) emits `servers.ouroboros.*` automatically.

5. **MCP cost telemetry + rollup (Phase D).** New `mcpSpawnCostTelemetry.ts` emits per-spawn JSONL records (routing decision, transport, MCP config bytes, token estimate at bytes/4, server list) to `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl`. `scripts/measure-mcp-token-cost.ts` rolls up by routing decision with median + p25/p75 across days/weeks. **No in-session soak** — the actual flag flip is a post-wave follow-up the user runs against real data.

Phase E added an integration test (12 cases) covering decision matrix, settings-write shape per transport, telemetry call sites, and the stdio-only guard; a crash-recovery test (10 cases) covering downgrade paths; and a reader-first operator doc at `docs/codemode-internalmcp-routing.md`. Stale `@deprecated UNWIRED` JSDoc on `internalMcpServer.ts:217` and `internalMcpAutoInject.ts:78` (flagged by Phase A) are removed. Both subsystem CLAUDE.mds reflect the current state.

A small fix-up commit landed after Phase E: `scopedMcpConfig.test.ts` was polluting real telemetry (Phase E's lesson — Phase D's pre-existing test mocked `fs/promises` but not `fs`, so each run wrote ~9 records to the rollup file). Applied the partial-`fs` mock pattern from Phase E's integration test.

## Plan deviations

- **Paper spike instead of two real spike implementations.** Original plan called for implementing both options in throwaway worktrees with measurement. Revised to a paper-only spike — read both files, sketch each option's diff, estimate LOC + risk, decide. Same call landed faster and without throwaway code waste.
- **Phase D drops literal soak.** Original plan baked in "1 week with flag off, 1 week with flag on" inside the wave. Revised to ship telemetry + flag + rollup script; the soak protocol is documented in `roadmap/session-handoff.md` as a post-wave follow-up.
- **Phase B absorbed launch wiring.** Original plan separated transport implementation from CodeMode's launch path. Verification revealed CodeMode was entirely dormant — `codemodeManager` had no caller in `src/main/orchestration/`. Phase B was scoped to do both: implement the chosen transport AND wire CodeMode into the launch path. Justified by the dependency: routing through CodeMode is meaningless if CodeMode never runs.
- **Phase B-fix added build entries.** Phase B agent flagged that neither `proxyServer.js` nor `internalMcpStdioTransport.js` was emitted by electron-vite. Direct fix-up commit (`e5b972a`) added both as `rollupOptions.input` entries; verified `out/main/proxyServer.js` and `out/main/internalMcpStdioTransport.js` are produced. Without this, the wave's runtime path was non-functional.

## Phase commits (master)

- `07da343` — docs(wave-51): Phase A — paper spike and decision
- `20b58a4` — feat(wave-51): Phase B — stdio transport in internalMcp + CodeMode launch wiring
- `e5b972a` — fix(wave-51): emit proxyServer and internalMcpStdioTransport from electron-vite
- `54ab402` — feat(wave-51): Phase C — per-spawn routing policy + scopedMcpConfig integration
- `87974ce` — feat(wave-51): Phase D — MCP cost telemetry + rollup script
- `28dc79f` — docs(wave-51): Phase E — integration test, crash recovery, docs
- `5802ea8` — fix(wave-51): stop scopedMcpConfig.test.ts polluting real telemetry

## Files touched (count)

- 13 new files (stdio transport + test, codemode lifecycle helpers + test, launch input prep + test, routing policy + test, telemetry emitter + test, rollup script, integration test, crash-recovery test, decision doc, operator doc)
- 13 modified (electron.vite config, configSchemaTailExt, configAppTypes, internalMcp index/autoInject/types, main.ts, claudeCodeLaunch, scopedMcpConfig, both subsystem CLAUDE.mds, root CLAUDE.md, architecture.md, session-handoff)
- 2 stale-JSDoc removals (`internalMcpServer.ts:217`, `internalMcpAutoInject.ts:78`)

## Verification

| Gate | Result |
|---|---|
| `npx vitest run` (timeout 800) | ✅ 878 files / 9251 passed / 8 skipped / 0 failures |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ 0 errors (2 pre-existing FileViewer warnings unrelated to this wave) |
| `npm run lint:claude-md` | ✅ all CLAUDE.mds within 200-line cap |
| Telemetry pollution check | ✅ `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl` is 0 bytes after running full suite |
| Phase B scoped tests | ✅ 31/31 |
| Phase C scoped tests | ✅ 30/30 |
| Phase D scoped tests | ✅ 7/7 |
| Phase E integration + crash-recovery | ✅ 22/22 |
| Build verification (Phase B-fix) | ✅ `out/main/proxyServer.js` + `out/main/internalMcpStdioTransport.js` both emitted |

## Manual smoke

The wave touches no UI surfaces (`src/renderer/components/Layout/**` untouched), so the manual smoke gate from `~/.claude/rules/manual-smoke-gate.md` does not apply. Runtime smoke (CodeMode-on spawn → `servers.ouroboros.search_graph` roundtrip) requires real Claude Code invocation; deferred to the post-wave soak.

## Known limitations

- **`internalMcp` index barrel pulls Electron `app` transitively.** `scopedMcpConfig.ts` had to inline a copy of the entry-shape logic (transport-aware `{url}` vs `{command, args}`) rather than import from `internalMcp/index.ts`. Header comment requires keeping the inline shape in sync with `buildOuroborosEntry` in `internalMcpAutoInject.ts`. A leaf module extraction is the right cleanup.
- **`route-through-codemode` requires `transport === 'stdio'`.** CodeMode's `mcpClient.ts` is stdio-only by Phase A's decision. If the user opts for SSE-in-internalMcp, routing through CodeMode falls back to `direct-inject` (documented behavior, not an error).
- **`warnFullTestSuite` follow-up from Wave 50** is unrelated but worth noting: the Phase D telemetry sink uses the same `~/.ouroboros/telemetry/` location as Wave 48/50 taps, so future quarterly runs of the analyzer should account for the additional file.
- **`main.ts` has four `// prettier-ignore` directives** added by Phase B to stay under the 300-line cap after import expansion. Pre-existing imports were already over `printWidth: 100` — the directives restore them. A longer-term fix is either a printer config tweak or a main.ts split.

## Out-of-wave follow-ups

- **Soak + flag flip.** Run with `codemode.enabled=true, codemode.routeInternalMcp=false` for one week, then `routeInternalMcp=true` for one week. Run `npx tsx scripts/measure-mcp-token-cost.ts` and compare. Flip defaults if savings are real.
- **CodeMode for user-global MCP servers** (`sentry`, `github`, `stripe`, `codebase-memory-mcp`, `context7`). Today's IDE sessions inherit these from `~/.claude.json`; routing them through CodeMode could replace 10–20k of MCP schema cost with one ~500-token `execute_code`. Separate wave because it touches user-global config.
- **Leaf-module extraction.** Move the entry-shape logic out of `internalMcp/index.ts` so `scopedMcpConfig.ts` can import without dragging Electron `app`. Removes the inline duplicate.
- **`main.ts` cleanup.** Either bump the prettier `printWidth` or split `main.ts` to remove the four `prettier-ignore` directives.
- **User-facing CodeMode toggle UI.** Config-only today.
- **Dynamic tool unloading.** If CodeMode is active and the session hasn't invoked graph tools in N turns, drop the types from the namespace block to free tokens.
