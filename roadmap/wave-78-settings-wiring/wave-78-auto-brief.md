# Wave 78 — Settings Partial Wiring Fixes: Result Brief

**Wave:** 78  
**Branch:** `wave-78-settings-wiring`  
**Date:** 2026-05-02  
**Status:** Complete

---

## What Shipped

### Bundle A — Three live-wiring gaps closed

**Item 1: `webAccessPassword` UI badge**

- New IPC handler `config:hasWebPassword` calls `hasSecureKey('web-access-password')` — returns boolean without exposing the value.
- Preload: `config.hasWebPassword()` added to bridge.
- Renderer type: `hasWebPassword: () => Promise<boolean>` added to `ConfigAPI`.
- `GeneralWebAccessSubsection.tsx` rewritten: `useWebPasswordSet(draftValue)` hook fires on mount and on draft changes; `PasswordSetBadge` component renders inline when set.

**Item 2: `useMcpHost` main-process gate**

- `injectStandaloneMcpEntry` in `main.ts` now reads `getConfigValue('useMcpHost')` and returns early when false.
- Schema default changed `false → true` (preserves existing behavior — the old mcpHost utility was deleted in Wave 60; the only remaining launch path is standalone injection).

**Item 3: `modelSlots.claudeMdGeneration` env**

- `spawnClaude` in `claudeMdGeneratorSupport.ts` accepts optional `extraEnv: Record<string, string>`.
- `claudeMdGenerator.ts` calls `buildProviderEnv('claudeMdGeneration')` and passes the result as `extraEnv`; CLAUDE.md generation now runs with slot-specific `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL`.

### Bundle B — `usageExport` config persistence

**Item 4+5: `usageExport.defaultWindow` and `usageExport.lastDir`**

- New `usageExport` schema shard in `configSchemaTailExt2.ts`: `defaultWindow` (enum, default `'24h'`) + `lastDir` (string, default `''`).
- `AppConfig` updated in both `configAppTypes.ts` (main) and `electron-foundation.d.ts` (renderer).
- `UsageExportPane.tsx` rewritten: `useUsageExport` hook loads prefs on mount (restores `defaultWindow` selection and rebuilds initial path from `lastDir`), persists on successful export via `config.set('usageExport', ...)`.

---

## Commits

| Hash | Message |
|---|---|
| `8cf1c37` | `feat(wave-78): Bundle A — webAccessPassword badge, useMcpHost gate, claudeMdGeneration slot` |
| `6376ebc` | `feat(wave-78/B): usageExport config key + window/lastDir persistence in UsageExportPane` |

---

## Files Changed

| File | Change |
|---|---|
| `src/main/ipc-handlers/config.ts` | Added `config:hasWebPassword` handler; extracted `handleConfigSet` to stay under 40-line limit |
| `src/renderer/types/electron-runtime-apis.d.ts` | Added `hasWebPassword: () => Promise<boolean>` to `ConfigAPI` |
| `src/preload/preload.ts` | Added `hasWebPassword` bridge call |
| `src/renderer/components/Settings/GeneralWebAccessSubsection.tsx` | `useWebPasswordSet` hook + `PasswordSetBadge` component |
| `src/renderer/components/Settings/GeneralWebAccessSubsection.test.tsx` | New — badge absent/present tests |
| `src/main/main.ts` | `useMcpHost` guard in `injectStandaloneMcpEntry` |
| `src/main/configSchemaTail.ts` | `useMcpHost` default `false → true` |
| `src/main/claudeMdGeneratorSupport.ts` | `spawnClaude` accepts `extraEnv` |
| `src/main/claudeMdGenerator.ts` | Passes `buildProviderEnv('claudeMdGeneration')` as `extraEnv` |
| `src/main/configSchemaTailExt2.ts` | `usageExport` schema shard added |
| `src/main/configAppTypes.ts` | `usageExport` added to `AppConfig` |
| `src/renderer/types/electron-foundation.d.ts` | `usageExport` added to renderer `AppConfig` |
| `src/renderer/components/Settings/UsageExportPane.tsx` | Full rewrite — prefs load + persist |
| `src/renderer/components/Settings/UsageExportPane.test.tsx` | Added `mockConfigGet`/`mockConfigSet`; fixed `deps` object call |

---

## Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | Clean |
| ESLint (touched files) | Clean |
| Wave 78 tests (11 tests) | 11/11 passed |
| Pre-existing baseline failures | `subagent.test.ts` 8/13 failing on base — pre-Wave 78, config schema violation in test env |

---

## ADR

See `roadmap/wave-78-settings-wiring/wave-78-decisions.md` for 5 decisions recorded:
- D1: Dedicated `config:hasWebPassword` IPC (no value leakage)
- D2: `useMcpHost` default `false → true` (behavior preservation)
- D3: `extraEnv` passthrough for `spawnClaude` (minimal interface change)
- D4: `usageExport` as an object config key (atomic read/write)
- D5: `ExportHandlerDeps` interface to stay under 4-param ESLint limit

---

## Manual Smoke Gate

*Not applicable — this wave touches internal wiring (IPC handlers, main-process guards, config persistence) and the renderer Settings pane. The Settings pane changes are additive (badge display, prefs restoration) with no new interactive affordances. Full manual smoke checklist applies to waves touching `src/renderer/components/Layout/**` per `manual-smoke-gate.md`.*
