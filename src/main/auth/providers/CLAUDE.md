<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
The most important non-obvious thing captured here is the **duplicate Anthropic provider** — `orchestration/providers/anthropicAuth.ts` is the active one for the orchestration pipeline, while this file is the newer store-backed version awaiting a Phase 5 migration. Without this note, any future agent touching Anthropic auth could edit the wrong file and see no visible effect.

The **soft-pass network failure in OpenAI** (`handleNetworkError` returns `valid: true`) is another subtle behavior: the comment in the code explains the intent (offline tolerance), but the CLAUDE.md surfaces it as a named design decision so it doesn't get "fixed" by someone who assumes it's a bug.
`─────────────────────────────────────────────────`

The CLAUDE.md is written. Key decisions made:

- **Two-flow GitHub section** clearly separates Device Flow vs PKCE paths and their event sequences — the callback-based progress model is the most surprising pattern here.
- **Anthropic dual-credential** section explains how one provider key holds two credential shapes and why the expiry buffer exists.
- **OpenAI soft-pass** is called out explicitly so it isn't mistaken for a bug.
- **Duplicate Anthropic provider warning** is front-and-center — easy to hit the wrong file.
- The pure-function note on `githubPkce.ts` signals that token exchange completing happens in `protocolHandler`, preventing confused edits.
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# src/main/auth/providers/ — Authentication provider implementations

One file per external service. Each provider handles credential validation, storage, state queries, and logout via the shared credential store.

## Files

| File               | Role                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `githubAuth.ts`    | GitHub OAuth — Device Flow (web-mode fallback) + Authorization Code + PKCE (Electron)        |
| `githubPkce.ts`    | Pure PKCE helpers — challenge generation, authorization URL building, token exchange          |
| `anthropicAuth.ts` | Anthropic — direct API key entry (`sk-ant-*`) **or** OAuth token with refresh                |
| `openaiAuth.ts`    | OpenAI — API key validation (live network check) + storage                                   |

## Uniform Conventions

- All providers import `getCredential` / `setCredential` / `deleteCredential` from `../credentialStore` — never touch OS keychain directly.
- `PROVIDER` const string (`'github'`, `'anthropic'`, `'openai'`) is the credential store key — must match exactly.
- Mutation functions return `{ success: boolean; error?: string }`.
- State query functions return `AuthState` from `../types`.
- Types live in `../types` — do not redeclare them locally.

## GitHub — Two Flows

**Device Flow** (`startGitHubLogin`) — presents a user code the user types at github.com/device. Used as the web-mode fallback.

**PKCE** (`startGitHubPkceLogin`) — opens the browser via `shell.openExternal`, receives the redirect via a local callback server in `../protocolHandler`. This is the primary Electron path.

Both functions call `cancelGitHubLogin()` first — starting a new flow always cancels any in-flight one.

Progress is delivered via a `GitHubLoginCallback` rather than promises. Event sequence:

- Device Flow: `device_code` → `authenticated` | `error` | `cancelled`
- PKCE: `browser_opened` → `authenticated` | `error` | `cancelled`

## GitHub — Module-Level State

`activeAbort` and `activeTimer` are module-level singletons — only one GitHub login flow is active at a time. `cleanup()` must be called in every terminal path (success, error, cancel) to clear both.

The Device Flow poll loop respects GitHub's `slow_down` error: adds `SLOW_DOWN_PENALTY_MS` (5 s) to the poll interval per RFC requirements. `authorization_pending` continues normally. Any other error is terminal.

## Anthropic — Dual Credential Types

`getAnthropicAuthState` handles both `apikey` and `oauth` credential types stored under the same provider key. API key path: format-only validation (`sk-ant-` prefix), no network call. OAuth path: expiry is reported `EXPIRY_BUFFER_MS` (5 min) early so callers can refresh before the token actually expires — status becomes `'expired'` with time still on the clock.

**Important**: There is a legacy Anthropic provider at `src/main/orchestration/providers/anthropicAuth.ts` that is still in use by the orchestration pipeline. This file is the newer, credential-store-backed version. Phase 5 will migrate the orchestration pipeline to read from here.

## OpenAI — Live Validation on Set

`setOpenAiApiKey` validates against `GET /v1/models?limit=1` before storing. Network failures are a **soft pass** — the key is stored with a warning, not rejected, to avoid blocking offline users. HTTP 401/403 is a hard fail. The `openai-organization` header from a successful response is surfaced in `ValidationResult.orgName` for display.

## githubPkce.ts — Pure Functions Only

No side effects, no credential store access, no Electron imports. The token exchange (`exchangeCodeForToken`) is called from `../protocolHandler` after the redirect arrives — not from `githubAuth.ts` directly. Scopes are imported from `@shared/types/auth` (`GITHUB_PKCE_SCOPES`) — do not hardcode them here.

## GitHub OAuth App Credentials

The OAuth client ID and secret are bundled in `githubAuth.ts` (standard practice for native desktop apps — these are not server secrets). Override via `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` env vars for custom deployments or CI.

## Dependencies

| Import                                   | Used by                  |
| ---------------------------------------- | ------------------------ |
| `../credentialStore`                     | all providers            |
| `../types`                               | all providers            |
| `../protocolHandler`                     | `githubAuth.ts` (PKCE)   |
| `@shared/types/auth` (`GITHUB_PKCE_SCOPES`) | `githubPkce.ts`       |
| `node:crypto` (`randomBytes`, `createHash`) | `githubPkce.ts`       |
| `electron.shell` (`openExternal`)        | `githubAuth.ts` (PKCE)   |
