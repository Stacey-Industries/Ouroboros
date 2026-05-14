---
status: TRIAGED
created: 2026-05-14
updated: 2026-05-14
---

# master CI — Ubuntu (21 tests) + Windows job failures

## Summary

master CI has been red since `0d6ee197` / `6b2cacd8` (2026-05-13) — **pre-existing, not a Wave 88 regression** (Wave 88 touched zero CI/lockfile/`src/main` test files; its mechanical review passed). The breakage is multi-platform, multi-cause. The **macOS** cause (Electron binary missing under `npm ci --ignore-scripts`) was fixed in `d77b3a00`. This bug tracks the remaining two platforms.

The handoff doc's claim that "Master's CI was green at the cut point (6b2cacd8)" was incorrect — the run for `6b2cacd8` (25782557688) was a failure.

## Ubuntu — 8 test files / 21 tests failing

From CI run `25887181094` (commit `cf0c40bc`), `validate (ubuntu-latest)`:
`Test Files 8 failed | 1057 passed (1065)`, `Tests 21 failed | 10977 passed`.

Failing files identified:
- `src/main/codebaseGraph/indexingPipelineSupport.test.ts`
- `src/main/codebaseGraph/systemTwoRegistry.test.ts`
- `src/main/ipc-handlers/subagent.test.ts`
- `src/main/router/qualitySignalCollector.test.ts`
- `src/main/watchers/nativeWatcher.test.ts`
- `src/main/workspaceTrust.test.ts`
- `src/web/webPreloadTransport.resume.test.ts`
- (one more — 8 reported, 7 enumerated; re-pull the log to confirm the 8th)

**Key signal:** the full suite passes 1065/1065 on a Windows local machine at the same commit. These 21 are **Linux-environment-specific** — likely path normalization (`workspaceTrust`), file-watcher semantics (`nativeWatcher`), or timing (`webPreloadTransport.resume`). The diagnostician that investigated the macOS issue flagged these as "pre-existing assertion bugs" but did not root-cause them.

## Windows — job conclusion `failure`, cause unclear

`validate (windows-latest)` reported `conclusion: failure`, failing step `Test`, but the `--log-failed` output had no clean `Tests N failed` summary line for the Windows job — the test runner may have died before printing a summary, or the failure is in a different sub-step. **Needs a direct look at the full (not `--log-failed`) Windows job log.**

## Investigation starting points

1. Pull the full CI log for the latest master run: `gh run view <id> --log` (not `--log-failed`), strip ANSI, examine each platform's Test step separately.
2. For Ubuntu's 21: run the 8 failing files on a Linux container locally — `docker run --rm -v "${PWD}:/repo" -w /repo node:20 bash -lc "npm ci --ignore-scripts && node node_modules/electron/install.js && npx electron-rebuild -f -w better-sqlite3,node-pty && npx vitest run <the 8 files>"` — reproduce, then diagnose per file.
3. For Windows: determine whether it's the same class as Ubuntu's 21, a distinct failure, or a runner/setup issue.

## Scope / promotion note

This is plausibly a small fix-sweep wave (Lane A fix-sweep) once the per-file causes are known — 8 Ubuntu files + however many Windows surfaces, mixed platform-specific assertion bugs. Could also stay a Lane B bug if the 21 turn out to share one or two root causes. Triage after step 2 reproduces them.

## Related

- Fixed already: `d77b3a00 fix(ci): download Electron binary after npm ci --ignore-scripts` (macOS).
- Lockfile-divergence hypothesis (Windows/Linux optional-subtree, the Gamify/Contractor-App vendor-gotcha pattern) was **investigated and refuted** — `npm ci` exits 0 with no "Missing X from lock file" errors. Not that pattern.
