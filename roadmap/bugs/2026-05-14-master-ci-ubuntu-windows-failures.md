---
status: TRIAGED
created: 2026-05-14
updated: 2026-05-14
---

# master CI — non-Windows platform-specific test failures + Windows Test-step timeout

## Summary

master CI has been red since `0d6ee197` / `6b2cacd8` (2026-05-13) — **pre-existing, not a Wave 88 regression** (Wave 88 touched zero CI/lockfile/`src/main` test files; its mechanical review passed; its full local suite was 1065/1065).

The handoff doc's claim that "Master's CI was green at the cut point (6b2cacd8)" was incorrect — the run for `6b2cacd8` (25782557688) was a failure.

**Fixed already (Wave 88 ship):** `d77b3a00` added a `node node_modules/electron/install.js` step to `ci.yml`. This eliminated the macOS Electron-binary collection failure — `npm ci --ignore-scripts` had skipped electron's postinstall, so 146 macOS test files failed to load. After the fix, macOS went **146 failed files → 9**. The fix worked.

**What this bug now tracks** (verified against run `25888841620`, commit `d77b3a00`):
1. A shared **non-Windows platform-specific test failure set** — macOS (9 files / 22 tests) and Ubuntu (7 files / 20 tests) fail nearly the same files. Pass on Windows-local.
2. The **Windows Test step times out** at 10 minutes — a CI performance issue, not assertion failures.

## (1) Shared platform-specific failures — macOS + Ubuntu

From run `25888841620`:
- `validate (macos-latest)`: `Test Files 9 failed | 1056 passed`, `Tests 22 failed | 10976 passed`
- `validate (ubuntu-latest)`: `Test Files 7 failed | 1058 passed`, `Tests 20 failed | 10978 passed`

Failing files (union across the two platforms):
- `src/main/codebaseGraph/indexingPipelineSupport.test.ts`
- `src/main/codebaseGraph/systemTwoRegistry.test.ts`
- `src/main/ipc-handlers/sessionDispatchHandlers.validatePath.test.ts`
- `src/main/ipc-handlers/subagent.test.ts`
- `src/main/router/qualitySignalCollector.test.ts`
- `src/main/watchers/nativeWatcher.test.ts`
- `src/main/workspaceTrust.test.ts`
- `src/web/webPreloadTransport.resume.test.ts`

**Key signal:** the full suite passes 1065/1065 on a Windows local machine at the same commit. These are **Linux/macOS-environment-specific** — likely path normalization (`workspaceTrust`, `sessionDispatchHandlers.validatePath`), file-watcher semantics (`nativeWatcher`), or timing (`webPreloadTransport.resume`). Not yet root-caused per file.

## (2) Windows — Test step times out at 10 minutes

`validate (windows-latest)` ends with `##[error]The action 'Test' has timed out after 10 minutes.` Tests run and pass up to the cutoff — this is not an assertion failure. Either the Windows runner is slower than the 10-min budget for the full vitest suite, or something hangs partway. Options: raise the step timeout, shard the suite, or find/fix a hang. Needs its own look.

## Investigation starting points

1. **Shared platform set:** reproduce on a Linux container —
   `docker run --rm -v "${PWD}:/repo" -w /repo node:20 bash -lc "npm ci --ignore-scripts && node node_modules/electron/install.js && npx electron-rebuild -f -w better-sqlite3,node-pty && npx vitest run <the 8 files>"` — then diagnose per file. Group by likely cause (path-normalization / watcher / timing).
2. **Windows timeout:** check the Windows job's per-file timing in the CI log — is one file hanging, or is the whole suite just slow? Compare wall-clock to the Ubuntu/macOS Test-step duration.

## Scope / promotion note

Plausibly a small fix-sweep wave once the per-file causes are known: ~8 platform-specific test files + the Windows timeout. Could stay a Lane B bug if the 8 share one or two root causes. Triage after step 1 reproduces them.

## Related

- Fixed already: `d77b3a00 fix(ci): download Electron binary after npm ci --ignore-scripts` — macOS Electron-binary collection failure (146 → 9 failed files). Worked.
- Lockfile-divergence hypothesis (Windows/Linux optional-subtree, the Gamify/Contractor-App vendor-gotcha pattern) was **investigated and refuted** — `npm ci` exits 0 with no "Missing X from lock file" errors. Not that pattern.
- `electron`'s `npm ci --ignore-scripts` postinstall gotcha is captured in `.claude/vendor-gotchas/electron.md`.
