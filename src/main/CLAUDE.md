<!-- claude-md-auto:start -->
# `src/main/` — Electron Main Process

Node.js main process. Owns all privileged operations: window management, PTY sessions, IPC handlers, hooks pipeline, LSP, extensions, config persistence, and the reverse IDE tool channel.

## File Map

### Entry & Window
| File | Role |
|------|------|
| `main.ts` | Electron entry — creates windows, registers IPC, starts services |
| `mainStartup.ts` | Startup sequencing: hook installer → tool server → LSP → extensions |
| `windowManager.ts` | Multi-window lifecycle, BrowserWindow creation, focus tracking |
| `windowManagerHelpers.ts` | Window bounds persistence, display helpers |
| `menu.ts` | Native app menu — triggers DOM CustomEvents via `webContents.send` |

### IPC & Config
| File | Role |
|------|------|
| `ipc.ts` | All `ipcMain.handle` registrations — single registration point |
| `config.ts` | `electron-store` wrapper — typed get/set, migration, defaults |
| `configSchema.ts` / `configSchemaMiddle.ts` / `configSchemaTail.ts` | Schema split across 3 files to stay under 300-line limit. Merge order: head → middle → tail |

### PTY / Terminal
| File | Role |
|------|------|
| `pty.ts` | Core node-pty session map — create/write/resize/kill |
| `ptySpawn.ts` | Low-level spawn with env injection + shell detection |
| `ptyAgent.ts` | Spawns Claude Code as a managed PTY agent |
| `ptyClaude.ts` | `claude` binary invocation args builder |
| `ptyCodex.ts` | `codex` binary invocation args builder |
| `ptyAgentBridge.ts` | Bridges agent stdout events to IPC + hooks pipeline |
| `ptyEnv.ts` | Constructs PTY env vars (PATH fixup, TERM, tool socket path injection) |
| `ptyOutputBuffer.ts` | Ring buffer for PTY output replay on reconnect |
| `ptyRecording.ts` | Timestamped session recording to disk |
| `ptyState.ts` | Shared PTY session state map |

### Hooks Pipeline
| File | Role |
|------|------|
| `hooks.ts` | Named pipe server — receives structured hook events from Claude Code scripts |
| `hooksNet.ts` | Network transport layer for hooks (WebSocket broadcast to web clients) |
| `hookInstaller.ts` | Copies hook scripts to `~/.claude/hooks/` on first launch; content-hash versioned |
| `approvalManager.ts` | Holds tool-use approval requests, exposes approve/deny to renderer via IPC |

### IDE Tool Server (Reverse Channel)
| File | Role |
|------|------|
| `ideToolServer.ts` | NDJSON server on `\\.\pipe\ouroboros-tools` (Win) / `/tmp/ouroboros-tools.sock` (Unix) — Claude Code hooks connect here to query IDE state |
| `ideToolServerHandlers.ts` | Handler implementations: `ide.getOpenFiles`, `ide.getEditorState`, `ide.gitStatus`, etc. |

### LSP
| File | Role |
|------|------|
| `lspLifecycle.ts` | Spawns/stops language server processes per project |
| `lspHelpers.ts` | LSP message framing (Content-Length header protocol) |
| `lspQueries.ts` | Hover, completions, diagnostics request builders |
| `lspDocuments.ts` | Open document sync (`textDocument/didOpen`, `didChange`) |
| `lspState.ts` | Active LSP client map (projectPath → connection) |
| `lspTypes.ts` | Shared LSP types |
| `lsp.ts` | Barrel re-export |

### Extensions
| File | Role |
|------|------|
| `extensionsLifecycle.ts` | Load/unload extension bundles from `~/.claude/extensions/` |
| `extensionsSandbox.ts` | Node `vm` sandbox — extensions run isolated, limited API surface |
| `extensionsApi.ts` | API injected into sandbox: IPC bridge, file access, UI events |
| `extensionsTypes.ts` | Extension manifest + lifecycle types |
| `extensions.ts` | Barrel re-export |

### Usage & Cost
| File | Role |
|------|------|
| `usageReader.ts` | Reads `~/.claude/projects/**/*.jsonl` session files; streams via `readline` |
| `usageReaderSupport.ts` | Parse/aggregate helpers — token counting, windowed buckets, cost calc |
| `costHistory.ts` | Persists rolling cost history to electron-store; IPC-exposed |

### CLAUDE.md Generation
| File | Role |
|------|------|
| `claudeMdGenerator.ts` | Orchestrates multi-directory CLAUDE.md generation (spawns `claude` CLI) |
| `claudeMdGeneratorSupport.ts` | Dir discovery, file listing, prompt building, git-diff detection |

### Other
| File | Role |
|------|------|
| `providers.ts` | AI provider registry (Claude, Codex) — maps model IDs to spawn configs |
| `codex.ts` | Codex session management (mirrors `pty.ts` shape) |
| `logger.ts` | `electron-log` wrapper — writes to `%APPDATA%/logs/` on Windows |
| `perfMetrics.ts` | Startup timing + renderer perf event collection |
| `updater.ts` | `electron-updater` auto-update lifecycle |
| `env.d.ts` | `import.meta.env` type declarations for main process |

