# Wave 78 — Settings Partial Wiring Fixes

**Status:** IN PROGRESS  
**Branch:** `wave-78-settings-wiring`  
**Source plan:** `roadmap/future/settings-partial-wiring-fixes.md`

---

## Context

Five settings items whose UI exists but whose backend behavior is incomplete. All five are small, independent fixes. Sourced from the 2026-05-01 settings audit (Section C, Parts A+B).

---

## Goal

Wire all five items so that every setting in the Settings panel actually does what its UI implies.

---

## Locked Decisions

ADR: `roadmap/wave-78-settings-wiring/wave-78-decisions.md`

---

## Scope

### In scope
1. `webAccessPassword` — IPC `config:hasWebPassword` + UI badge in `GeneralWebAccessSubsection`
2. `useMcpHost` — gate `injectStandaloneMcpEntry` in `main.ts` on `getConfigValue('useMcpHost')`
3. `modelSlots.claudeMdGeneration` — pass `buildProviderEnv('claudeMdGeneration')` into `spawnClaude` env
4. `usageExport.defaultWindow` — add config key + read in `UsageExportPane` on mount
5. `usageExport.lastDir` — add config key + persist/restore export directory

### Out of scope
- `routerSettings.layer3Enabled` (deliberate stub, KEEP)
- CodeMode MCP server names (one-shot provisioning, KEEP)
- Any other settings cleanup

---

## Phases

| Phase | Description | Files |
|-------|-------------|-------|
| A | Bundle A: items 1, 2, 3 | `ipc-handlers/config.ts`, `preload.ts`, `electron-runtime-apis.d.ts`, `GeneralWebAccessSubsection.tsx`, `main.ts`, `claudeMdGeneratorSupport.ts` |
| B | Bundle B: items 4, 5 | `configSchemaTailExt2.ts`, `UsageExportPane.tsx`, `UsageExportPane.test.tsx` |
| C | Wrap-up: lint, typecheck, tests | — |

---

## Phase Ordering

A → B → C (A and B are independent; C requires both)

---

## Risks

- `webAccessPassword`: config handler strips password before renderer sees it, so we need a dedicated IPC channel (`config:hasWebPassword`) that calls `hasSecureKey`. Must not leak the value.
- `useMcpHost`: The old `mcpHost/` utility process was deleted in Wave 60. The remaining "launch path" is `injectStandaloneMcpEntry`. Gating it on `useMcpHost` gives the toggle a real effect. Correct interpretation: `useMcpHost=false` → skip MCP injection entirely.
- `modelSlots.claudeMdGeneration`: The `spawnClaude` helper already takes `env` but not yet from `buildProviderEnv`. The slot value is only meaningful when a custom provider is configured (`value` contains `provider:model`). If empty, `buildProviderEnv` returns `{}` which is harmless.
- Bundle B: `usageExport` is a new top-level config key. Wave 79 deletes stale keys but won't touch `usageExport.*` (new keys). No conflict expected.

---

## Test Coverage by Phase

| Phase | Tests |
|-------|-------|
| A | `config.test.ts` (hasWebPassword channel), `GeneralWebAccessSubsection` unit snapshot |
| B | `UsageExportPane.test.tsx` (window default + lastDir persistence) |
| C | Full suite |

---

## Acceptance Criteria

1. Settings > General > Web Access: after saving a password, a "✓ Password set" badge appears next to the Password field without retyping.
2. Settings > General > Developer Flags: toggling "MCP Host" to OFF causes `injectStandaloneMcpEntry` to skip (log line visible).
3. Settings > Agent Profiles > Model Slots: the `claudeMdGeneration` slot value is passed as env to CLAUDE.md generation spawns.
4. Settings > Files > Export Usage: opening the pane shows the last-used time window (not always "24h").
5. Settings > Files > Export Usage: re-opening the pane shows the last export directory pre-filled in the output path.

---

## Verification

| Phase | Observation point | Path to it | What "working" looks like |
|-------|------------------|------------|--------------------------|
| A-1 | Settings > Web Access password field | `config:hasWebPassword` IPC → `GeneralWebAccessSubsection` badge render | "✓ Password set" badge appears after first save; absent before |
| A-2 | App startup log | `main.ts:injectStandaloneMcpEntry` → early return | `[internal-mcp] useMcpHost disabled — skipping injection` in log when flag is false |
| A-3 | Internal — no observation point | `claudeMdGenerator.ts` → `spawnClaude(env)` | Env vars from slot passed; no user-visible change unless custom provider configured |
| B-4 | Settings > Export Usage pane | `config:get usageExport` → `UsageExportPane` mount | Re-opening pane shows previously-selected window, not always "24h" |
| B-5 | Settings > Export Usage pane | `config:set usageExport.lastDir` → pane mount read | Re-opening pane pre-fills output path with last export directory |

---

## Files the Next Agent Should Read

- `src/main/ipc-handlers/config.ts` — where to add `config:hasWebPassword` handler
- `src/main/auth/secureKeyStore.ts` — `hasSecureKey` API
- `src/renderer/components/Settings/GeneralWebAccessSubsection.tsx` — where to add badge
- `src/main/main.ts:injectStandaloneMcpEntry` — where to add `useMcpHost` gate
- `src/main/claudeMdGeneratorSupport.ts:spawnClaude` — where to add env passthrough
- `src/main/ptyEnv.ts:buildProviderEnv` — env builder to call
- `src/renderer/components/Settings/UsageExportPane.tsx` — Bundle B target
- `src/main/configSchemaTailExt2.ts` — where to add `usageExport` schema key

---

## Note to the Implementer

Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

For A-3 (modelSlots wiring): the observation point is internal — no runtime observation possible without a configured custom provider. Document this explicitly.

---

## Orchestrator Dispatch Checklist

- [x] Plan written
- [x] ADR drafted
- [ ] Phase A implemented and committed
- [ ] Phase B implemented and committed
- [ ] Phase C: lint + typecheck + full test suite clean
- [ ] Result brief written
- [ ] /review run and filed
