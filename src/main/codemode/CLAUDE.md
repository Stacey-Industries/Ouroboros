<!-- claude-md-auto:start -->

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# src/main/codemode/ — Code Mode MCP proxy subsystem

Intercepts Claude Code's MCP connections and injects an `execute_code` tool that lets the LLM run TypeScript against upstream MCP servers in a sandboxed VM. Two-process design: the manager runs in Electron main; the proxy runs as a child of Claude Code CLI.

## Key Files

| File                       | Role                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codemodeManager.ts`       | Public API surface — `enableCodeMode`, `disableCodeMode`, `getMcpServers`, `getCodeModeStatus`, `isCodeModeEnabled`. Delegates file work to the helpers below. |
| `codemodeManagerFiles.ts`  | Path helpers, atomic JSON read/write, restoration-record I/O, `__codemode_proxy` entry builder. Wave 53k extraction.                                            |
| `codemodeManagerScopes.ts` | Global vs project enable/restore logic. Wave 53k extraction.                                                                                                    |
| `proxyServer.ts`           | Standalone stdio script — Claude Code CLI spawns this as `node proxyServer.js <config-path>`. Not imported by main process.                                    |
| `mcpClient.ts`             | Thin wrapper over `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`. Connects to upstream MCP servers and exposes `connectUpstream(name, config)` returning an `UpstreamServer`. Wave 53k Phase D rewrite — replaced 280-line hand-rolled JSON-RPC implementation with SDK calls. |
| `typeGenerator.ts`    | Generates a `declare namespace servers { ... }` TypeScript block from upstream MCP tool schemas for Monaco editor type injection.           |
| `executor.ts`         | Executes LLM-generated TypeScript in a `vm` sandbox with an explicit globals whitelist. Captures `console.*` output into a `logs` array.   |
| `types.ts`            | Shared types: `UpstreamServer`, `McpToolSchema`, `JsonSchemaProperty`, `CodeModeStatusResult`                                              |

## Architecture — Two-Process Model

```
Electron main process                Claude Code CLI process
─────────────────────                ───────────────────────
codemodeManager.ts                   Claude Code
  │                                    │
  │  patches ~/.claude.json            │  spawns (stdio)
  │  injects __codemode_proxy ───────► │──────────────────► proxyServer.ts
  │                                    │                       │
  │                                    │  JSON-RPC             │  mcpClient.ts → upstream MCP servers
  │                                    │◄──────────────────────│
  │                                    │  execute_code result  │  executor.ts (vm sandbox)
```

The Electron main process and `proxyServer.ts` **never communicate directly**. `~/.claude.json` is the only handshake: the manager writes `__codemode_proxy` into `mcpServers`; Claude Code reads it and spawns the proxy binary.

## Files written / read by `codemodeManager`

| File | Role | Owner |
| --- | --- | --- |
| `~/.claude.json` (`mcpServers`) | Where Claude Code CLI discovers MCP servers (user scope). We add/remove `__codemode_proxy` here, and remove proxied global servers (storing them in the restoration file). | Claude Code (we mutate) |
| `<projectRoot>/.mcp.json` | Canonical project-scope MCP server entries. **CodeMode destructively removes proxied entries during enable and resurrects them on disable** (Wave 53k Phase B″). Decision 2's flag-toggle approach was non-functional in Claude Code v2.1.122 on Windows — both `--strict-mcp-config` and `disabledMcpjsonServers` leaked. | Claude Code / `internalMcpAutoInject` (modified by CodeMode during active session) |
| `~/.claude/codemode-managed.json` | Private restoration record (versioned JSON, schema v2). Stores backed-up global server configs + verbatim project-scope `.mcp.json` entries. Survives crashes — `enableCodeMode` self-heals on next call by applying any stale record. | CodeMode (private) |
| `<os.tmpdir()>/codemode-proxy-config.json` | Runtime config the proxy reads to know about upstream servers. | CodeMode |

## Enable / Disable Flow

```
Enable (claudeCodeMode.acquireCodeModeForLaunch):
  0. Self-heal: if a stale restoration file exists from a prior crash,
     apply it BEFORE starting a new enable.
  1. resolveProxiedServerNames filters out HTTP-only upstreams (mcpClient
     is stdio-only); they remain directly registered.
  2. Look up each requested stdio server in its real scope.
  3. Global servers: remove from ~/.claude.json mcpServers, back up.
  4. Project servers: remove from <root>/.mcp.json mcpServers, back up
     verbatim (destructive write — Decision 8).
  5. Add __codemode_proxy to ~/.claude.json mcpServers.
  6. Write proxy config (codemode-proxy-config.json) + restoration record
     (codemode-managed.json, schema v2).

Disable (releaseCodeModeForLaunch):
  - Read codemode-managed.json.
  - Restore global server configs → ~/.claude.json mcpServers.
  - Resurrect project entries verbatim → <root>/.mcp.json mcpServers.
  - Remove __codemode_proxy from ~/.claude.json mcpServers.
  - Delete codemode-managed.json + temp proxy config.
