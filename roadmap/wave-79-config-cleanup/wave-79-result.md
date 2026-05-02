# Wave 79 Result Brief — Config Key Cleanup

**Status:** Complete  
**Date:** 2026-05-02  
**Commits:** 6 (master..HEAD on `wave-79-config-cleanup`)

## Summary

Removed 5 deprecated config keys across main-process config schema, app types,
and all consumer code. Zero behavioral regressions in wave-touched tests. Pre-existing
failures in `subagentTracker`, `channelCatalogCoverage`, `TitleBar.menus`,
`mobile-touch-targets`, `ChatWorkbench*`, and `ChangelogDrawer` were present on
`master` before branch creation and are not this wave's responsibility.

## Phases

### Phase A — `windowSessions` removal
- `configSchema.ts`: deleted windowSessions schema block
- `configAppTypes.ts`: removed `windowSessions: WindowSession[]` field + unused import
- `windowManagerSessions.ts`: removed legacy fallback; `restoreWindowSessions` now reads
  only `sessionsData`
- `session/sessionMigration.ts`: deleted `migrateWindowSessionsToSessions` + helpers;
  kept `migrateAgentMonitorSettings`
- `session/sessionStartup.ts`: removed migration call; dropped `ConfigAccess` parameter
  from `initSessionServices()`
- `main.ts`: removed `cfg` object + `setConfigValue` import (no longer needed)
- Tests: rewrote `sessionMigration.test.ts` and `sessionStartup.test.ts`; removed 2
  legacy-path tests from `windowManager.test.ts`; cleaned `configAppTypes.test.ts` fixture

### Phase B — `codemode.routeInternalMcp` removal
- `configSchemaTailExt.ts`: removed `routeInternalMcp` from codemode schema + defaults
- `configAppTypes.ts`: updated `codemode?` type to use `excludeFromMultiplex` (the
  replacement field added in Wave 53l)
- `scopedMcpConfig.ts` + `claudeCodeMode.ts`: removed `routeInternalMcp` from their
  local `CodemodeConfig`/`CodeModeConfig` interfaces
- Tests: stripped `codemode.routeInternalMcp` fixtures from `crashRecovery.test.ts`
  and `codemode.internalMcp.integration.test.ts`

### Phase C — `internalMcp.transport` removal
- `configSchemaTailExt.ts`: deleted entire `internalMcp` schema block
- `configAppTypes.ts`: deleted `internalMcp?: { transport? }` field
- `scopedMcpConfig.ts`: deleted `resolveTransport()` + its `InternalMcpTransport` import;
  removed `transport:` from `deriveRoutingDecision` and `emitMcpSpawnCost` calls
- `internalMcpRoutingPolicy.ts`: removed `transport` from `RoutingInputs`;
  `isRoutedThroughCodemode` now gates on `codemodeEnabled && !ouroborosExcluded` only
- `claudeCodeMode.ts`: removed `InternalMcpConfig` read + `transport:` field from
  `decideInternalMcpRouting` call
- Tests: rewrote `internalMcpRoutingPolicy.test.ts` (removed transport-guard describe block);
  stripped all transport fixtures from `codemode.internalMcp.integration.test.ts` and
  `crashRecovery.test.ts`
- **Behavior change:** `codemode.enabled=true` now always routes ouroboros through codemode;
  the old transport guard (`transport === 'stdio'`) is gone. Correct — standalone is always
  stdio; no branching needed.
- **Follow-on fix:** `claudeCodeMode.test.ts` had two tests that relied on the transport
  gate: "omits ouroboros when transport !== stdio" (deleted) and "skips enable when no
  upstream servers" (updated to use `excludeFromMultiplex: ['ouroboros']` so the
  zero-servers short-circuit path is still exercised).

### Phase D — `InjectOptions.transport` removal
- `internalMcpAutoInject.ts`: deleted `transport?: InternalMcpTransport` field +
  unused `InternalMcpTransport` import
- `internalMcpAutoInject.test.ts`: updated one fixture description; removed `transport`
  property

### Phase E — `InjectOptions.stdioTransportPath` removal (3-step order)
1. `internalMcp/index.ts`: `buildInjectOptions` now passes `standaloneScriptPath`
2. `internalMcpAutoInject.test.ts`: 18 fixture occurrences updated
3. `internalMcpAutoInject.ts`: deleted `stdioTransportPath?` field; removed `?? opts.stdioTransportPath`
   fallback from `buildOuroborosEntry`

## Test summary

All 9 wave-touched test files pass (130 tests). Pre-existing failures on `master` are not
in files this wave touched (confirmed with `git log master..HEAD -- <file>`).

## Lint / typecheck

All modified source files pass ESLint. `tsc --noEmit` exits clean.
