# CodeMode ↔ internalMcp Routing — Operator Guide

Ouroboros ships two MCP optimization mechanisms. Wave 51 wired them together so an IDE spawn can route the internal graph-tools server (`ouroboros`) through CodeMode and replace ~5–7k of MCP schema cost with a single ~500-token `execute_code` tool. This doc is the operator-facing summary: what the integration does, how to configure it, how to read the telemetry, and how to roll back.

For design rationale see `roadmap/wave-51-plan.md` and `roadmap/wave-51-decision.md`. For the architectural overview see `docs/architecture.md` "MCP transport and CodeMode routing (Wave 51)".

## What this is

**CodeMode** intercepts an agent's MCP connections and exposes a single `execute_code` tool. The agent writes TypeScript that calls `servers.<name>.<tool>(...)`; CodeMode's proxy dispatches to upstream MCP servers via stdio. The token win comes from collapsing many tool schemas into one.

**internalMcp** ("ouroboros") is the IDE's own MCP server. It exposes 10–14 graph-aware tools (`search_graph`, `trace_call_path`, `get_architecture`, etc.) over HTTP+SSE on `127.0.0.1:<port>/sse`, and Wave 48 task-gated whether to inject it per spawn.

The wires didn't connect before Wave 51: CodeMode's MCP client is stdio-only, internalMcp served only SSE, so even with both subsystems enabled CodeMode skipped ouroboros at the transport boundary. Phase A chose **Option 2 — stdio adapter in internalMcp** (rather than SSE in CodeMode), so CodeMode's stdio client stays unchanged and internalMcp gained a thin subprocess wrapper that forwards stdio JSON-RPC frames to its existing HTTP `/message` endpoint.

When the integration is on and the per-spawn policy decides to route, the agent sees `servers.ouroboros.search_graph(...)` inside `execute_code` instead of receiving the ouroboros tool schemas directly. When it's off, ouroboros is direct-injected as before.

## Configuration

All four flags live in the project's electron-store config; toggle via Settings UI or by editing the config JSON directly.

| Flag | Default | Effect |
|---|---|---|
| `codemode.enabled` | `false` | Whether `claudeCodeLaunch.ts` calls `enableCodeMode` before each spawn. When false, CodeMode is dormant and routing is impossible. |
| `codemode.routeInternalMcp` | `false` | Whether the per-spawn routing policy may include `ouroboros` in the proxy set. Requires `codemode.enabled=true` AND `internalMcp.transport='stdio'` to take effect. |
| `internalMcp.transport` | `'sse'` | `'sse'` writes `{ouroboros: {url}}`; `'stdio'` writes `{ouroboros: {command, args}}` pointing at the built `internalMcpStdioTransport.js`. CodeMode routing requires `'stdio'`. |
| `internalMcpScope` | `'task-gated'` | Wave 48 task-gating: `'always'` injects every spawn; `'task-gated'` injects only when the goal looks code-shaped; `'never'` disables ouroboros entirely (which short-circuits routing too). |

The decision matrix per spawn (computed by `internalMcpRoutingPolicy.decideInternalMcpRouting`):

| Scope | CodeMode | Route flag | Transport | Decision |
|---|---|---|---|---|
| `never` | any | any | any | `omit` |
| `task-gated` + casual goal | any | any | any | `omit` |
| `task-gated` + code goal / `always` | off | any | any | `direct-inject` |
| `task-gated` + code goal / `always` | on | off | any | `direct-inject` |
| `task-gated` + code goal / `always` | on | on | sse | `direct-inject` (transport guard) |
| `task-gated` + code goal / `always` | on | on | stdio | `route-through-codemode` |

The transport guard is intentional: CodeMode's `mcpClient.ts` is stdio-only by Phase A's decision, so routing through CodeMode requires the stdio adapter to be in use. The policy keeps the spawn on direct-inject otherwise rather than dead-ending at `connectUpstream`.

## Telemetry & rollup

Every call to `buildScopedMcpConfig` appends one JSONL record to `~/.ouroboros/telemetry/mcp-spawn-cost.jsonl` via `mcpSpawnCostTelemetry.emitMcpSpawnCost`. Fields:

```json
{
  "ts": 1761345678901,
  "spawnId": "orchestration-attempt-...",
  "routingDecision": "direct-inject" | "route-through-codemode" | "omit",
  "internalMcpScope": "always" | "task-gated" | "never",
  "transport": "sse" | "stdio",
  "codemodeEnabled": true | false,
  "mcpConfigBytes": 1234,
  "serverCount": 3,
  "tokenEstimate": 309,
  "serversIncluded": ["github", "sentry", "ouroboros"]
}
```