```

Module-level state in `codemodeManager.ts`:
- `codemodeEnabled` — whether Code Mode is active
- `proxiedServerNames` — names of servers being proxied (snapshot from last enable)
- `generatedTypesCache` — type string produced after upstream servers connect

Restoration data (what was moved aside) lives on disk in `~/.claude/codemode-managed.json`, not in module state. Crash-safe by design.

## Gotchas

- **`proxyServer.ts` is not imported by main** — it is a build artifact compiled to a standalone JS file and path-referenced in the proxy config. Do not add `import` edges to it from main-process code.
- **`proxyServer.js` lives at `out/main/proxyServer.js`, not `out/main/chunks/`** — it's a top-level rollup input per `electron.vite.config.ts`. `codemodeManagerFiles.resolveProxyServerPath()` checks both layouts (sibling, then parent) so the registered path is always one that exists. Don't simplify to a bare `path.join(__dirname, ...)`; bundle output puts callers in `chunks/` and the parent walk is required.
- **stdout is the MCP wire (SDK-owned, post-Phase-D)** — `proxyServer.ts` uses `StdioServerTransport` from `@modelcontextprotocol/sdk`. Any `console.log` / `process.stdout.write` outside the SDK's transport corrupts the JSON-RPC stream. All logging goes to stderr (and `~/.claude/codemode-proxy.log` for diagnostic post-mortem).
- **VM sandbox, not subprocess** — `executor.ts` uses Node's `vm` module inline, not a Worker or child process. Only whitelisted globals are available (`Promise`, `JSON`, `Math`, `Date`, etc.). There is no `require`, `process`, or `fs`. Don't add them.
- **File targets, post-Wave-53k**: codemodeManager writes to `~/.claude.json` (the file Claude Code CLI actually reads), not `.claude/settings.json` (Anthropic Desktop's file, ignored by the CLI). Pre-53k writes silently went nowhere — CodeMode "enabled" but the agent still saw the original servers and never the proxy. If you find yourself touching `.claude/settings.json` for MCP server entries, you have the wrong file.
- **`.mcp.json` is destructively edited during active session** (Wave 53k Phase B″). The original Decision 2 toggle-flag approach was empirically non-functional in v2.1.122 on Windows: `--strict-mcp-config` doesn't isolate `.mcp.json` discovery, and `disabledMcpjsonServers` flag is ignored. The destructive-write approach removes entries from `<root>/.mcp.json mcpServers` during enable, restores verbatim on disable. Restoration file (`~/.claude/codemode-managed.json` v2 schema) is the recovery source.
- **Atomic write throughout** — all writes are `.tmp` + rename. Tolerant reads return `null` on parse error (with a warning) so a bad JSON file doesn't get clobbered.
- **Crash safety + self-healing**: restoration data lives in `~/.claude/codemode-managed.json`, not in module state. `enableCodeMode` calls `maybeRestoreFromCrash()` at the top — if a stale record exists from a prior crashed enable, it's applied before the new enable starts. Per-spawn launch failures are handled separately via `claudeCodeMode.acquireCodeModeForLaunch`, which downgrades the routing policy to direct-inject (see `internalMcpRoutingPolicy.ts`).
- **HTTP-only servers are not multiplexed** (Wave 53k Phase B‴). `mcpClient.ts` connects via `StdioClientTransport` only — HTTP/SSE upstreams (entries with `url` and no `command`) are filtered out at `claudeCodeMode.resolveProxiedServerNames` via the `isStdioCapable()` predicate and remain directly registered in `~/.claude.json mcpServers`. The agent sees them as `mcp__<name>__*` directly; only stdio servers go through the proxy. Adding SSE support means using SDK's `SSEClientTransport`, not extending the local code.
- **15s per-upstream startup deadline** (`STARTUP_DEADLINE_MS` in `proxyServer.ts`). Claude Code's MCP startup window is ~30s; we deliberately stay well below to leave room for `tools/list` round-trips. Slow upstreams that haven't connected within 15s are skipped — log shows `WARNING: failed to connect upstream: … startup deadline (15000ms) exceeded`.
- **CodeMode launch is gated.** `codemode.enabled` (default false) drives whether `claudeCodeLaunch.ts` calls `enableCodeMode` before spawning. `codemode.routeInternalMcp` (default false) drives whether the per-spawn routing policy in `scopedMcpConfig.ts` includes ouroboros in the proxy set. Routing requires `internalMcp.transport === 'stdio'`; otherwise the policy falls back to direct-inject.
- **`generatedTypesCache` is empty until connect** — populated only after `enableCodeMode()` fully resolves and upstream servers have responded to `tools/list`. Don't read it before that.
- **Diagnostic log file**: `~/.claude/codemode-proxy.log` captures every spawn attempt, upstream connect/fail, and shutdown event with ISO timestamps. Post-mortem inspection without IDE involvement. The file appends forever — periodically truncate if it grows large.

## Dependencies

- `src/main/ipc.ts` (or an ipc-handler) calls `codemodeManager.ts` exports: `enableCodeMode`, `disableCodeMode`, `getCodeModeStatus`
- `proxyServer.ts` imports `executor`, `mcpClient`, `typeGenerator` at runtime — these are co-located intentionally
- No renderer code touches this directory; status surfaces via IPC only
