# TODO — v1.1 Post-Launch

Items deferred from the v1.0 readiness audit. Tracked by audit issue ID.

## High Priority

- [x] **[H3] CSS variable unification** — Migrated 196 files from legacy vars to semantic tokens. Zero legacy refs remain.
- [x] **[H4] Hardcoded hex colors** — Replaced with CSS variable references across all components.
- [x] **[H6] AgentChat message list virtualization** — @tanstack/react-virtual with dynamic measurement, streaming message outside virtualizer.
- [x] **[H8] Code signing** — Documentation created at `docs/code-signing-setup.md`. Certificate procurement is a human task.
- [x] **[H2] Structured logging migration** — 267 console.\* calls replaced with electron-log across 92 files. 5 files deferred (pre-existing max-lines violations).
- [x] **[H12] Playwright e2e tests** — Installed with Electron fixture, smoke tests, basic navigation tests.
- [x] **[H13] Update api-contract.md** — Expanded from 6 to 31 IPC domains, 100% handler coverage.

## Medium Priority

- [x] **[M4] Update data-model.md** — AppConfig expanded from 7 to 50+ fields with all sub-interfaces.
- [x] **[M5] Update architecture.md component tree** — Rewritten for 20 feature folders, three-layer bootstrap.
- [x] **[H7] Extract shared types to src/shared/** — Created src/shared/types/ and src/shared/ipc/. Zero cross-boundary imports.
- [x] **[M18] Remove renderer types from tsconfig.node.json** — Resolved via shared types extraction.
- [ ] **[M14] Remote crash reporting** — Deferred. Requires Sentry account/DSN setup.
- [x] **[L8] Rename misc handler files** — graphHandlers.ts, lspHandlers.ts renamed. All imports updated.
- [x] **[L9] Rename webPreloadApis2.ts** — Renamed to webPreloadApisSupplemental.ts.

## Low Priority

- [x] **[H9] Evaluate node-pty stable** — Kept beta 1.2.0-beta.11. Stable 1.1.0 predates Electron 33 ABI.
- [ ] **[L12] USE_MONACO runtime toggle** — Deferred. electron-foundation.d.ts needs file split first (347 lines > 300 limit).
- [ ] **[L13] Electron upgrade** — Deferred to v1.2. Native module ABI risk across better-sqlite3, node-pty, web-tree-sitter.
- [ ] **[L14] electron-store v9 migration** — Deferred to v1.2 (coupled with Electron upgrade).
- [x] **[M12] Third-party license attribution** — THIRD_PARTY_LICENSES generated (7,171 lines).
- [ ] **[L15] Screenshots** — Deferred. Requires visual capture of running app.

## Pre-existing Type Errors

Fixed in v1.1:

- [x] `extensionStoreMarketplace.ts:284` — Wrapped positional args in options object
- [x] `hooks.ts:180` — Added getConfigValue import
- [x] `preload.ts:127` — Added rebuildWeb to appAPI
- [x] `preloadSupplementalApis.ts:248` — Trimmed OrchestrationAPI to match actual handlers
- [x] `useTheme.ts:60,125,127` — Added glassOpacity, imported Theme type

302 pre-existing type errors remain (web-tree-sitter types, test mocks, useRef readonly, Fuse.js namespace, LSP client types). See commit fbfae3f for full categorization.

## Deferred to v1.2

- L13: Electron ^33 → ^34/35 (native module ABI risk)
- L14: electron-store CJS → ESM (coupled with Electron upgrade)
- M14: Sentry crash reporting (requires account setup)
- L12: Monaco runtime toggle (needs electron-foundation.d.ts split)
- L15: README screenshots
