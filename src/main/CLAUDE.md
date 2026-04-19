<!-- claude-md-auto:start -->
The existing file has some stale entries (`usageReader.ts`, `usageReaderSupport.ts` don't exist in the file list). Here's the corrected CLAUDE.md content:

# `src/main/` — Electron Main Process

Node.js main process. Owns all privileged operations: window management, PTY sessions, IPC handlers, hooks pipeline, LSP, extensions, config persistence, and the reverse IDE tool channel.

## File Map

### Entry & Window
| File | Role |
|------|------|
| `main.ts` | Electron entry — creates windows, registers IPC, starts services |
| `mainStartup.ts` | Startup sequencing: hook installer → tool server → LSP → extensions |
| `windowManager.ts` | Multi-window lifecycle, BrowserWindow creation, focus tracking |
| `windowManagerHelpers.ts` | Window bounds persistence, Mica glass effect, display helpers |
| `menu.ts` | Native app menu — triggers DOM CustomEvents via `webContents.send` |

### IPC & Config
| File | Role |
|------|------|
| `ipc.ts` | All `ipcMain.handle` registrations — single registration point |
| `config.ts` | `electron-store` wrapper — typed get/set, migration, defaults |
| `configSchema.ts` / `configSchemaMiddle.ts` / `configSchemaTail.ts` | Schema split across 3 files to stay under 300-line ESLint limit. Merged in order in `config.ts` |

### PTY / Terminal
| File | Role |
|------|------|
| `pty.ts` | Core node-pty session map — create/write/resize/kill |
| `ptySpawn.ts` | Low-level spawn with env injection + shell detection |
| `ptyAgent.ts` | Spawns Claude Code as a managed PTY agent |
| `ptyClaude.ts` | `claude` binary invocation args builder |
| `ptyCodex.ts` | `codex` binary invocation args builder |
| `ptyAgentBridge.ts` | Bridges agent stdout events to IPC + hooks pipeline |
| `ptyCodexCapture.ts` | Captures structured Codex output (cost, tokens, tool calls) from stdout |
| `ptyEnv.ts` | Constructs PTY env vars (PATH fixup, TERM, `OUROBOROS_TOOL_SOCKET` injection) |
| `ptyOutputBuffer.ts` | Ring buffer for PTY output replay on reconnect |
| `ptyRecording.ts` | Timestamped session recording to disk |
| `ptyState.ts` | Shared PTY session state map |

### Hooks Pipeline
| File | Role |
|------|------|
| `hooks.ts` | Named pipe server — receives structured hook events from Claude Code scripts |
| `hooksNet.ts` | Network transport layer for hooks (WebSocket broadcast to web clients) |
| `hooksLifecycleHandlers.ts` | Handles session start/stop lifecycle hook events |
| `hooksSessionHandlers.ts` | Handles per-session hook events (tool calls, approvals, cost updates) |
| `hookInstaller.ts` | Copies hook scripts to `~/.claude/hooks/`; content-hash versioned (no manual bumps) |
| `hookInstallerCommands.ts` | Builds the shell command strings injected into hook scripts |
| `hookInstallerStatusLine.ts` | Registers the IDE status line entry in Claude Code settings |
| `approvalManager.ts` | Holds pending tool-use approval requests; exposes approve/deny to renderer via IPC |

### IDE Tool Server (Reverse Channel)
| File | Role |
|------|------|
| `ideToolServer.ts` | NDJSON server on `\\.\pipe\ouroboros-tools` (Win) / `/tmp/ouroboros-tools.sock` (Unix) — Claude Code hooks connect to query IDE state |
| `ideToolServerHandlers.ts` | Handler implementations: `ide.getOpenFiles`, `ide.getEditorState`, `ide.gitStatus`, etc. |
| `ideToolServerHelpers.ts` | Request parsing, response formatting, address formatting utilities |

### LSP
| File | Role |
|------|------|
| `lspLifecycle.ts` | Spawns/stops language server processes per project root |
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
| `extensionsSandbox.ts` | Node `vm` sandbox — extensions run isolated with limited API surface |
| `extensionsApi.ts` | API injected into sandbox: IPC bridge, file access, UI events |
| `extensionsTypes.ts` | Extension manifest + lifecycle types |
| `extensions.ts` | Barrel re-export |

### Usage & Cost
| File | Role |
|------|------|
| `claudeUsagePoller.ts` | Polls `~/.claude/` session JSONL files for token/cost data |
| `costHistory.ts` | Persists rolling cost history to electron-store; IPC-exposed |
| `costHistoryAggregation.ts` | Aggregates raw session records into windowed buckets (hourly/daily) |
| `claudeRateLimits.ts` | Tracks and exposes Claude API rate limit state |
| `codexRateLimits.ts` | Tracks and exposes Codex rate limit state |

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
| `jankDetector.ts` | Detects main-process event loop stalls; logs warnings above threshold |
| `fdPressureDiagnostics.ts` | Reports file descriptor count when approval requests pile up |
| `updater.ts` | `electron-updater` auto-update lifecycle |
| `env.d.ts` | `import.meta.env` type declarations for main process |

## Key Patterns

**Config schema split**: The schema is spread across `configSchema.ts` → `configSchemaMiddle.ts` → `configSchemaTail.ts` and merged in `config.ts`. Add new config keys to the appropriate section by domain, not just wherever fits. Do not consolidate — the split enforces the 300-line ESLint limit.

**Hook version is content-hashed**: `hookInstaller.ts` SHA-256 hashes the hook script files at runtime to compute `CURRENT_HOOK_VERSION`. Changing any hook script automatically triggers re-installation on next launch — never manually bump a version constant.

**IDE tool server is a reverse channel**: Normal flow is renderer → IPC → main. The tool server (`ideToolServer.ts`) inverts this — external Claude Code hook scripts connect to pull IDE state. It queries the renderer via `webContents.executeJavaScript` with a 10s timeout. Path injected into PTY env as `OUROBOROS_TOOL_SOCKET`.

**Two hook transports**: `hooks.ts` handles the named pipe (local Claude Code processes); `hooksNet.ts` handles WebSocket broadcast to web-mode clients. Both feed the same `approvalManager` and renderer IPC.

**Approval response-file protocol**: `approvalManager.ts` writes JSON to `~/.ouroboros/approvals/{requestId}.response`. Hook scripts poll this file at ~500ms intervals rather than holding a socket open. Timeout and polling are on the hook script side, not in the IDE.

## Gotchas

- **`configSchema.ts` is intentionally split**: Do not merge the three schema files — the split keeps all three under the 300-line ESLint limit. Import order in `config.ts` matters.
- **Extension sandbox uses Node `vm`, not `worker_threads`**: Extensions run synchronously in the main process vm context. Long-running extension code blocks the main process.
- **`hookInstaller.ts` skips when `config.autoInstallHooks === false`**: Check this flag before debugging "why didn't hooks install".
- **LSP connections are per-project root**: `lspState.ts` maps `projectPath → client`. Opening a new project root spawns a new language server; the old one stays alive until explicitly stopped.
- **`jankDetector.ts` logs main-thread stalls**: If you see unexpected `[jank]` log lines, a synchronous operation in main is blocking the event loop. Don't remove the detector — investigate the cause.
- **PTY files are decomposed by concern, not by session type**: `ptySpawn.ts` is shared by all session types (Claude, Codex, plain shells). `ptyClaude.ts` and `ptyCodex.ts` only build argv — they do not spawn.

## Subdirectory Index

| Path | Contents |
|------|----------|
| `agentChat/` | Chat thread persistence, orchestration bridge, session projection |
| `auth/` | OAuth + token management |
| `codebaseGraph/` | In-process codebase knowledge graph engine |
| `codemode/` | Cloudflare CodeMode integration layer |
| `ipc-handlers/` | Domain-split IPC handler registrars |
| `internalMcp/` | SSE MCP server (wired and active — see main.ts:22, 126, 137) |
| `orchestration/` | Context preparation and provider coordination |
| `router/` | Model routing and selection |
| `rulesAndSkills/` | Rules and skills management |
| `storage/` | SQLite database layer and JSON→SQLite migration |
| `symbolExtractor/` | Symbol extraction for context injection |
| `web/` | HTTP + WebSocket server for browser-based IDE access |
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
