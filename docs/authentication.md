# Authentication

Native authentication for three providers: GitHub, Anthropic (Claude), and OpenAI (Codex). Each provider supports different authentication methods depending on their API surface.

## Supported Providers

| Provider  | Auth Methods                    | Credential Type        |
| --------- | ------------------------------- | ---------------------- |
| GitHub    | OAuth Device Flow, CLI import   | OAuth token            |
| Anthropic | API key entry, CLI OAuth import | API key or OAuth token |
| OpenAI    | API key entry, CLI/env import   | API key                |

## How Credentials Are Stored

All credentials are encrypted at rest using Electron's `safeStorage` API, which delegates to the OS keychain:

- **Windows** — DPAPI (Data Protection API)
- **macOS** — Keychain Services
- **Linux** — libsecret (requires `gnome-keyring` or `kwallet`)

Encrypted credentials are persisted to:

```
{userData}/auth/credentials.enc
```

Where `{userData}` is the Electron user data directory:

- **Windows:** `%APPDATA%/ouroboros/`
- **macOS:** `~/Library/Application Support/ouroboros/`
- **Linux:** `~/.config/ouroboros/`

### Encryption Details

Each credential is JSON-serialized, encrypted via `safeStorage.encryptString()`, and stored as a base64 string in the `credentials.enc` JSON file. The file maps provider names to encrypted blobs:

```json
{
  "github": "<base64-encrypted-oauth-token>",
  "anthropic": "<base64-encrypted-api-key>",
  "openai": "<base64-encrypted-api-key>"
}
```

File writes use atomic rename (write to `.tmp`, then rename) to prevent corruption from crashes or power loss.

### Fallback When safeStorage Is Unavailable

On Linux without `libsecret` installed, `safeStorage.isEncryptionAvailable()` returns `false`. In this case, credentials fall back to base64 encoding (not encryption). A warning is logged:

```
[CredentialStore] safeStorage unavailable — falling back to base64 encoding
```

This is **not secure** — install `libsecret` for real encryption. See Troubleshooting below.

---

## GitHub Authentication

GitHub uses the **OAuth Device Flow** (RFC 8628), which is designed for devices that lack a browser or have limited input — but it also works well for desktop apps because it avoids embedding a browser for login.

### Device Flow Walkthrough

1. User clicks "Sign in with GitHub" in Settings > Accounts
2. The app requests a device code from GitHub (`POST https://github.com/login/device/code`)
3. GitHub returns a `user_code` and `verification_uri`
4. The app displays the code and opens `https://github.com/login/device` in the default browser
5. User enters the code on GitHub's website and authorizes the app
6. The app polls GitHub's token endpoint until authorization is confirmed
7. On success, the OAuth token is stored in the credential store and the user's profile is fetched from the GitHub API

### Requested Scopes

The Device Flow requests `read:user user:email` — enough to read the user's profile and email address. No repository access is requested.

### Setting Up a GitHub OAuth App

GitHub Device Flow requires a GitHub OAuth App (not a GitHub App — Device Flow support for GitHub Apps requires additional configuration).

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name:** `Ouroboros`
   - **Homepage URL:** the repository URL
   - **Authorization callback URL:** `http://localhost` (unused by Device Flow, but GitHub requires a value)
4. Click **Register application**
5. Copy the **Client ID** (not the client secret — Device Flow does not use a secret)
6. Create a `.env` file in the project root (if one does not exist) and add:

   ```
   GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxxxxx
   ```

7. The `.env` file is in `.gitignore` — do **not** commit the client ID to the repository

If `GITHUB_CLIENT_ID` is not set, calling `auth:startLogin` with `'github'` throws an error:

```
GITHUB_CLIENT_ID is not set. Add it to your environment variables or .env file before using GitHub authentication.
```

### Cancellation

A user can cancel a pending Device Flow login. The app aborts the polling loop and emits a `{ type: 'cancelled' }` event to the renderer.

---

## Anthropic Authentication

Anthropic supports two credential paths:

### API Key Entry

Users enter an Anthropic API key directly in Settings > Accounts. Keys must start with `sk-ant-`. The key is validated by format only (no network call) and stored immediately.

