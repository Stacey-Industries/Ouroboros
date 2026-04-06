<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
The `credentialStore.test.ts` uses `vi.doMock()` + `loadStore()` instead of the usual top-level `vi.mock()`. This is because `credentialStore` holds a module-level in-memory cache — top-level mocking reuses the same module instance across tests, causing state leakage. The `vi.resetModules()` + dynamic import pattern gives each test a fresh module with a clean cache. This is a pattern worth preserving exactly.
`─────────────────────────────────────────────────`

# src/main/auth/__tests__/ — Auth subsystem unit tests

Vitest unit tests for the three auth modules: credential store, auth providers (Anthropic/GitHub/OpenAI), and CLI credential importers.

## Files

| File | Tests |
|------|-------|
| `credentialStore.test.ts` | `getCredential`, `setCredential`, `deleteCredential`, `getAllAuthStates`, `hasCredential` — encryption, atomic writes, missing-file fallback, `safeStorage` unavailable path |
| `providers.test.ts` | `anthropicAuth`, `githubAuth`, `openaiAuth` — token storage, logout, env-var fallback, GitHub Device Flow error paths |
| `cliCredentialImporter.test.ts` | `detectExistingCredentials`, `importClaudeCliCredentials`, `importGitHubCliCredentials`, `importOpenAiCliCredentials` — file parsing, env-var path resolution |

## Critical Pattern: Module Isolation in `credentialStore.test.ts`

`credentialStore` holds module-level mutable state (in-memory read cache). Top-level `vi.mock()` reuses the same module instance across all tests — state leaks between them. The fix is `vi.resetModules()` in `beforeEach` + `vi.doMock()` inside `loadStore()` + a `loadStore()` factory that dynamic-imports fresh exports each time.

```ts
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

// Each test calls:
const { getCredential } = await loadStore(); // fresh module, clean cache
```

**Do not convert `credentialStore.test.ts` to top-level `vi.mock()`** — tests will silently share the in-memory cache and produce false positives.

## Env Var Helpers

All three files use the same `savedEnv` / `setEnv` / `clearEnv` / `restoreEnv` pattern, called in `afterEach`. Saves and restores `process.env` keys to prevent cross-test pollution.

The `// eslint-disable-line security/detect-object-injection` comment on `process.env[key]` bracket access is intentional — `security/detect-object-injection` is set to `error` in this project, and `process.env` is a false positive for that rule. Do not remove the comments.

## Mock Layout Convention

`vi.mock()` calls must appear before imports. Vitest hoists them, but placing them after imports is confusing. Keep the section order from `providers.test.ts`:

```
// 1. Mocks (vi.mock)
// 2. Imports
// 3. Typed mock references (vi.mocked())
// 4. Env var helpers
// 5. Setup (beforeEach / afterEach)
// 6. Test suites
```

## Dependencies

| Mocked module | Real location |
|---|---|
| `../../auth/credentialStore` | `src/main/auth/credentialStore.ts` |
| `../../logger` | `src/main/logger.ts` |
| `electron` (`safeStorage`, `app`) | Electron built-in |
| `fs/promises` | Node built-in |
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# src/main/auth/__tests__/ — Auth subsystem unit tests

Vitest unit tests for the three auth modules: credential store, auth providers (Anthropic/GitHub/OpenAI), and CLI credential importers.

## Files

| File                          | Tests                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `credentialStore.test.ts`     | `getCredential`, `setCredential`, `deleteCredential`, `getAllAuthStates`, `hasCredential` — encryption, atomic writes, missing-file fallback |
| `providers.test.ts`           | `anthropicAuth`, `githubAuth`, `openaiAuth` — token storage, logout, env-var fallback, GitHub OAuth flow |
| `cliCredentialImporter.test.ts` | `detectExistingCredentials`, `importClaudeCliCredentials`, `importGitHubCliCredentials`, `importOpenAiCliCredentials` — file parsing, env-var path resolution |

## Critical Pattern: Module Isolation in credentialStore.test.ts

`credentialStore` has module-level mutable state (in-memory cache). Top-level `vi.mock()` reuses the same module instance across tests — state leaks. The fix: `vi.resetModules()` + `vi.doMock()` + a `loadStore()` factory function that returns fresh exports per test.

```ts
// Pattern: fresh module per test
beforeEach(async () => {
  vi.resetModules();
  store = await loadStore(); // re-imports module after fresh doMock()
});
```

Do **not** convert `credentialStore.test.ts` to top-level `vi.mock()` — tests will silently share state and produce false positives.

## Env Var Helpers

All three files define the same `savedEnv` / `setEnv` / `clearEnv` / `restoreEnv` pattern in `afterEach`. This saves and restores `process.env` keys to prevent test pollution. The `// eslint-disable-line security/detect-object-injection` comment on `process.env[key]` accesses is intentional — suppress, don't remove.

## Mock Layout Convention

`vi.mock()` calls must appear **before** imports. Vitest hoists them to the top of the compiled output, but placing them after imports is confusing. Keep the `// Mocks → Imports → Typed mock references` section order used in `providers.test.ts`.

## Dependencies

| Mocked module              | Real module location              |
| -------------------------- | --------------------------------- |
| `../../auth/credentialStore` | `src/main/auth/credentialStore.ts` |
| `../../logger`             | `src/main/logger.ts`              |
| `electron` (safeStorage, app) | Electron built-in               |
| `fs/promises`              | Node built-in                     |
