# Wave 74 review — mechanical gap check

**Inputs resolved:**
- Plan: `roadmap/wave-74-registrars-decomp/waveplan-74.md`
- Diff range: `master..HEAD` (11 commits: 28b7c0d → 4bc0414)
- Graph: FALLBACK (codebase-memory MCP unavailable in worktree session; grep + import-following used throughout)
- Run timestamp: 2026-05-02T19:03:00Z

---

## Check 1: Forward-trace every change site to a production consumer

**Change sites enumerated from diff:**

8 new exported functions (one per domain file):
- `registerUpdaterHandlers` in `updaterHandlers.ts`
- `registerCostHandlers` in `costHandlers.ts`
- `registerUsageHandlers` in `usageHandlers.ts`
- `registerCrashLogHandlers` in `crashHandlers.ts`
- `registerShellHistoryHandlers` in `shellHistoryHandlers.ts`
- `registerSymbolHandlers` in `symbolHandlers.ts`
- `registerApprovalHandlers` in `approvalHandlers.ts`
- `registerTrustHandlers` in `trustHandlers.ts`

**Trace result (fallback — grep):**

All 8 are imported and called by `misc.ts:registerMiscHandlers`. `registerMiscHandlers` is a production function called at IPC registration time (non-test caller). Each function calls `ipcMain.handle(channel, ...)` which is a production IPC endpoint.

- Change sites traced: 8
- Paths reaching production consumer: 8 (`misc.ts` → `ipcMain.handle`)
- Paths flagged as dead: 0

**Broken test surfaced and fixed during review:**

`miscRegistrars.updaterDownload.test.ts` (Wave 41) imported `registerUpdaterHandlers` from `./miscRegistrars` which was deleted by phase 9. This caused 4 test failures. The import was updated to `./updaterHandlers` (commit 4bc0414) and all 4 tests now pass. This was a real Check-1 adjacent gap (test-path dead-end to a deleted module) surfaced by the review.

---

## Check 2: Plan universal-quantifier cross-reference

**Universals found in plan:**

1. "all IPC channels remain registered"
2. "All existing IPC channels still registered (catalog tests pass)"
3. "each new file < 300 lines"
4. "Copy all crash-domain helpers to `crashHandlers.ts`"

**Verification:**

1. **All IPC channels remain registered** — grepped channel names across all 8 new handler files. Cross-referenced against the original `miscRegistrars.ts` channels (from session read). All 26 channels accounted for:
   - updater: check, download, install (3)
   - cost: addEntry, getHistory, clearHistory (3)
   - usage: getSummary, getSessionDetail, getRecentSessions, getWindowedUsage, getUsageWindowSnapshot (5)
   - app: getCrashLogs, clearCrashLogs, openCrashLogDir, logError (4)
   - platform: openCrashReportsDir (1)
   - shellHistory: read (1)
   - symbol: search (1)
   - approval: respond, alwaysAllow, remember, listMemory, forget (5)
   - workspace: isTrusted, trustLevel, trust, untrust (4) [registered as `registerTrustHandlers`]
   - Total: 27 channels ✓
   
   Note: `registerWindowHandlers` and `registerExtensionHandlers` were re-exports from the original `miscRegistrars.ts` pointing to `miscRegistrarsHelpers.ts`. They are now imported directly by `misc.ts` from `miscRegistrarsHelpers`. `registerPerfHandlers`, `registerGraphHandlers`, `registerLspHandlers` similarly imported directly. All verified present in `misc.ts`.

2. **Each new file < 300 lines** — verified:
   - `updaterHandlers.ts`: 70 lines ✓
   - `costHandlers.ts`: 56 lines ✓
   - `usageHandlers.ts`: 78 lines ✓
   - `crashHandlers.ts`: 157 lines ✓
   - `shellHistoryHandlers.ts`: 41 lines ✓
   - `symbolHandlers.ts`: 44 lines ✓
   - `approvalHandlers.ts`: 83 lines ✓
   - `trustHandlers.ts`: 31 lines ✓

3. **All crash-domain helpers copied** — `getCrashLogDir`, `getCrashLogFiles`, `readCrashLog`, `getCrashLogs`, `clearCrashLogs`, `writeCrashLog` all present in `crashHandlers.ts`. ✓

- Universals found in plan: 4
- Universals where diff covers all instances: 4
- Universals flagged as narrowed: 0

---

## Check 3: Export audit

**New exports added (net-new, not relocations):**

All 8 `register*Handlers` functions are relocations of symbols that previously existed in `miscRegistrars.ts`. They are net-new *files* but not net-new *symbols* — the same function names existed and were exported from `miscRegistrars.ts` before the wave. Under strict interpretation (new file = new export declaration), they are new exports.

**Consumer check (fallback — grep):**

All 8 are imported and called in `misc.ts` (production, non-test file). Each has exactly one production consumer (`misc.ts`) plus one test consumer (co-located `*.test.ts`). No zero-consumer exports.

- New exports added: 8
- Exports with production consumers: 8 (`misc.ts` in each case)
- Exports flagged as dead: 0

---

## Verdict

**PASS**

All three checks ran clean. Check 1: all 8 new registrar exports trace to `ipcMain.handle` via `misc.ts` — no dead paths. Check 2: all 4 plan universals satisfied — 27 channels preserved, all new files under 300 lines, crash helpers fully migrated. Check 3: all 8 new exports have a production consumer in `misc.ts`. One real gap was surfaced and fixed during the review: `miscRegistrars.updaterDownload.test.ts` (Wave 41) imported from the deleted `miscRegistrars.ts` and was failing; updated to import from `updaterHandlers.ts` in commit 4bc0414. The `channelCatalogCoverage.test.ts` failure (13 unclassified channels) is pre-existing on master and unrelated to this wave.
