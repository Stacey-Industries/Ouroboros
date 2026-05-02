# Wave 78 review — mechanical gap check

**Inputs resolved:**
- Plan: `roadmap/wave-78-settings-wiring/waveplan-78.md`
- Diff range: `7cd42e2..HEAD` (3 commits: 8cf1c37, 6376ebc, 85e916d)
- Graph: **fallback** — `servers.ouroboros.index_status` unavailable; all traces done via grep + import-following. Check 1 and Check 3 findings marked `(fallback trace)`.
- Run timestamp: 2026-05-02T19:15Z

---

## Check 1: Forward-trace

- Change sites traced: 10
- Paths reaching production consumer: 10
- Paths flagged as dead: 0

**Traces (fallback trace):**

1. **`handleConfigSet`** (`src/main/ipc-handlers/config.ts:126`) — private function, called at line 156 inside `createCoreHandlers()` array → `registerHandlers(createCoreHandlers(), ...)` at line 294 → `registerConfigHandlers` (exported, called by main process). Production consumer: IPC channel `config:set`. Clean.

2. **`config:hasWebPassword` handler** (`src/main/ipc-handlers/config.ts:155`) — in `createCoreHandlers()` → `registerConfigHandlers` → `src/main/ipc.ts` → Electron IPC. Production consumer: preload `hasWebPassword()` → `GeneralWebAccessSubsection.tsx:useWebPasswordSet`. Clean.

3. **`useWebPasswordSet`** (`src/renderer/components/Settings/GeneralWebAccessSubsection.tsx:15`) — called at line 101 inside `WebAccessSubsection`. Production consumer: `WebAccessSubsection` rendered at `GeneralSection.tsx:45`. Clean.

4. **`PasswordSetBadge`** (`src/renderer/components/Settings/GeneralWebAccessSubsection.tsx:28`) — rendered at line 51 inside `PasswordField`. Production consumer: `PasswordField` called inside `WebAccessSubsection`. Clean.

5. **`WebAccessSubsection`** (exported, `src/renderer/components/Settings/GeneralWebAccessSubsection.tsx:100`) — imported and rendered at `src/renderer/components/Settings/GeneralSection.tsx:9,45`. Production consumer confirmed. Clean.

6. **`useMcpHost` gate in `injectStandaloneMcpEntry`** (`src/main/main.ts:112`) — `injectStandaloneMcpEntry` called at line 135 via `runStartupStep`. The guard reads `getConfigValue('useMcpHost')`. Production consumer: startup path executed at app launch. `useMcpHost` is an existing config key with a UI toggle in `SettingsDeveloperFlagsSubsection.tsx:34`. Clean.

7. **`spawnClaude` new `extraEnv` parameter** (`src/main/claudeMdGeneratorSupport.ts:285`) — added as optional 4th parameter. Existing callers (`moduleSummarizer.ts:319`, `chatTitleDerivation.ts:211`) omit it (backward-compatible). New caller `claudeMdGenerator.ts:128` passes `slotEnv` as 4th arg. Production consumer: `spawnClaudeWithRetry` called at line 154 by `generateClaudeMd`. Clean; no silent drop.

8. **`buildProviderEnv('claudeMdGeneration')` call** (`src/main/claudeMdGenerator.ts:124`) — `slotEnv` passed to `spawnClaude(prompt, model, cwd, slotEnv)` at line 128. Inside `spawnClaude`, spread into `env: { ...process.env, OUROBOROS_INTERNAL: '1', ...slotEnv }` at line 293. Production consumer: child process env. Clean.

9. **`persistExportPrefs`** (`src/renderer/components/Settings/UsageExportPane.tsx:62`) — called at line 93 inside `useExportHandler` on successful export. Calls `window.electronAPI.config.set('usageExport', ...)`. Production consumer: persisted config read on next mount. Clean.

10. **`useExportHandler` + `ExportHandlerDeps`** (`src/renderer/components/Settings/UsageExportPane.tsx:74`) — called at line 124 inside `useUsageExport`. Result `handleExport` returned from hook and wired to button `onClick` in `UsageExportPaneActions`. Production consumer: button click. Clean. (`ExportHandlerDeps` is an interface — not a runtime export; no consumer check needed.)

---

## Check 2: Plan universal-quantifier cross-reference

- Universals found in plan: 2
- Universals where diff covers all instances: 2
- Universals flagged as narrowed: 0

**Analysis:**

1. **Quote:** "Wire all five items so that every setting in the Settings panel actually does what its UI implies."
   - **Noun:** the five in-scope settings (enumerated in the Scope section as items 1–5)
   - The plan itself bounds this universal explicitly: the Scope section names exactly 5 items in-scope and 2 items explicitly out-of-scope. This is a bounded enumeration, not an open-ended universal across all settings. Diff touches all 5. No flag.

2. **Quote:** "Wave 79 deletes stale keys but won't touch `usageExport.*` (new keys). No conflict expected."
   - This is a coordination claim, not a universal quantifier requiring diff coverage. No flag.

---

## Check 3: Export audit

- New exports added: 2
- Exports with production consumers: 2
- Exports flagged as dead: 0

**Traces (fallback trace):**

1. **`spawnClaude`** at `src/main/claudeMdGeneratorSupport.ts:281`
   - Pre-wave this function was already exported; the wave modified its signature (added optional `extraEnv` param). This is a parameter addition to an existing export, not a net-new export. Included here for completeness.
   - Non-test consumers: `src/main/claudeMdGenerator.ts`, `src/main/contextLayer/moduleSummarizer.ts`, `src/main/agentChat/chatTitleDerivation.ts` (dynamic import). Production consumers: 3. Clean.

2. **`WebAccessSubsection`** at `src/renderer/components/Settings/GeneralWebAccessSubsection.tsx:100`
   - Non-test consumer: `src/renderer/components/Settings/GeneralSection.tsx:9` (import) + line 45 (render). Production consumer: 1. Clean.

No new exports with zero production consumers.

---

## Verdict

**PASS**

All three checks ran clean. Check 1 traced 10 change sites to production consumers with no silent drops or dead ends; the new `extraEnv` parameter flows end-to-end from `buildProviderEnv` → `spawnClaude` → child process env without any intermediate node dropping it silently. Check 2 found 2 universal-quantifier phrases; both resolve to bounded enumerations fully covered by the diff. Check 3 found 2 new/modified exports, both with confirmed production consumers.
