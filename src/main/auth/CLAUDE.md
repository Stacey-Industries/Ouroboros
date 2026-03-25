# src/main/auth/ — Multi-provider authentication subsystem

Manages credentials for GitHub (PKCE + Device Flow), Anthropic (API key + OAuth), and OpenAI (API key). Credentials are encrypted via Electron's `safeStorage` and persisted to `<userData>/auth/credentials.enc`.

## Files

| File                      | Role                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `credentialStore.ts`      | Encrypted credential persistence — `safeStorage` encryption, atomic writes, in-process read cache            |
| `protocolHandler.ts`      | Ephemeral localhost HTTP server that receives the GitHub PKCE OAuth redirect and completes token exchange     |
| `tokenRefreshManager.ts`  | Background token refresh — polls every 60 s, proactively refreshes Anthropic OAuth within a 5-min expiry buffer |
| `cliCredentialImporter.ts`| Reads existing credentials from CLI tools (gh CLI, Claude CLI, Codex, env vars) — detect-only vs import      |
| `gitCredentials.ts`       | Bridges GitHub token from the store to PTY env (`GITHUB_TOKEN`/`GH_TOKEN`) — logging shim only, injection is in `pty.ts` |
| `types.ts`                | Re-exports from `@shared/types/auth` — backward-compat shim, no local declarations                           |
| `index.ts`                | Barrel — only exports from `credentialStore`, `cliCredentialImporter`, `tokenRefreshManager`, and `types`    |
| `providers/`              | Per-provider credential logic — see `providers/CLAUDE.md`                                                    |
| `__tests__/`              | Vitest unit tests — see `__tests__/CLAUDE.md`                                                                 |

## Key Patterns

**All credential I/O goes through `credentialStore`** — never call `safeStorage` or touch the credentials file from provider or consumer code.

**Atomic writes** — `writeStore` writes to `credentials.enc.tmp` then renames over `credentials.enc`. Prevents corrupt state on interrupted writes.

**In-process read cache** — module-level `let cache: EncryptedStore | null`. Populated on first read, updated on every write. Never expires during the process lifetime. External edits to the file on disk are invisible until app restart.

**Detection vs import split in `cliCredentialImporter`** — `detectExistingCredentials` is read-only (no store writes, returns availability + source string). The `import*Credentials` functions return `Credential` objects that the caller is responsible for passing to `setCredential`. Keep these concerns separate.

**`tokenRefreshManager` only refreshes Anthropic OAuth** — GitHub tokens don't expire by default; OpenAI uses non-expiring API keys. The refresh check skips `credentialType !== 'oauth'` entries. Successful refreshes emit `auth:state-changed` via `../web/broadcast` to all renderer windows and web clients.

## Gotchas

- **`safeStorage` fallback is silent** — when `safeStorage.isEncryptionAvailable()` is false (CI, headless, some Linux setups), credentials are stored as base64 only (no encryption). The only signal is a `warn` log. Test environments should mock `safeStorage`.

- **PKCE redirect URI is dynamic** — `protocolHandler` calls `server.listen(0, '127.0.0.1')` to get an OS-assigned ephemeral port. The redirect URI (`http://127.0.0.1:<port>/callback`) isn't known until after `listen()` resolves. `startCallbackServer` returns `Promise<string>` for this reason — the resolved string is what gets passed to GitHub's authorization URL.

- **PKCE flow has a 5-minute hard timeout** — `FLOW_TIMEOUT_MS = 5 * 60 * 1000` in `protocolHandler`. Starting a new PKCE flow (`startGitHubPkceLogin`) cancels any in-flight one via `clearPendingPkceFlow`.

- **Duplicate Anthropic provider** — `src/main/orchestration/providers/anthropicAuth.ts` remains the active credential source for the orchestration pipeline. `providers/anthropicAuth.ts` here is the newer credential-store-backed version. The orchestration pipeline does **not** yet read from this store (Phase 5 migration pending). Editing the wrong file has no visible effect on active agent sessions.

- **`gitCredentials.ts` only logs** — `configureGitCredentials` and `clearGitCredentials` emit log lines but do not inject or remove the env var. The actual PTY env injection is in `src/main/pty.ts`, which calls `getGitHubToken()` when spawning a PTY process.

## Credential Store Location

```
<app.getPath('userData')>/auth/credentials.enc
<app.getPath('userData')>/auth/credentials.enc.tmp  ← transient write target
```

On Windows this is typically `%APPDATA%\Ouroboros\auth\`.

## Dependencies

| Module                  | Used by                                              |
| ----------------------- | ---------------------------------------------------- |
| `electron.safeStorage`  | `credentialStore` — encryption/decryption            |
| `electron.app`          | `credentialStore` — userData path resolution         |
| `../web/broadcast`      | `tokenRefreshManager` — emit auth state events       |
| `@shared/types/auth`    | `types.ts`, `providers/githubPkce.ts`                |

**Consumed by:** `src/main/ipc-handlers/` (auth IPC handlers), `src/main/pty.ts` (via `gitCredentials.getGitHubToken`), `src/main/main.ts` (via `startTokenRefreshManager` / `stopTokenRefreshManager`).
