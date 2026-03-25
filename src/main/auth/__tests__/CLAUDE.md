<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
The `// eslint-disable-line security/detect-object-injection` pattern on `process.env[key]` is worth preserving in these tests. The `security/detect-object-injection` rule flags bracket-notation object access as a potential prototype pollution vector — but `process.env` is a flat string map with no prototype methods that would be dangerous, making this a known false positive in test helpers. The root CLAUDE.md notes this ESLint rule is set to `error` severity, so comments can't be removed without triggering CI failures.
`─────────────────────────────────────────────────`

The CLAUDE.md covers:
- **Module isolation pattern** for `credentialStore` — the most non-obvious thing in the directory
- **Section order convention** for mock/import layout (vitest hoisting requirement)
- **Env var helpers** and the ESLint suppression comment
- **Dependency table** mapping mocked paths to real module locations
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
