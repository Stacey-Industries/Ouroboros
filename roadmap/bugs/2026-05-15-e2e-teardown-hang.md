---
status: TRIAGED
created: 2026-05-15
updated: 2026-05-15
---

# Electron e2e — every test fails with "Worker teardown timeout of 60000ms exceeded" on Ubuntu CI under xvfb

## Summary

After the master-CI fix-sweep on 2026-05-15 (see `roadmap/bugs/2026-05-14-master-ci-ubuntu-windows-failures.md` — RESOLVED), the Playwright e2e step on Ubuntu surfaced a NEW failure mode distinct from the pre-existing per-spec drift in `roadmap/follow-ups/2026-05-13-electron-e2e-spec-drift.md`.

The harness installs and launches cleanly:
- `chrome-sandbox` setuid chmod step (added in commit `8ec5d7d7`) works — Electron launches without the SUID sandbox FATAL.
- `npx playwright install chromium chromium-headless-shell` (commit `538c44e7`) installs the browser binaries.
- Electron processes start, get a renderer window, and tests begin executing.

**The failure:** every test in the e2e suite fails at worker teardown with `Worker teardown timeout of 60000ms exceeded`. Verified in CI run `25902340127`, Ubuntu job; 26 tests across 2 workers, all hit the teardown timeout.

## Decision (2026-05-15)

The Playwright e2e step was **disabled in `.github/workflows/ci.yml`** (commented out — install + chmod + run + upload-artifact, all four steps). This unblocks fully-green master CI on all three platforms.

The manual smoke gate (`roadmap/session-handoff.md`) remains the active UI-defense in the meantime, per the existing rule at `~/.claude/rules-deferred/manual-smoke-gate.md` (cold-loaded for UI-bearing changes).

## Repro

1. Push any commit to a branch.
2. CI's Ubuntu job runs through Test + Build + Build:web all green (post 2026-05-15 fixes).
3. If the e2e step were re-enabled (uncomment in `ci.yml`), the step times out at its `timeout-minutes` cap with "Worker teardown timeout of 60000ms exceeded" on every test that runs.

The hang happens at Playwright worker teardown (between tests), NOT at app launch — Electron is launching, the renderer is loading, the test executes its assertion, then Playwright's worker can't shut the Electron process down within 60s.

## Investigation pointers

- **Existing M-4 workaround commit `d250fa0d`** — added a `page.close()` workaround in `e2e/electron.fixture.ts` for a different teardown issue. Check whether the workaround still applies / is sufficient.
- **Fixture is at `e2e/electron.fixture.ts`** — the `electronApp` fixture launches via `playwright._electron.launch()`. Look at its cleanup phase (the `afterEach` / fixture-teardown lifecycle).
- **Could be xvfb-specific** — the Ubuntu step wraps with `xvfb-run --auto-servernum`. Electron's renderer process may not exit cleanly under xvfb if the display goes away before the app fully cleans up.
- **Main-process shutdown path** — `src/main/main.ts` may have an `app.on('window-all-closed', …)` handler that doesn't fire on Linux the same way it does on macOS. Or a sync teardown blocker (file handle, native module).
- **Compare to local repro** — try `xvfb-run npm run test:e2e` in WSL2 Ubuntu (already set up per the pre-wave for the Stryker meta — see `C:\Web App\docs\superpowers\specs\2026-05-14-cross-platform-lockfile-stryker-meta.md`). If it reproduces locally, instrument the fixture's teardown.

## Scope

This bug is distinct from the per-spec drift (already tracked in `roadmap/follow-ups/2026-05-13-electron-e2e-spec-drift.md`). Even if every individual spec passed perfectly, this teardown hang would still time out the whole step.

A fix-wave for re-enabling e2e in CI plausibly bundles both:
1. **This teardown bug** (infrastructure — fix once, all tests benefit).
2. **The 11 per-spec drift bugs** (per-spec triage).

Suggested name: **"Wave 90+ — Electron e2e CI restoration"** (or whatever wave number is free when picked up; see the open chat-substrate migration roadmap 88→91).

## Related

- **Fixed and RESOLVED today (2026-05-15):**
  - `roadmap/bugs/2026-05-14-master-ci-ubuntu-windows-failures.md` (the predecessor bug — platform-specific tests + Windows timeout)
- **Still open:**
  - `roadmap/follow-ups/2026-05-13-electron-e2e-spec-drift.md` (per-spec drift, 11 tests across 6 specs)
- **Commits adding e2e CI infrastructure (kept commented in `ci.yml` for re-enable):**
  - `538c44e7` — playwright install chromium
  - `8ec5d7d7` — chrome-sandbox setuid chmod
- **Original M-4 wiring:** see Pipeline Hardening meta-spec at `C:\Web App\docs\superpowers\specs\2026-05-12-pipeline-hardening-meta.md` and the M-4 commits.
