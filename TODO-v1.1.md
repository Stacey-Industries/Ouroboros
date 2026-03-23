# TODO — v1.1 Post-Launch

Items deferred from the v1.0 readiness audit. Tracked by audit issue ID.

## High Priority

- [ ] **[H3] CSS variable unification** — 172 files use legacy vars (`--bg`, `--text`), 20 use new semantic tokens (`--surface-base`, `--text-primary`). Needs canonical decision + migration.
- [ ] **[H4] Hardcoded hex colors** — 116 instances across 30 files break light/high-contrast themes. Replace with CSS variable references.
- [ ] **[H6] AgentChat message list virtualization** — Long sessions render all messages to DOM. Integrate `@tanstack/virtual`. Complex due to variable-height items + streaming.
- [ ] **[H8] Code signing** — macOS requires Apple Developer certificate + notarization. Windows requires EV code signing certificate. Both need CI secret configuration.
- [ ] **[H2] Structured logging migration** — Replace 268 `console.*` calls across 93 files with `electron-log`. Add log levels, file output, rotation. The `no-console` lint rule (warn) is already in place.
- [ ] **[H12] Playwright e2e tests** — Install `@playwright/test` with Electron fixture. Write app launch smoke test and basic navigation tests.
- [ ] **[H13] Update api-contract.md** — Document all 18+ IPC handler domains (only 6 are currently documented).

## Medium Priority

- [ ] **[M4] Update data-model.md** — AppConfig interface is a 7-key subset of actual config.
- [ ] **[M5] Update architecture.md component tree** — References pre-modernization components.
- [ ] **[H7] Extract shared types to src/shared/** — Renderer .d.ts files import from src/main/. Move IPC shapes to @shared/types.
- [ ] **[M18] Remove renderer types from tsconfig.node.json** — Depends on H7.
- [ ] **[M14] Remote crash reporting** — Add Sentry or equivalent for production crash visibility.
- [ ] **[L8] Rename misc handler files** — `miscRegistrars.ts` → domain names, `miscGraphHandlers.ts` → `graphHandlers.ts`.
- [ ] **[L9] Rename webPreloadApis2.ts** — Domain-based name instead of overflow numbering.

## Low Priority

- [ ] **[H9] Evaluate node-pty stable** — Check if `node-pty@^1.1.0` stable works with Electron 33.
- [ ] **[L12] USE_MONACO runtime toggle** — Currently a hardcoded compile-time flag.
- [ ] **[L13] Electron upgrade** — `^33.2.1` → `^34` or `^35` for security patches.
- [ ] **[L14] electron-store v9 migration** — CJS v8 → ESM v9.
- [ ] **[M12] Third-party license attribution** — Generate `THIRD_PARTY_LICENSES` file in build pipeline.
- [ ] **[L15] Screenshots** — Add at least one screenshot to README.

## ESLint Ratchet Plan

Current temporary limits (ratchet back as files are split):
- `max-lines`: 700 → target 300
- `max-lines-per-function`: 60 → target 40

## Pre-existing Type Errors

These existed before the v1.0 audit and are not regressions:
- `extensionStoreMarketplace.ts:284` — `installExtensionFromBuffer` called with positional args, expects options object
- `hooks.ts:180` — missing `getConfigValue` import
- `preload.ts:127` — `rebuildWeb` missing from AppAPI
- `preloadSupplementalApis.ts:248` — OrchestrationAPI missing properties
- `useTheme.ts:60,125,127` — `glassOpacity` and `Theme` type issues
- Various renderer `.d.ts` type mismatches (process boundary coupling)
