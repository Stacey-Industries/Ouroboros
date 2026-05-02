# Wave 74 — Result Brief

**Status:** COMPLETE
**Branch:** `wave-74-registrars-decomp`
**Commits:** 11 (28b7c0d → 4bc0414)
**Date:** 2026-05-02

## What shipped

`src/main/ipc-handlers/miscRegistrars.ts` (336 lines, 10 unrelated domains,
grandfathered ESLint 300-line violation) split into 8 per-domain handler files:

| File | Channels | Lines |
|---|---|---|
| `updaterHandlers.ts` | updater:check, updater:download, updater:install | 70 |
| `costHandlers.ts` | cost:addEntry, cost:getHistory, cost:clearHistory | 56 |
| `usageHandlers.ts` | usage:getSummary, :getSessionDetail, :getRecentSessions, :getWindowedUsage, :getUsageWindowSnapshot | 78 |
| `crashHandlers.ts` | app:getCrashLogs, :clearCrashLogs, :openCrashLogDir, :logError; platform:openCrashReportsDir | 157 |
| `shellHistoryHandlers.ts` | shellHistory:read | 41 |
| `symbolHandlers.ts` | symbol:search | 44 |
| `approvalHandlers.ts` | approval:respond, :alwaysAllow, :remember, :listMemory, :forget | 83 |
| `trustHandlers.ts` | workspace:isTrusted, :trustLevel, :trust, :untrust | 31 |

`miscRegistrars.ts` deleted. `misc.ts` updated to import all registrars directly.
`ipc-handlers/CLAUDE.md` updated to remove stale references to `miscRegistrars.ts`.

Each new file has a co-located smoke test (`*.test.ts`).

## Bugs surfaced (not fixed in this wave)

None — pure mechanical refactor. One Wave 41 test (`miscRegistrars.updaterDownload.test.ts`)
was broken by the deletion of `miscRegistrars.ts`; it was fixed in this wave as the
breakage was a direct consequence of the refactor (commit 4bc0414).

## Pre-existing test failure (not introduced by this wave)

`channelCatalogCoverage.test.ts` fails on master with 13 unclassified channels
(chat:subagentEnd, hook:*, memory:*, rulesDir:*, tracker:*). Verified pre-existing
on master before wave. Out of scope.

## Review verdict

`/review 74` → **PASS**
- Check 1 (forward-trace): all 8 exports reach `ipcMain.handle` via `misc.ts`
- Check 2 (plan universals): 27 channels preserved, all files < 300 lines, crash helpers migrated
- Check 3 (export audit): all 8 new exports consumed by `misc.ts`

## Observation point

All phases are Internal — no user-observable observation point. This is a pure
file-shape refactor. tsc is clean and channel catalog structural tests (read,
desktopOnly, always, write) all pass.
