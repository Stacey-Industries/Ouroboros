---
status: DRAFT
created: 2026-05-16
updated: 2026-05-16
wave: 92
---

# Wave 92 — Architecture Decisions (ADR)

Decisions locked at plan time (1-5, 7, 8) or pinned empirically during the wave (2, 3, 6). Per `~/.claude/rules/best-practice-spectrum.md` format.

## Decision 1: Inherit Gamify Wave 9's pattern wholesale

**Context:** Gamify Wave 9 shipped a working `lockfile:sync` + pre-push guard + CI canary + `ci-stryker.yml` + Stryker config + vendor-gotchas pattern on 2026-05-15. Agent IDE needs the same shape.

**Pick:** Direct copy + Agent-IDE-specific deltas (Node 20 vs 22, master vs main branch, single-manifest vs monorepo, Electron native modules vs none).

**Rationale:** The pattern was validated against the same upstream problem space (npm cross-platform lockfile + Stryker integration). Re-deriving wastes time. Gamify's vendor-gotchas files capture lessons that cost real wave-time to discover; inheriting them is the point of `/promote-vendor-lessons`.

**Consequences:** Phases 3, 7, 8 are largely port-with-adjustments. Net-new design effort focuses on Agent IDE's deltas — native-module audit (Phase 2), 3-OS CI canary (Phase 4), electron-rebuild interaction with Stryker sandbox (Phase 6).

---

## Decision 2: WSL2-native from-scratch `npm install --ignore-scripts --no-audit --no-fund`

**Context:** Lockfile generation must produce a complete win32+linux+darwin tree at Node 20.20.2 + Agent IDE's `package.json`. Whether from-scratch install alone suffices or per-platform `--os` passes are also needed depends empirically on the npm 10.3+ pruning regression behavior at Agent IDE's dep tree shape.

**Pick (PINNED 2026-05-16 by Phase 1 walking skeleton):**

```bash
nvm use 20.20.2
cd $HOME/lockgen/agent-ide
rm -rf node_modules package-lock.json
npm install --ignore-scripts --no-audit --no-fund
```

Single-pass; no explicit `--os`/`--cpu` flags needed.

**Rationale:** Walking skeleton (2m25s, 1491 packages added) produced a complete lockfile in one pass. `lockfile-smoke.mjs` confirmed 5 platform-specific families (`@esbuild`, `@node-rs/xxhash`, `@parcel/watcher`, `@rollup/rollup`, `lightningcss`) all complete for win32+linux+darwin. `npm ci --dry-run` resolved in 3s. The npm 10.3+ pruning regression does NOT bite Agent IDE's dep shape at Node 20.20.2 + npm 10.8.2 — at least not at this snapshot. Re-verify if Stryker's vitest-runner (Phase 6) is the first to pull a problematic optional subtree.

**Consequences:** Phase 3's `scripts/lockfile-sync.mjs` wraps this single-pass invocation. If Phase 6's Stryker install surfaces incompleteness, Decision 2 amends to add per-platform passes and Phase 3's wrapper updates.

