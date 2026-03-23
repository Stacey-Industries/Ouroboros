# codemode — Cloudflare CodeMode integration layer

Manages the Code Mode lifecycle: reads MCP server configs from Claude Code's settings files, injects a proxy MCP server, and toggles original servers on/off during active sessions.

## Key Files

| File                  | Role                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `codemodeManager.ts`  | Lifecycle orchestrator — enables/disables Code Mode by mutating Claude Code settings files. Holds 6 module-level state variables.            |
| `proxyServer.ts`      | Local MCP proxy server — intercepts tool calls, applies optimizations, forwards to real MCP servers                                           |
| `mcpClient.ts`        | MCP client — connects to real servers, forwards calls with 30s independent timeout                                                            |
| `typeGenerator.ts`    | Generates `declare namespace` TypeScript types embedded in the proxy tool description string — prompt engineering, not compiled code          |
| `executor.ts`         | Tool call execution — validates, routes, and invokes tool calls                                                                               |
| `types.ts`            | Shared types: `CodeModeStatusResult`, `CodeModeConfig`                                                                                        |

## Architecture

Code Mode works by injecting a `__codemode_proxy` MCP entry into Claude Code's settings and disabling real servers while active:

```
Enable:  read settings → backup server list → disable real servers → inject proxy entry
Disable: remove proxy entry → re-enable backed-up servers → clear module state
```

Module-level state in `codemodeManager.ts`:
- `codemodeEnabled` — whether Code Mode is currently active
- `proxiedServerNames` — names of servers being proxied
- `disabledByUs` — servers disabled by the enable step (restored on disable)
- `activeScope` — `'global'` or `'project'`
- `activeProjectRoot` — project root for project-scope settings
- `generatedTypesCache` — cached type string for the proxy tool description

## Gotchas

- **Settings file mutation**: `codemodeManager.ts` directly modifies `~/.claude/settings.json` (global scope) or `{projectRoot}/.claude/settings.json` (project scope). Any failure mid-mutation can leave settings in a partial state.
- **Crash recovery gap**: If Electron dies while Code Mode is active, the settings file stays in the mutated state. The next `getStatus()` call detects this and surfaces it to the UI.
- **`typeGenerator` is prompt engineering**: The `declare namespace` block it generates is embedded in the MCP tool description string so the LLM reads it as context — it is never compiled.
- **Two-layer timeout**: The VM sandbox timeout in `executor.ts` guards synchronous execution only. `mcpClient.ts` has its own independent 30s timeout for the upstream network call.
- **SSE transport is a no-op**: `McpServerConfig.url` is read but never used to establish an SSE connection — only `command`/`args` (stdio) transports are active.
