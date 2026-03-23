# Types — IPC Type Contract (Single Source of Truth)

Type declarations for the entire `window.electronAPI` surface. Every renderer→main IPC call is typed here. This is the contract between the preload bridge and the renderer — if a method isn't declared here, the renderer can't call it.

## File Structure

| File                            | Domain                                                                                                                                                      | Key APIs                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `electron.d.ts`                 | **Barrel + global augmentation** — re-exports all modules, declares `window.electronAPI: ElectronAPI`                                                       | —                                                                                                     |
| `electron-foundation.d.ts`      | **Core types** — `IpcResult`, `AppConfig`, config shapes, file/dir types, `HookPayload`, `AgentEvent`. Everything else imports from here.                   | —                                                                                                     |
| `electron-workspace.d.ts`       | **`ElectronAPI` root** — assembles all sub-APIs into the final surface. Also owns MCP config, project context, orchestration, IDE tools, window management. | `ElectronAPI`                                                                                         |
| `electron-runtime-apis.d.ts`    | **Process APIs**                                                                                                                                            | `PtyAPI`, `ConfigAPI`, `FilesAPI`, `HooksAPI`, `ApprovalAPI`, `AppAPI`, `ShellAPI`, `ThemeAPI`        |
| `electron-git.d.ts`             | **Git operations**                                                                                                                                          | `GitAPI`, `ShellHistoryAPI`, `UpdaterAPI`                                                             |
| `electron-observability.d.ts`   | **Monitoring**                                                                                                                                              | `CrashAPI`, `PerfAPI`, `CostAPI`, `SessionsAPI`, `SymbolAPI`, `LspAPI`, `UsageAPI`, `ContextLayerAPI` |
| `electron-extension-store.d.ts` | **VS Code extensions** — Open VSX / Marketplace search and install                                                                                          | `ExtensionStoreAPI`                                                                                   |
| `electron-mcp-store.d.ts`       | **MCP registry** — search/install MCP servers from registry                                                                                                 | `McpStoreAPI`                                                                                         |
| `electron-agent-chat.d.ts`      | **Agent chat** — thin re-export of types from `src/main/agentChat/types` and `events`                                                                       | `AgentChatAPI`                                                                                        |
| `electron-claude-md.d.ts`       | **CLAUDE.md generation** — settings, generation results, status tracking                                                                                    | `ClaudeMdAPI`                                                                                         |

## Dependency Graph

```
electron.d.ts  (barrel + Window augmentation)
  └─ electron-workspace.d.ts  (ElectronAPI root — imports all others)
       ├─ electron-foundation.d.ts      (IpcResult, AppConfig, base types)
       ├─ electron-runtime-apis.d.ts    (Pty, Config, Files, Hooks, App, Shell, Theme)
       ├─ electron-git.d.ts             (Git, ShellHistory, Updater)
       ├─ electron-observability.d.ts   (Crash, Perf, Cost, Sessions, Symbol, LSP, Usage)
       ├─ electron-extension-store.d.ts
       ├─ electron-mcp-store.d.ts
       ├─ electron-agent-chat.d.ts  →  src/main/agentChat/types + events
       └─ electron-claude-md.d.ts
```

## Conventions

- **All IPC results extend `IpcResult`** (`{ success: boolean; error?: string }`). Payload fields are always optional — check `success` before accessing them.
- **Event subscriptions return `() => void` cleanup functions**, not disposables. Always store and call the return value to unsubscribe.
- **Naming**: `*Result` for IPC responses, `*API` for method groups, `*Event` for push payloads.
- **Two cross-boundary imports**: `electron-agent-chat.d.ts` re-exports from `../../main/agentChat/types`, and `electron-foundation.d.ts` imports `AgentChatSettings` from that same path. All other types are self-contained in this directory.

## Gotchas

- **Import from `electron.d.ts` only** — never import directly from sub-files in renderer code. The barrel ensures the global `Window` augmentation is always applied.
- **`electron-agent-chat.d.ts` is a thin re-export** — the canonical types live in `src/main/agentChat/types.ts` and `events.ts`. Editing those files propagates to both sides automatically.
- **`AppConfig` must stay in sync with `src/main/config.ts`** — it mirrors the electron-store JSON schema. Adding a config key requires updating both files.
- **`AppTheme` uses the `(string & {})` trick** — provides IDE autocomplete for known theme names while still accepting arbitrary strings for custom/extension themes. Do not simplify to `string`.
- **Adding a new API domain requires four steps**: (1) define the `*API` interface in a new `electron-{domain}.d.ts`, (2) add it as a property on `ElectronAPI` in `electron-workspace.d.ts`, (3) implement the handler in `src/main/ipc-handlers/`, (4) wire it through `src/preload/preload.ts`.
- **These are `.d.ts` declaration files** — never imported for runtime values, only types. Knip excludes this directory from dead-code analysis (`src/renderer/types/**` in `knip.config.ts`).