Get an API key from [console.anthropic.com](https://console.anthropic.com/).

### OAuth Token Import from Claude CLI

Users who have authenticated the Claude CLI (`claude auth login`) have an OAuth token stored at:

```
~/.claude/.credentials.json
```

This file contains:

```json
{
  "claudeAiOauth": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresAt": 1234567890
  }
}
```

The import reads `accessToken`, `refreshToken`, and `expiresAt` from this file. If the `ANTHROPIC_API_KEY` environment variable is set, it takes priority over the file.

There is no third-party OAuth registration process for Anthropic. The app imports tokens that the user established by running `claude auth login` in the CLI.

### Token Refresh

Anthropic OAuth tokens have an expiry (`expiresAt`). The app considers tokens expired 5 minutes before the actual expiry time (buffer for clock skew and network latency). When an Anthropic OAuth credential is expired and has a `refreshToken`, the app can refresh it by calling:

```
POST https://console.anthropic.com/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=<token>
```

The response provides a new `access_token`, optional new `refresh_token`, and `expires_in` (seconds). The credential store is updated atomically.

---

## OpenAI Authentication

OpenAI uses API keys only — no OAuth.

### API Key Entry

Users enter an OpenAI API key in Settings > Accounts. Keys must start with `sk-` and be longer than 10 characters.

Unlike Anthropic, OpenAI keys are validated with a live API call before storage:

```
GET https://api.openai.com/v1/models?limit=1
Authorization: Bearer <api-key>
```

- **200 OK** — key is valid, stored immediately
- **401/403** — key is invalid, rejected with error
- **Network error** — key is stored anyway (user may be offline; the key will be validated on first use)

Get an API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

### Format Requirements

OpenAI API keys must:

- Start with `sk-`
- Be longer than 10 characters

---

## CLI Credential Import

The app can detect and import credentials from existing CLI tools. This is surfaced in the Settings > Accounts UI as a banner: "Existing credentials detected — import them?"

### What Is Detected

| Provider  | Source                      | Credential Type | Detection Path                                                                                                      |
| --------- | --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| GitHub    | `gh` CLI                    | OAuth token     | `hosts.yml` — `%APPDATA%/GitHub CLI/hosts.yml` (Windows) or `~/.config/gh/hosts.yml` (macOS/Linux)                  |
| Anthropic | `ANTHROPIC_API_KEY` env var | API key         | `process.env.ANTHROPIC_API_KEY`                                                                                     |
| Anthropic | Claude CLI                  | OAuth token     | `~/.claude/.credentials.json` → `claudeAiOauth.accessToken`                                                         |
| OpenAI    | `OPENAI_API_KEY` env var    | API key         | `process.env.OPENAI_API_KEY`                                                                                        |
| OpenAI    | Codex CLI                   | API key         | `config.toml` — `%APPDATA%/codex/config.toml` (Windows) or `~/.codex/config.toml` (macOS/Linux) → `api_key = "..."` |

### How Import Works

1. **Detection** (`auth:detectCliCreds`) — scans all sources without importing. Returns `CliCredentialDetection[]` with `available` boolean and `source` description.
2. **Import** (`auth:importCliCreds`) — reads the credential from the detected source, stores it in the encrypted credential store, and broadcasts `auth:stateChanged`.

Detection runs automatically when the Accounts section opens. Import is user-initiated (click "Import").

### Priority

When multiple sources exist for the same provider:

- **Anthropic:** `ANTHROPIC_API_KEY` env var wins over `~/.claude/.credentials.json`
- **OpenAI:** `OPENAI_API_KEY` env var wins over Codex CLI `config.toml`

---

## Token Refresh

Anthropic OAuth tokens are the only credential type that expires and supports refresh. The refresh logic is in `src/main/auth/providers/anthropicAuth.ts`.

### Refresh Behavior

- Tokens are considered expired 5 minutes before `expiresAt` (the `EXPIRY_BUFFER_MS` constant)
- Refresh requires a `refreshToken` in the stored credential
- Refresh calls Anthropic's token endpoint with a 10-second timeout
- On success, the updated credential (new `accessToken`, optionally rotated `refreshToken`, new `expiresAt`) is written to the store
- On failure (network error, invalid refresh token, timeout), the credential remains in the store with `status: 'expired'`

### When Refresh Happens

The background token refresh manager (`src/main/auth/tokenRefreshManager.ts`) runs a check cycle every 60 seconds:

1. On app startup, runs an immediate check
2. Every 60 seconds thereafter, queries all stored credentials
3. If an Anthropic OAuth token is expiring within the 5-minute buffer, triggers a refresh
4. On successful refresh, broadcasts `auth:state-changed` to all renderer windows and web clients
5. On failure, logs a warning — does not crash or remove the credential
6. Stops cleanly on app quit

GitHub tokens don't expire by default, and OpenAI uses non-expiring API keys, so only Anthropic credentials are refreshed.

---

## Troubleshooting

### Linux: "safeStorage unavailable" Warning

**Symptom:** Log message `[CredentialStore] safeStorage unavailable — falling back to base64 encoding`

**Cause:** Electron's `safeStorage` requires `libsecret` on Linux, which provides the Secret Service D-Bus API.

**Fix:** Install the appropriate package:

```bash
# Ubuntu/Debian
sudo apt install libsecret-1-0 gnome-keyring

# Fedora
sudo dnf install libsecret gnome-keyring

# Arch
sudo pacman -S libsecret gnome-keyring
```

A running keyring daemon is also required. GNOME starts `gnome-keyring` automatically; on other desktop environments you may need to start it manually or configure `kwallet`.

### GitHub: "GITHUB_CLIENT_ID is not set"

**Cause:** The `GITHUB_CLIENT_ID` environment variable is not available when the app starts.

**Fix:** Create a `.env` file in the project root with `GITHUB_CLIENT_ID=<your-client-id>`. See "Setting Up a GitHub OAuth App" above.

### GitHub: Device Code Expired

**Symptom:** GitHub login fails with a terminal error during polling.

**Cause:** The user did not enter the device code on GitHub within the time limit (typically 15 minutes).

**Fix:** Start the login flow again. A fresh device code will be issued.

### Anthropic: Token Refresh Fails

**Symptom:** Anthropic auth state shows `'expired'` and does not recover.

**Possible causes:**

- The refresh token has been revoked on Anthropic's side
- Network connectivity issues (the refresh endpoint has a 10-second timeout)
- The `~/.claude/.credentials.json` file was updated externally with a token that has no refresh token

**Fix:** Re-import from the Claude CLI (`claude auth login` to refresh, then import), or enter an API key directly.

### OpenAI: "Invalid API key" on Entry

**Symptom:** Setting an OpenAI API key returns "Invalid API key — authentication failed"

**Cause:** The key was rejected by the OpenAI models endpoint (HTTP 401 or 403).

**Fix:** Verify the key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys). Ensure the key has not been revoked and has appropriate permissions.

