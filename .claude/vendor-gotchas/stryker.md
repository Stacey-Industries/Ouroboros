---
vendor: '@stryker-mutator/core + @stryker-mutator/vitest-runner'
sdkVersion: '@stryker-mutator/core@9.6.1 + @stryker-mutator/vitest-runner@9.6.1'
firstWritten: 2026-05-16
lastVerified: 2026-05-16
relatedPaths:
  - stryker.config.mjs
  - .github/workflows/ci-stryker.yml
  - reports/
notes: 'Gotchas wiring Stryker into CI, configuring break floors, and managing the sandbox/baseline filesystem footprint.'
---

# Stryker mutation testing gotchas

Agent IDE Wave 92 activated Stryker in CI for the first time (Gamify Wave 9 pattern, ported preventatively as part of the cross-platform lockfile foundation). The notes here are the wiring lessons.

## CI workflow triggers

### Dual-frequency: incremental on PR + push, full on schedule

**Symptom:** Configuring `on: { pull_request: {}, schedule: { - cron: '...' } }` only fires Stryker on PR events and the scheduled cron. For solo-dev repos that commit direct to `main` without PRs, this means Stryker fires only on the cron — typically once a week. The `break:` floor is effectively unenforced 6 days out of 7.

**Why:** GitHub Actions events are disjoint. `push` to `main` doesn't trigger `pull_request`. A solo-dev workflow that bypasses PRs needs an explicit `push` trigger.

**Fix:** Add `push: { branches: [main] }` to the workflow's `on:` block. Guard each job's `if:` to handle both:

```yaml
on:
  pull_request:
  push:
    branches:
      - main
  schedule:
    - cron: '17 4 * * 1'

jobs:
  mutation-incremental:
    if: github.event_name == 'pull_request' || github.event_name == 'push'
    # ...
  mutation-full:
    if: github.event_name == 'schedule'
    # ...
```

**Source:** Gamify Wave 9 Phase 5 + Phase 7 fix (commit `02ccd65`). Surfaced 2026-05-15.

## Incremental vs full runs

### `--incremental` alone doesn't force a full re-baseline; use `--force`

**Symptom:** A scheduled "full re-baseline" job that runs `stryker run --incremental` still uses the existing baseline and may skip mutants the baseline considered clean. The intent of the weekly job is to refresh the full picture; `--incremental` defeats that.

**Why:** `stryker run --incremental` reads `reports/stryker-incremental.json` if present and only mutates files changed since the baseline was written. `incremental: true` in `stryker.config.mjs` does the same. To force a full run regardless of baseline state, pass `--force` on the CLI.

**Fix:** Use `--force` for the full job; keep `--incremental` for the PR/push job:

```yaml
- name: Run Stryker (incremental — PR + push)
  run: npx stryker run --incremental

# ... or in the full-run job:
- name: Run Stryker (full — schedule)
  run: npx stryker run --force
```

`--force` works whether or not the baseline file exists, so the scheduled job is self-recovering if the baseline is corrupt.

**Source:** [Stryker incremental mode docs](https://stryker-mutator.io/docs/stryker-js/incremental/). Gamify Wave 9 Phase 5 — pinned during the implementer's design pass.

## Sandbox + baseline gitignore

### `.stryker-tmp/` must be gitignored — orphans grow multi-GB

**Symptom:** A `.stryker-tmp/sandbox-XXXX/` directory in the repo root that wasn't cleaned up after an interrupted run. Eventually multi-GB; committed by mistake; breaks unrelated builds when CI runners try to use the sandbox path.

**Why:** Stryker copies the entire project (including `node_modules`) into a sandbox dir per worker for each mutation run. Normal teardown cleans them, but Ctrl+C, OOM, or `--dry-run` interrupts can leave orphans. The default location is `.stryker-tmp/` at repo root.

**Fix:** Gitignore `.stryker-tmp/`. Periodically: `rm -rf .stryker-tmp/` in CI between runs (most runners reset between jobs; if not, add a cleanup step).

```
# .gitignore
.stryker-tmp/
```

**Source:** Wave 9 ADR Decision 7 (Gamify). Lesson promoted as Wave 9 was activating Stryker for the first time; the multi-GB-orphan-breaking-unrelated-build failure mode has been observed in the wild.

### Gitignore the incremental baseline (solo-dev tradeoff)

**Symptom:** `reports/stryker-incremental.json` churns ~6K lines per Stryker run. Tracking it in git pollutes diffs, conflicts across branches, and obscures meaningful changes.

**Why:** The incremental baseline is a build artifact, not source. Each Stryker run can rewrite the whole file as it discovers new mutants.

**Fix (solo-dev repos):** Gitignore it. Trade off: every fresh clone pays a one-time full-run cost (5–10 min the first time) to rebuild the baseline before incremental mode is usable.

```
# .gitignore
reports/stryker-incremental.json
```

If the file was previously tracked: `git rm --cached reports/stryker-incremental.json` to untrack without deleting from disk.

**Fix (team repos):** Some teams DO track it and accept the churn for the no-cold-start benefit on a fresh clone. Judgment call based on team size vs CI runner-time cost.

**Source:** Gamify Wave 9 ADR Decision 7 + the `roadmap/follow-ups/2026-05-14-stryker-incremental-report-tracking.md` follow-up (RESOLVED).

## Break floor as anti-backslide gate

### `break:` blocks the build when score drops below; don't ratchet up casually

**Symptom:** Setting `break:` slightly above the current score (e.g. `break: 60` when current is 52.75%) blocks every subsequent run on legitimate work that doesn't change coverage. The team starts bypassing the gate.

**Why:** `break:` is a hard floor — Stryker exits 1 when score < break. It's an anti-backslide gate, not a coverage goal. Setting it equal to or above current = perpetually failing builds.

**Fix:** Set `break:` JUST BELOW the current mutation score. Treat it as a regression detector, not a target:

```js
// stryker.config.mjs
thresholds: {
  high: 80,
  low: 60,
  break: 50, // current is 52.55%; floor is anti-backslide only
},
```

Raising the floor is a deliberate decision in a future "coverage investment" wave — not a side effect of any PR. Document the policy in the wave's ADR.

**Source:** Gamify Wave 9 ADR Decision 6.

## Vitest runner specifics

### Stryker's vitest runner ≥ 9.6 doesn't pull jsdom

**Surprising:** Earlier research-9 §1 noted `@stryker-mutator/vitest-runner` as the trigger for the npm cross-platform lockfile bug via jsdom@29 → @asamuzakjp/css-color (optional). That chain was historical — current Stryker 9.6.1 does NOT depend on jsdom. Confirmed by reading `node_modules/@stryker-mutator/vitest-runner/package.json` against a fresh from-scratch lockfile.

**Implication:** If you regenerate the lockfile and notice `@asamuzakjp/css-color` and `@csstools/css-parser-algorithms` are no longer in the tree, that's correct — the trigger chain is no longer present. Any `overrides` block in `package.json` pinning those packages is vestigial and can be removed.

**Source:** Gamify Wave 9 Phase 1 + Phase 4 (overrides trim, 2026-05-15).