**Known warning (non-blocking):** `node-abi@4.31.0` (transitive via electron-builder's `app-builder-lib`) declares `engines.node >=22.12.0` and emits `EBADENGINE` warning at Node 20. The dep installs and resolves correctly; warning is cosmetic. Documented in `stryker-electron.md` Phase 8.

---

## Decision 3: Version-preservation mechanism — pin top-level caret ranges before regen

**Context:** A naive from-scratch `npm install` resolves dependencies fresh and silently bumps caret ranges to newer minors. Contractor App's `stripe`/`recharts` churn is the documented anti-pattern.

**Pick (CONFIRMED 2026-05-16 by Phase 1):** Use `scripts/pin-toplevel.mjs` (verbatim port from Gamify) to pin top-level deps in `package.json` to currently-resolved exact versions before invoking the lockgen install.

**Rationale:** Phase 1 confirmed pin-toplevel.mjs works correctly against Agent IDE's single-manifest layout — wrote pinned `package.json` to lockgen dir without modification of the source file. The script is generic over manifest count (iterates `dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies` of whatever manifest is passed); single-manifest is just multi-manifest with N=1.

**Consequences:** Phase 3's `lockfile-sync.mjs` calls `pin-toplevel.mjs` as Step 1 before the WSL2 invocation. Regen never silently bumps minors.

---

## Decision 4: Pre-push guard via provenance marker (`.lockfile-sync.marker`)

**Context:** Need to prevent any `package-lock.json` change that didn't come through `lockfile:sync` from reaching the remote.

**Pick:** `lockfile:sync` writes `.lockfile-sync.marker` containing `{lockfileSha256, generatedAt, generatedBy}`. The pre-push hook reads the marker, computes current sha256 of `package-lock.json`, blocks the push if mismatch (or marker missing AND lockfile staged).

**Rationale:** Inherits Gamify Decision 5. Narrow trigger (sha256 compare, not heuristic) keeps false-positive rate low. Marker is the explicit provenance, not implicit.

**Consequences:** `.lockfile-sync.marker` is tracked in git (small JSON file). Bypass procedure documented in error message for the rare legitimate hand-edit case.

---

## Decision 5: Stryker `mutate` globs start at `src/shared/**/*.ts` only

**Context:** Stryker's sandbox cannot rebuild native modules ([stryker-js#1621](https://github.com/stryker-mutator/stryker-js/issues/1621)). Agent IDE has 4 native deps (`better-sqlite3`, `node-pty`, `@parcel/watcher`, `@node-rs/xxhash`). Any file that transitively imports one will break the Stryker baseline run.

**Pick:** `src/shared/**/*.ts` (excluding `*.test.ts` and `*.d.ts`) — pure types, validators, helpers; zero Electron, zero React, zero native bindings.

**Rationale:** First baseline must be a clean measurement, not a debug session. Tight v1 globs guarantee a successful run; expansion is a future coverage-investment decision.

**Consequences:** First baseline measures a smaller surface than the codebase. Score will be a meaningful per-`src/shared` number, not a whole-codebase number. Expansion candidates (`src/main/codebaseGraph/**` excluding xxhash importers; `src/main/**/*.helpers.ts`; `src/main/**/*.utils.ts`) are filed in `roadmap/follow-ups/2026-05-16-stryker-mutate-scope-expansion.md` per Cole's explicit ask.

---

## Decision 6: `break:` floor set empirically at floor(first_score) - 1

**Context:** `break:` is an anti-backslide gate. Setting it above current score = perpetually failing builds. Setting it equal to current = first PR with any noise fails.

**Pick (PINNED 2026-05-16 by Phase 6 baseline):** `break: 21`.

**Empirical baseline:** `npx stryker run --force` against `src/shared/**` (174 mutants, 31 source files, 42 tests across 2 test files, 15 parallel workers). Runtime: 2m14s. Results: 39 killed, 0 timeout, 106 survived, 29 no-coverage. **Total mutation score: 22.41%** (covered: 26.90%).

Per-file breakdown:
- `ipc/chatStateChannels.ts` — 66.67%
- `FileRefResolver.ts` — 24.31% (largest survivor source: 106 of 145 untouched mutants)
- `pricing.ts` — 0.00% (no coverage at all; 23 no-cov mutants)
- `types/auth.ts` — 0.00% (no coverage; 1 no-cov mutant)

floor(22.41) - 1 = 21. Set in `stryker.config.mjs:23`.

**Rationale:** Anti-backslide only. The 22.41% score is low because `src/shared` has minimal test coverage (only 2 test files cover 31 source files; `pricing.ts` and `types/auth.ts` are entirely uncovered). Raising the floor is a deliberate coverage-investment decision in a future wave, NOT a side effect of any PR. The mutate-scope expansion follow-up (`roadmap/follow-ups/2026-05-16-stryker-mutate-scope-expansion.md`) is the natural pairing — first widen the surface, then invest in coverage.

**Consequences:** Phase 7's `ci-stryker.yml` enforces `break: 21`. Any PR that drops the score below 21 fails CI. Survivors are surfaced in `reports/mutation.html` for visibility but the HTML report itself isn't gated.

---

## Decision 7: Gitignore `reports/stryker-incremental.json`; CI runs dual-frequency

**Context:** The incremental baseline file churns ~6K lines per run. Tracking it pollutes diffs. Solo-dev workflow tradeoff: gitignore + accept one-time full-run on fresh clone.

**Pick:** Gitignore `reports/stryker-incremental.json`. CI runs incremental on `pull_request` + `push: [master]`, full `--force` on weekly Monday cron.

**Rationale:** Inherits Gamify Decision 7. Solo-dev clone-cost is acceptable for clean git history. Dual-frequency CI ensures `break:` enforces 7 days/week (incremental on direct-to-master pushes catches solo-dev workflow gap).

**Consequences:** `.gitignore` adds `reports/stryker-incremental.json` (in addition to existing `.stryker-tmp/` at line 67). New `ci-stryker.yml` workflow with two job conditions.

---

## Decision 8: `@node-rs/xxhash` is retained — load-bearing for codebaseGraph

**Context:** Initial codebase grep for `@node-rs/xxhash` returned zero matches, suggesting it was dead weight. Re-grep with named-import-aware regex (`from ['\"]@node-rs/xxhash`) found 3 live imports in `src/main/codebaseGraph/` (`graphDatabaseSession.ts:9`, `indexingPipelineSupport.ts:6`, `mcpToolHandlerDefs.ts:6`), all using the `xxh3` named export. Introduced Wave 14 (commit `60addbe6`) for codebase-graph content-hashing.

**Pick:** Retain. Counts as the **fourth** native module Stryker's `mutate` globs must avoid (alongside `better-sqlite3`, `node-pty`, `@parcel/watcher`).

**Rationale:** Live load-bearing dep; removing would break the codebase graph. The grep miss is a process lesson — Phase 2's audit MUST use named-import-aware regex, not bare package-name grep.

**Consequences:** Phase 5 does NOT remove `@node-rs/xxhash`. Phase 2's audit expects 3 sites for xxhash (not 0). Phase 8's `stryker-electron.md` documents the 4-module no-touch list as the `mutate`-glob discipline.
