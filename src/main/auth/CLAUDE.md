<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
The `credentialStore` uses a write-through cache pattern (`cache = store` at the end of `writeStore`) rather than invalidating on write. This means reads after writes are always served from the in-process object — zero disk I/O after the first load. The trade-off is that two processes can't share this store safely, which is fine here since only the main process touches it.
`─────────────────────────────────────────────────`

Key corrections from the previous version:

- **`tokenRefreshManager` description fixed** — it was documented as "proactively refreshes Anthropic OAuth" but the code explicitly skips Anthropic (`if (provider === 'anthropic') return false`) because CLI-managed tokens are refreshed by the CLI itself. The manager currently does nothing at runtime.
- **`gitCredentials.ts` role clarified** — the old description implied it did env injection; it only logs. The actual injection is `pty.ts` calling `getGitHubToken()` directly.
- Everything else (atomic writes, PKCE ephemeral port, `safeStorage` silent fallback, orchestration duplicate) was accurate and retained.
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# src/main/auth/ — Multi-provider authentication subsystem

Manages credentials for GitHub (PKCE + Device Flow), Anthropic (API key + OAuth), and OpenAI (API key). Credentials are encrypted via Electron's `safeStorage` and persisted to `<userData>/auth/credentials.enc`.

## Files

| File                       | Role                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `credentialStore.ts`       | Encrypted credential persistence — `safeStorage` encryption, atomic writes, in-process read cache             |
| `protocolHandler.ts`       | Ephemeral localhost HTTP server that receives the GitHub PKCE OAuth redirect and completes token exchange      |
| `tokenRefreshManager.ts`   | Background poller (60 s) — currently no-ops for all providers (see Gotchas); wired for future GitHub refresh  |
| `cliCredentialImporter.ts` | Reads existing credentials from CLI tools (gh CLI, Claude CLI, Codex, env vars) — detect-only vs import       |
| `gitCredentials.ts`        | Bridges GitHub token to PTY env logging — **logging shim only**, actual injection is in `src/main/pty.ts`     |
| `types.ts`                 | Re-exports from `@shared/types/auth` — backward-compat shim, no local declarations                            |
| `index.ts`                 | Barrel — exports from `credentialStore`, `cliCredentialImporter`, `tokenRefreshManager`, and `types` only     |
| `providers/`               | Per-provider credential logic — see `providers/CLAUDE.md`                                                     |
| `__tests__/`               | Vitest unit tests — see `__tests__/CLAUDE.md`                                                                  |

## Key Patterns

**All credential I/O goes through `credentialStore`** — never call `safeStorage` or touch the credentials file from provider or consumer code.

**Atomic writes** — `writeStore` writes to `credentials.enc.tmp` then renames over `credentials.enc`. Prevents corrupt state on interrupted writes.

**In-process read cache** — module-level `let cache: EncryptedStore | null`. Populated on first read, updated on every write. Never expires during the process lifetime. External edits to the file on disk are invisible until app restart.

**Detection vs import split in `cliCredentialImporter`** — `detectExistingCredentials` is read-only (no store writes, returns availability + source string). The `import*Credentials` functions return `Credential` objects that the caller is responsible for passing to `setCredential`. Keep these concerns separate.

## Gotchas

- **`tokenRefreshManager` currently refreshes nothing** — `needsRefresh` skips Anthropic explicitly (`if (provider === 'anthropic') return false`) because Claude CLI manages its own OAuth tokens; the IDE has no `client_id` to refresh them. GitHub OAuth tokens have no `expiresAt` by default, so `isTokenExpiringSoon` returns false. OpenAI uses API keys (non-OAuth). The manager runs but all providers pass through without action. `refreshAnthropicToken` is imported but unreachable in practice.

- **`safeStorage` fallback is silent** — when `safeStorage.isEncryptionAvailable()` is false (CI, headless, some Linux setups), credentials are stored as base64 only (no encryption). The only signal is a `warn` log. Test environments should mock `safeStorage`.

- **PKCE redirect URI is dynamic** — `protocolHandler` calls `server.listen(0, '127.0.0.1')` to get an OS-assigned ephemeral port. The redirect URI (`http://127.0.0.1:<port>/callback`) isn't known until after `listen()` resolves. `startCallbackServer` returns `Promise<string>` for this reason — the resolved string is what gets passed to GitHub's authorization URL.

- **PKCE flow has a 5-minute hard timeout** — `FLOW_TIMEOUT_MS = 5 * 60 * 1000` in `protocolHandler`. Starting a new PKCE flow cancels any in-flight one via `clearPendingPkceFlow`.

- **Duplicate Anthropic provider** — `src/main/orchestration/providers/anthropicAuth.ts` remains the active credential source for the orchestration pipeline. `providers/anthropicAuth.ts` here is the credential-store-backed version. The orchestration pipeline does **not** yet read from this store (Phase 5 migration pending). Editing the wrong file has no visible effect on active agent sessions.

- **`gitCredentials.ts` only logs** — `configureGitCredentials` and `clearGitCredentials` emit log lines but do not inject or remove the env var. The actual PTY env injection is in `src/main/pty.ts`, which calls `getGitHubToken()` directly when spawning.

## Credential Store Location

```
<app.getPath('userData')>/auth/credentials.enc
<app.getPath('userData')>/auth/credentials.enc.tmp  ← transient write target
```

On Windows this is typically `%APPDATA%\Ouroboros\auth\`.

## Dependencies

| Module                 | Used by                                           |
| ---------------------- | ------------------------------------------------- |
| `electron.safeStorage` | `credentialStore` — encryption/decryption         |
| `electron.app`         | `credentialStore` — userData path resolution      |
| `../web/broadcast`     | `tokenRefreshManager` — emit auth state events    |
| `@shared/types/auth`   | `types.ts`, `providers/githubPkce.ts`             |

**Consumed by:** `src/main/ipc-handlers/` (auth IPC handlers), `src/main/pty.ts` (via `gitCredentials.getGitHubToken`), `src/main/main.ts` (via `startTokenRefreshManager` / `stopTokenRefreshManager`).