## Key Patterns

**Config schema split**: `configSchema.ts` is 256 lines, but the actual schema is spread across `configSchema.ts` → `configSchemaMiddle.ts` → `configSchemaTail.ts` and merged in `config.ts`. Add new config keys to the appropriate section by domain, not just "wherever fits".

**Hook version is content-hashed**: `hookInstaller.ts` computes `CURRENT_HOOK_VERSION` by SHA-256 hashing the hook script files at runtime. Changing any script file automatically triggers re-installation on next launch — no manual version bump needed.

**IDE tool server is a reverse channel**: Normal flow is renderer → IPC → main. The tool server (`ideToolServer.ts`) inverts this — external Claude Code hook scripts connect and pull IDE state. It queries the renderer via `webContents.executeJavaScript` with a 10s timeout.

**PTY env injection**: `ptyEnv.ts` injects `OUROBOROS_TOOL_SOCKET` pointing to the tool server pipe path. This is how spawned Claude Code sessions know where to connect back to the IDE.

**Two hook transports**: `hooks.ts` handles the named pipe (local Claude Code processes); `hooksNet.ts` handles WebSocket broadcast to web-mode clients. Both feed the same `approvalManager` and renderer IPC.

## Gotchas

- **`configSchema.ts` has a 300-line split**: The schema is intentionally split to stay under ESLint `max-lines`. The three files must be imported in order in `config.ts`.
- **`usageReader.ts` streams don't buffer whole files**: It uses `readline` on `createReadStream` to avoid loading multi-MB JSONL session files into memory. Don't refactor to `readFile`.
- **Extension sandbox uses Node `vm`, not `worker_threads`**: Extensions run synchronously in the main process vm context — no parallelism. Long-running extension code will block the main process.
- **`hookInstaller.ts` skips when `config.autoInstallHooks === false`**: Check this config flag before debugging "why didn't hooks install".
- **LSP connections are per-project**: `lspState.ts` maps `projectPath → client`. Opening a new project root spawns a new LSP server; the old one stays alive until explicitly stopped.
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# src/main/ — Electron main process

Node.js main process for the Ouroboros IDE. Entry point is `main.ts`. Each subdirectory has its own CLAUDE.md.

## Subsystem Map

| Directory / File        | Role                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `main.ts`               | Entry point — app lifecycle, window creation, startup sequencing                                      |
| `ipc.ts`                | IPC orchestration — registers all handler domains, deduplicates channels                              |
| `config.ts`             | electron-store schema + persistence                                                                   |
| `pty.ts`                | node-pty session management                                                                           |
| `hooks.ts`              | Named pipe server for Claude Code hook events                                                         |
| `windowManager.ts`      | BrowserWindow lifecycle, multi-window tracking                                                        |
| `lsp.ts`                | LSP server lifecycle (start/stop per workspace root)                                                  |
| `extensions.ts`         | VS Code extension loading and management                                                              |
| `approvalManager.ts`    | Pre-execution approval flow — response-file protocol at `~/.ouroboros/approvals/`                     |
| `hookInstaller.ts`      | Auto-installs Claude Code hook scripts; version tracked via SHA-256 of contents                       |
| `usageReader.ts`        | Reads token/cost data from `~/.claude/` session files                                                 |
| `agentChat/`            | Chat thread persistence, orchestration bridge, session projection — see `agentChat/CLAUDE.md`         |
| `codebaseGraph/`        | In-process codebase knowledge graph engine — see `codebaseGraph/CLAUDE.md`                            |
| `contextLayer/`         | Repo-aware context enrichment for agent sessions — see `contextLayer/CLAUDE.md`                       |
| `orchestration/`        | Context preparation and provider coordination — see `orchestration/CLAUDE.md`                         |
| `ipc-handlers/`         | Domain-split IPC handler registrars — see `ipc-handlers/CLAUDE.md`                                    |
| `storage/`              | SQLite database layer and JSON→SQLite migration — see `storage/CLAUDE.md`                             |
| `web/`                  | HTTP + WebSocket server for browser-based IDE access — see `web/CLAUDE.md`                            |
| `codemode/`             | Cloudflare CodeMode integration layer — see `codemode/CLAUDE.md`                                      |

## Key Patterns

- **Approval flow**: `approvalManager` uses a response-file protocol at `~/.ouroboros/approvals/` — hook scripts poll this path rather than holding a socket open. Important for debugging approval timeouts.
- **Hook version tracking**: `hookInstaller.ts` auto-computes its version from SHA-256 of script contents — no manual bumping ever needed.
- **Startup sequencing**: `storage/migrate.ts` runs before `createWindow()` — a sequencing constraint that would be easy to violate when reorganizing startup code.