`tokenEstimate` is `Math.round(mcpConfigBytes / 4)` — a coarse approximation that avoids pulling a tokenizer into the main process. It's not a true count but is consistent across spawns, so it works for relative comparisons.

Run the rollup any time:

```bash
npx tsx scripts/measure-mcp-token-cost.ts
```

The script splits records by routing decision and prints a per-week markdown table of median + p25/p75 token estimates, plus the five largest direct-inject spawns (worst offenders for the route-through-codemode flip case). Use it post-soak to decide whether `codemode.routeInternalMcp` should default to `true`.

What "good" looks like: under `route-through-codemode`, `mcpConfigBytes` (and therefore `tokenEstimate`) for the spawn's MCP config drops materially — the ouroboros entry is omitted from the per-spawn config in favor of CodeMode's already-present `__codemode_proxy` entry, which surfaces the graph tools through `execute_code`.

## Soak protocol

The defaults are conservative because the actual savings haven't been measured against live data yet. The post-wave protocol (also in `roadmap/session-handoff.md` "Wave 51 follow-ups"):

1. **Week 1 — baseline.** Set `codemode.enabled=true`, leave `codemode.routeInternalMcp=false`. Use the IDE normally for one week. CodeMode will proxy user-global servers but not ouroboros.
2. **Week 2 — routed.** Flip `codemode.routeInternalMcp=true`. Set `internalMcp.transport='stdio'`. Use the IDE normally for one week.
3. **Decide.** Run `npx tsx scripts/measure-mcp-token-cost.ts`. Compare per-decision medians. If `route-through-codemode` is meaningfully cheaper than `direct-inject` and graph-tool reachability didn't regress (no spawns where the agent couldn't find the tools it needed), flip the `codemode.routeInternalMcp` default to `true` in `configSchemaTail.ts`.

## Rollback

To disable per-spawn routing without touching code, edit the config (typically `%APPDATA%/Ouroboros/config.json` on Windows):

```json
{ "codemode": { "enabled": false } }
```

Setting `codemode.enabled=false` reverts every spawn to direct-inject behavior. The next spawn's `acquireCodeModeForLaunch` is a no-op, the routing policy yields `direct-inject`, and the temp config writes the legacy `{ouroboros: {url}}` (or `{command, args}` if you kept `internalMcp.transport='stdio'`).

To roll back further — disable the stdio adapter and reinstate the SSE-only path — set `internalMcp.transport='sse'`. internalMcp's HTTP+SSE server is still started and serves the same tool set. Existing spawns are unaffected; the next spawn's `injectIntoProjectSettings` writes the SSE entry shape.

## Crash recovery

If `claudeCodeMode.acquireCodeModeForLaunch` returns `{ownsLifecycle: false}` while `codemode.enabled=true` — meaning either the codemodeManager refused (e.g. already enabled in a parallel spawn that hasn't released yet, settings file locked, no upstream servers to proxy) or `enableCodeMode` threw — `claudeCodeLaunch.ts` sets `codemodeAcquireFailed=true` on the per-spawn config build. `scopedMcpConfig.deriveRoutingDecision` then runs `downgradeOnCodemodeFailure(decision)`, which flips `route-through-codemode` to `direct-inject`. `direct-inject` and `omit` are passed through unchanged: the failure path never leaves the spawn without graph tools when graph tools were going to be present.

The downgrade is per-spawn. Failure on spawn N does not poison spawn N+1: each spawn consults the policy fresh, and if the next acquire succeeds the next spawn routes through CodeMode normally. See `src/main/codemode/crashRecovery.test.ts` for the full coverage.

What this does NOT cover: CodeMode subprocess crashes mid-session. Once `enableCodeMode` succeeds and the spawn is running, the CodeMode proxy is part of Claude Code's MCP client lifecycle, not the IDE's. If `proxyServer.ts` dies mid-session, the agent's tool calls into the proxy will start failing — that path is owned by Claude Code's MCP error handling, not by Ouroboros. Wave-level scope.

## Cross-references

- Subsystem CLAUDE.mds: `src/main/codemode/CLAUDE.md`, `src/main/internalMcp/CLAUDE.md`
- Architecture: `docs/architecture.md` "MCP transport and CodeMode routing (Wave 51)"
- Routing policy: `src/main/orchestration/providers/internalMcpRoutingPolicy.ts`
- Telemetry: `src/main/orchestration/providers/mcpSpawnCostTelemetry.ts`
- Rollup: `scripts/measure-mcp-token-cost.ts`
- Wave plan: `roadmap/wave-51-plan.md`
- Phase A decision: `roadmap/wave-51-decision.md`
