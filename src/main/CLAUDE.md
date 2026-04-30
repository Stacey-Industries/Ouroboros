# src/main/ — Electron main process

Node.js main process for the Ouroboros IDE. Entry point is `main.ts`. Each subdirectory has its own CLAUDE.md.

## Subsystem Map

| Directory / File     | Role                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `main.ts`            | Entry point — app lifecycle, window creation, startup sequencing                                       |
| `ipc.ts`             | IPC orchestration — registers all handler domains, deduplicates channels                               |
| `config.ts`          | electron-store schema + persistence                                                                    |
| `pty.ts`             | node-pty session management                                                                            |
| `hooks.ts`           | Named pipe server for Claude Code hook events                                                          |
| `windowManager.ts`   | BrowserWindow lifecycle, multi-window tracking                                                         |
| `lsp.ts`             | LSP server lifecycle (start/stop per workspace root)                                                   |
| `extensions.ts`      | VS Code extension loading and management                                                               |
| `approvalManager.ts` | Pre-execution approval flow — response-file protocol at `~/.ouroboros/approvals/`                      |
| `hookInstaller.ts`   | Auto-installs Claude Code hook scripts; version tracked via SHA-256 of contents                        |
| `agentChat/`         | Chat thread persistence, orchestration bridge, session projection — see `agentChat/CLAUDE.md`          |
| `codebaseGraph/`     | In-process codebase knowledge graph engine — see `codebaseGraph/CLAUDE.md`                             |
| `contextLayer/`      | Repo-aware context enrichment for agent sessions — see `contextLayer/CLAUDE.md`                        |
| `orchestration/`     | Context preparation and provider coordination — see `orchestration/CLAUDE.md`                          |
| `ipc-handlers/`      | Domain-split IPC handler registrars — see `ipc-handlers/CLAUDE.md`                                     |
| `storage/`           | SQLite database layer and JSON→SQLite migration — see `storage/CLAUDE.md`                              |
| `web/`               | HTTP + WebSocket server for browser-based IDE access — see `web/CLAUDE.md`                             |
| `codemode/`          | Cloudflare CodeMode integration layer — see `codemode/CLAUDE.md`                                       |
| `hooks/`             | Stop/start hook handlers (gotcha nudge, session lifecycle)                                             |
| `delegationCoach/`   | Wave 61 — pattern-matched nudges that fire when Opus skips delegation; see `delegationCoach/CLAUDE.md` |

## Key Patterns

- **Approval flow**: `approvalManager` uses a response-file protocol at `~/.ouroboros/approvals/` — hook scripts poll this path rather than holding a socket open. Important for debugging approval timeouts.
- **Hook version tracking**: `hookInstaller.ts` auto-computes its version from SHA-256 of script contents — no manual bumping ever needed.
- **Startup sequencing**: `storage/migrate.ts` runs before `createWindow()` — a sequencing constraint that would be easy to violate when reorganizing startup code.
- **Config schema split**: Schema is spread across `configSchema.ts` → `configSchemaMiddle.ts` → `configSchemaTail.ts` and merged in `config.ts`. Add new keys by domain, not by convenience. Do not consolidate — the split enforces the 300-line ESLint limit.
- **IDE tool server is a reverse channel**: Normal flow is renderer → IPC → main. `ideToolServer.ts` inverts this — external Claude Code hook scripts connect to pull IDE state via `webContents.executeJavaScript` with a 10s timeout.
- **PTY files decomposed by concern**: `ptySpawn.ts` is shared by all session types. `ptyClaude.ts` and `ptyCodex.ts` only build argv — they do not spawn.

## Gotchas

- **Extension sandbox uses Node `vm`**: Not `worker_threads`. Extensions run synchronously in the main-process vm context. Long-running extension code blocks the main process.
- **LSP connections are per-project root**: `lspState.ts` maps `projectPath → client`. Opening a new project root spawns a new language server; the old one stays alive until explicitly stopped.
- **`jankDetector.ts`**: Logs main-thread event loop stalls above a threshold. If you see `[jank]` log lines, a synchronous operation in main is blocking. Don't remove the detector — investigate the cause.
- **`hookInstaller.ts` skips when `config.autoInstallHooks === false`**: Check this flag before debugging "why didn't hooks install".