### OpenAI: Key Stored Without Online Validation

**Symptom:** Success message includes "Could not reach OpenAI API — key stored without online validation"

**Cause:** The app could not reach `api.openai.com` during validation (network issue, firewall, etc.). The key was stored anyway to avoid blocking offline users.

**Fix:** No action needed if the key is correct. It will be validated on first use by the OpenAI API.

---

## Security Model

### No Plaintext Tokens in Renderer

The renderer process never receives raw tokens or API keys. The `auth:stateChanged` and `auth:loginEvent` IPC events contain only:

- `provider` (string)
- `status` (`'authenticated'` | `'unauthenticated'` | `'expired'` | `'refreshing'`)
- `credentialType` (`'oauth'` | `'apikey'`)
- `user` (name, email, avatar URL — GitHub only)

Token values stay in the main process and are only used for API calls from the main process.

### Encryption at Rest

Credentials are encrypted using the OS keychain via `safeStorage.encryptString()`. The encrypted blobs are stored in `{userData}/auth/credentials.enc`. Even if the file is copied, the blobs cannot be decrypted without the OS-level encryption key tied to the user session.

### Atomic File Writes

All writes to `credentials.enc` use a two-step process:

1. Write to `credentials.enc.tmp`
2. Rename `credentials.enc.tmp` → `credentials.enc`

This prevents partial writes from corrupting the store if the app crashes mid-write.

### GitHub Client ID

The GitHub OAuth App client ID is loaded from the `GITHUB_CLIENT_ID` environment variable at runtime. It is not hardcoded in source. The `.env` file containing it is excluded from version control via `.gitignore`.

Note: OAuth App client IDs are not secret (they are visible in the Device Flow URL), but keeping them out of the repo avoids accidental misuse and makes it easy to swap between development and production OAuth Apps.

---

## Key Files

| File                                                   | Role                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `src/shared/types/auth.ts`                             | Canonical auth type definitions (cross-process)                 |
| `src/main/auth/credentialStore.ts`                     | Encrypted credential storage (safeStorage + file I/O)           |
| `src/main/auth/cliCredentialImporter.ts`               | CLI credential detection and import                             |
| `src/main/auth/providers/githubAuth.ts`                | GitHub Device Flow (RFC 8628)                                   |
| `src/main/auth/providers/anthropicAuth.ts`             | Anthropic API key + OAuth token refresh                         |
| `src/main/auth/providers/openaiAuth.ts`                | OpenAI API key validation and storage                           |
| `src/main/auth/tokenRefreshManager.ts`                 | Background 60s refresh loop for expiring OAuth tokens           |
| `src/main/auth/types.ts`                               | Re-exports from `@shared/types/auth` for main-process consumers |
| `src/main/auth/index.ts`                               | Barrel — re-exports credential store + types                    |
| `src/main/ipc-handlers/auth.ts`                        | IPC handler registration for all `auth:*` channels              |
| `src/preload/preload.ts`                               | Preload bridge — `authAPI` object at lines 264-292              |
| `src/renderer/types/electron-auth.d.ts`                | Renderer-side `AuthAPI` interface definition                    |
| `src/renderer/hooks/useAuth.ts`                        | React hook for auth state and actions                           |
| `src/renderer/components/Settings/AccountsSection.tsx` | Settings UI for account management                              |
