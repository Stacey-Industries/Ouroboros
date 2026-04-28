<!-- claude-md-auto:start -->

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# src/main/codemode/ — Code Mode MCP proxy subsystem

Intercepts Claude Code's MCP connections and injects an `execute_code` tool that lets the LLM run TypeScript against upstream MCP servers in a sandboxed VM. Two-process design: the manager runs in Electron main; the proxy runs as a child of Claude Code CLI.

## Key Files

| File                  | Role                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `codemodeManager.ts`  | Electron main-process orchestrator — reads Claude Code settings, injects proxy config, toggles real servers on/off. Holds 6 module-level state vars. |
| `proxyServer.ts`      | Standalone stdio script — Claude Code CLI spawns this as `node proxyServer.js <config-path>`. Not imported by main process.                |
| `mcpClient.ts`        | Minimal JSON-RPC 2.0 / content-length-framed MCP client. No external deps by design — runs inside the stripped proxy environment.          |
| `typeGenerator.ts`    | Generates a `declare namespace servers { ... }` TypeScript block from upstream MCP tool schemas for Monaco editor type injection.           |
| `executor.ts`         | Executes LLM-generated TypeScript in a `vm` sandbox with an explicit globals whitelist. Captures `console.*` output into a `logs` array.   |
| `types.ts`            | Shared types: `UpstreamServer`, `McpToolSchema`, `JsonSchemaProperty`, `CodeModeStatusResult`                                              |

## Architecture — Two-Process Model

```
Electron main process                Claude Code CLI process
─────────────────────                ───────────────────────
codemodeManager.ts                   Claude Code
  │                                    │
  │  patches .claude/settings.json     │  spawns (stdio)
  │  injects __codemode_proxy ───────► │──────────────────► proxyServer.ts
  │                                    │                       │
  │                                    │  JSON-RPC             │  mcpClient.ts → upstream MCP servers
  │                                    │◄──────────────────────│
  │                                    │  execute_code result  │  executor.ts (vm sandbox)
```

The Electron main process and `proxyServer.ts` **never communicate directly**. The settings file is the only handshake: the manager writes `__codemode_proxy` into `.claude/settings.json`; Claude Code reads it and spawns the proxy binary.

## Enable / Disable Flow

```
Enable:   read settings → back up server list → disable real servers
          → write proxy config → inject __codemode_proxy entry

Disable:  remove __codemode_proxy → re-enable backed-up servers → clear state
```

Module-level state in `codemodeManager.ts` (singleton — no class):
- `codemodeEnabled` — whether Code Mode is active
- `proxiedServerNames` — names of servers being proxied
- `disabledByUs` (`Set<string>`) — servers disabled by the enable step; only these are restored
- `activeScope` — `'global'` or `'project'`
- `activeProjectRoot` — project root for project-scoped settings
- `generatedTypesCache` — type string produced after upstream servers connect

## Gotchas

- **`proxyServer.ts` is not imported by main** — it is a build artifact compiled to a standalone JS file and path-referenced in the proxy config. Do not add `import` edges to it from main-process code.
- **stdout is the MCP wire** — `proxyServer.ts` writes all logging to stderr. Any `console.log` / `process.stdout.write` that reaches the proxy's stdout corrupts the content-length-framed protocol.
- **VM sandbox, not subprocess** — `executor.ts` uses Node's `vm` module inline, not a Worker or child process. Only whitelisted globals are available (`Promise`, `JSON`, `Math`, `Date`, etc.). There is no `require`, `process`, or `fs`. Don't add them.
- **Settings file mutation** — `codemodeManager.ts` directly modifies `~/.claude/settings.json` (global) or `{projectRoot}/.claude/settings.json` (project). Any crash mid-mutation leaves settings in a partial state.
- **Crash recovery gap** — module-level state (`disabledByUs`) is lost on crash while Code Mode is active. The next `getStatus()` call should detect lingering `__codemode_proxy` entries and surface a recovery prompt to the UI. Per-spawn launch failures are handled separately via `claudeCodeMode.acquireCodeModeForLaunch`, which downgrades the routing policy to direct-inject (see `internalMcpRoutingPolicy.ts`).
- **`mcpClient.ts` is stdio-only by design.** Wave 51 Phase A picked Option 2 (stdio transport in internalMcp) rather than adding SSE to CodeMode, so `McpServerConfig.url` remains parsed-but-unused. If a third-party upstream MCP server only ships SSE, the supported path is to wrap it with a stdio adapter (mirroring `internalMcpStdioTransport.ts`) rather than extending `mcpClient.ts`.
- **CodeMode launch is gated.** `codemode.enabled` (default false) drives whether `claudeCodeLaunch.ts` calls `enableCodeMode` before spawning. `codemode.routeInternalMcp` (default false) drives whether the per-spawn routing policy in `scopedMcpConfig.ts` includes ouroboros in the proxy set. Routing requires `internalMcp.transport === 'stdio'`; otherwise the policy falls back to direct-inject.
- **30 s upstream timeout** (`TIMEOUT_MS` in `mcpClient.ts`) — Claude Code may have its own shorter timeout for the proxy; adjust carefully.
- **`generatedTypesCache` is empty until connect** — populated only after `enableCodeMode()` fully resolves and upstream servers have responded to `tools/list`. Don't read it before that.

## Dependencies

- `src/main/ipc.ts` (or an ipc-handler) calls `codemodeManager.ts` exports: `enableCodeMode`, `disableCodeMode`, `getCodeModeStatus`
- `proxyServer.ts` imports `executor`, `mcpClient`, `typeGenerator` at runtime — these are co-located intentionally
- No renderer code touches this directory; status surfaces via IPC only
