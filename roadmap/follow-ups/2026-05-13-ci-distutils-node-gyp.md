# CI distutils / node-gyp Failure on Windows + macOS Runners

**Discovered:** 2026-05-13 during Pipeline Hardening Wave M-4 CI run on PR #4
**Severity:** High (blocks every push from passing Windows + macOS validate matrix jobs)
**Wave home candidate:** CI/tooling cleanup pass (small wave, ~1-2 hours)
**Status:** Open

## What's broken

Every push to `pipeline-hardening-m4-clean` (and to `master` for the past ≥4 days based on `gh run list` history) fails in the `Run npm ci` step on Windows and macOS runners with:

```
Traceback (most recent call last):
  File "node_modules\node-gyp\gyp\gyp_main.py", line 42, in <module>
    import gyp  # noqa: E402
  File "node_modules\node-gyp\gyp\pylib\gyp\__init__.py", line 9, in <module>
    import gyp.input
  File "node_modules\node-gyp\gyp\pylib\gyp\input.py", line 19, in <module>
    from distutils.version import StrictVersion
ModuleNotFoundError: No module named 'distutils'
Error: `gyp` failed with exit code: 1
```

The failure is triggered by the `postinstall` script:

```
"postinstall": "electron-rebuild -f -w better-sqlite3,node-pty && node tools/build-changelog.js"
```

`electron-rebuild` invokes `node-gyp` to rebuild native modules. `node-gyp` in the locked version uses `distutils.version.StrictVersion`, but `distutils` was removed from Python 3.12+. GitHub's hosted runners recently bumped their default Python to 3.12, breaking the chain.

Ubuntu runners don't hit this — likely because the Ubuntu image still has Python 3.10 or the rebuild path on Ubuntu uses a different toolchain (see `npm rebuild` step which the workflow runs separately on Ubuntu only).

## Root cause

`node-gyp@<11` uses `from distutils.version import StrictVersion`. Python 3.12 removed `distutils` per [PEP 632](https://peps.python.org/pep-0632/) (deprecated in 3.10, removed in 3.12).

Verify the locked `node-gyp` version: `npm ls node-gyp` from the repo root.

## Suggested fix (three paths)

**Path A — Update node-gyp.** Pin a newer `node-gyp` version (≥11.x removed the `distutils` dependency) by adding to root `package.json`:

```json
"overrides": {
  "node-gyp": "^11.0.0"
}
```

Then `npm install` + commit `package-lock.json`. Test locally + push to verify CI green.

**Path B — Pin Python version on runners.** Add a `actions/setup-python@v5` step before `npm ci` with `python-version: '3.11'`. Less ideal because it adds a runner setup step and doesn't future-proof — Python 3.11 EOL is 2027-10.

**Path C — Skip postinstall on CI.** Add `--ignore-scripts` to `npm ci`, then rebuild natives in a separate step that's OS-aware. Most invasive but most surgical (avoids invoking `electron-rebuild` on CI where Electron isn't actually being launched in the test step).

**Recommended:** Path A. Cheapest, most future-proof, narrowest blast radius.

## Why deferred from M-4

M-4's scope was test-infra wiring, not CI infrastructure hardening. Fixing this requires either dependency overrides (Path A) or workflow restructuring (Paths B / C) — both expand the M-4 diff beyond its stated scope and would have delayed shipping the e2e harness wiring.

The M-4 e2e step runs on Ubuntu only, so this failure doesn't block M-4's deliverable. The Windows + macOS matrix jobs being red is pre-existing (master CI has been red for ≥4 days per `gh run list --branch master --limit 5`).

## Verification path

1. Apply Path A's `overrides` block.
2. `npm install` locally — confirm `node_modules/node-gyp/package.json` version is ≥11.
3. `npm run rebuild:native` locally — confirm it succeeds (this is the same thing CI runs).
4. Push to a branch — confirm all 3 matrix jobs pass `Run npm ci` step.
5. Check that production Electron build still works (no functional regression from the node-gyp bump).

## Related

- `.github/workflows/ci.yml` — the matrix job that fails
- `package.json` — the `postinstall` script
- [PEP 632](https://peps.python.org/pep-0632/) — distutils removal
- [node-gyp 11 release notes](https://github.com/nodejs/node-gyp/releases/tag/v11.0.0) — distutils dependency removed
- Pipeline Hardening meta-spec: `C:\Web App\docs\superpowers\specs\2026-05-12-pipeline-hardening-meta.md`
