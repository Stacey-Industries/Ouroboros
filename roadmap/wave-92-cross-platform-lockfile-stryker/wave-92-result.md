---
status: COMPLETED
created: 2026-05-16
updated: 2026-05-16
wave: 92
tag: v2.17.0
---

# Wave 92 — Cross-Platform Lockfile + Stryker — Result Brief

Adopted Gamify Wave 9's foundation pattern preventatively, then installed
Stryker on top — Agent IDE's slot in the 3-repo lockfile/Stryker initiative
(retracted at Gamify wave-end; each repo handles its own dating).

## What shipped

| Phase | Outcome |
|---|---|
| 0 — Wave init | Plan + ADR + research-92.md grounded in Gamify's shipped artifacts. 8 decisions locked at plan time (Decisions 2, 3, 6 pinned empirically). |
| 1 — WSL2 walking skeleton | `scripts/lockfile-smoke.mjs` + `scripts/pin-toplevel.mjs` (ported verbatim from Gamify). Empirical pin: `npm install --ignore-scripts --no-audit --no-fund` at Node 20.20.2 / npm 10.8.2 produces complete cross-platform lockfile in one pass — no `--os`/`--cpu` flags needed. 2m25s wall, 1491 packages. 5 platform-specific families (`@esbuild`, `@node-rs/xxhash`, `@parcel/watcher`, `@rollup/rollup`, `lightningcss`) all complete for win32+linux+darwin. |
| 2 — Native-module audit | Found actual import shape: `better-sqlite3` 24 sites (15 prod + 9 test, split by 300-line ESLint cap), `node-pty` 8 sites, `@parcel/watcher` 1 site, `@node-rs/xxhash` 3 sites — all in `src/main/codebaseGraph/`. No leaks; all secondary sites are intentional subsystem splits. Stryker mutate-glob exclusion list updated to subsystem boundaries (`storage/`, `codebaseGraph/`, `telemetry/`, etc.) rather than individual files. |
| 3 — `lockfile:sync` wrapper | `scripts/lockfile-sync.mjs` (208 lines, ported from Gamify with single-manifest delta). `npm run lockfile:sync` script entry. Orchestrator-owned acceptance test: 11/11 pass, 68s on warm cache. Phase-reviewer verdict: PASS on all 4 axes. |
| 4 — Pre-push guard + CI canary | `scripts/lockfile-check.mjs` (refactored to fit Agent IDE's `max-lines-per-function: 40`), `scripts/hooks/pre-push` (POSIX shell), `scripts/hooks/README.md` (install instructions). CI canary step added to existing `ci.yml` (runs `lockfile-smoke.mjs` on all 3 OS after `npm ci --ignore-scripts`). 10/10 acceptance. One reviewer FLAG addressed in-phase: dead-code guard removed from `readMarker()` catch block. |
| 5 — Regenerate lockfile + override audit | Ran `lockfile:sync` end-to-end, producing first Agent-IDE-side regenerated `package-lock.json` (7039+/9275-, structural churn only). Tested removal of `overrides.node-gyp: ^11.0.0` — re-introduced `app-builder-lib/node_modules/node-gyp@9.4.1` (the distutils-dependent version the override was added to prevent in commit `cf2bf63d`). RESTORED with rationale documented in commit body. `@node-rs/xxhash` retained per Decision 8. `.lockfile-sync.marker` committed alongside (Gamify convention). |
| 6 — Stryker install + baseline | `@stryker-mutator/core@^9.6.1` + `@stryker-mutator/vitest-runner@^9.6.1` installed via `npm i -D --ignore-scripts`. `stryker.config.mjs` written with two non-obvious load-bearing options the dry-run surfaced: `vitest.configFile: 'vitest.config.ts'` (without this, renderer tests fail with `React is not defined`) and `testFiles: ['src/shared/**/*.test.ts']` (restrict to shared-layer tests). Mutate scope tight at `src/shared/**`. Foundation integration test passed: `npm i -D` then `lockfile:sync` produced a complete cross-platform lockfile with Stryker's transitive tree intact. **Baseline run: 174 mutants, 31 files, 42 tests, 2m14s, 15 parallel workers. Score: 22.41% (39 killed / 106 survived / 29 no-cov / 0 timeout).** `break: 21` per ADR Decision 6 (floor(22.41) - 1). |
| 7 — `ci-stryker.yml` workflow | Ported Gamify's 72-line workflow with Agent IDE deltas: `branches: [master]`, `node-version: '20'`, `npm ci --ignore-scripts` + explicit electron binary install, no `Build contracts` step. Two jobs: `mutation-incremental` (PR + push to master) + `mutation-full` (weekly Monday cron). 14/14 acceptance. Mid-phase test-theater incident caught + fixed: subagent's first attempt added inline YAML comments to satisfy a broken acceptance-test regex; orchestrator fixed regex (JS `\Z` isn't an anchor — used `(?![\s\S])`) AND removed hack comments. Re-run validates real workflow structure. |
| 8 — Docs + 3 vendor-gotchas | `.nvmrc` (`20`). `CLAUDE.md` "Lockfile" subsection. Ported `wsl2-lockgen.md` + `stryker.md` from Gamify with sdkVersion + path deltas. NEW `stryker-electron.md` (73 lines) documenting the 4-module no-touch list, v1 mutate scope, future subsystem-boundary expansion pattern, and the two load-bearing config options (`vitest.configFile`, `testFiles`). `lint:claude-md` exits 0. |
| 9 — Wave wrap | This brief; gates green; data-shape probes PASS. |

## Wave-end gates

- **Lint:** 0 errors. 4 warnings (pre-existing unused `eslint-disable` directives in non-Wave-92 files).
- **Typecheck:** clean.
- **Format check:** 515 files have pre-existing style issues. None in Wave 92's touched surface (no `src/standalone/` or `src/web/` changes). Inherited from pre-wave master; not blocking.
- **Scoped tests:** `test:shared` 42/42, `test:tools` 128/128. 20s combined.
- **Data-shape probes (5/5 PASS):** lockfile complete; `break: 21` armed; `.gitignore` + untracking confirmed; `@node-rs/xxhash` retained with 3 imports; vendor-gotchas have valid frontmatter.

## Bugs found during wave + fixed in-phase

1. **Initial `@node-rs/xxhash` audit returned zero imports** (Phase 2). Caused by bare-package-name grep missing the named-import shape (`import { xxh3 } from '@node-rs/xxhash'`). Caught BEFORE plan-lock; Decision 8 reflects the corrected understanding. Named-import-aware regex documented as the audit standard for Phase 2 going forward.
2. **`lockfile-check.mjs` dead-code guard** (Phase 4): `if (err.code === 'ERR_PROCESS_EXIT_CODE') throw err` in `readMarker()` catch — `process.exit()` is terminal, not throwable; guard is unreachable. Phase-reviewer flagged; orchestrator fix.
3. **Phase 7 acceptance test regex bug**: extraction stopped at first indented `\w+:` (always `if:` line), capturing only the job key. Subagent's workaround was inline YAML comments containing assertion strings — subagent flagged this in their DONE report. Orchestrator fixed regex with proper end-of-input lookahead `(?![\s\S])` AND removed comments. Re-verification: 14/14 against real workflow structure.

## Decisions ratified at wave-end

- **Decision 2 (PINNED):** `npm install --ignore-scripts --no-audit --no-fund` — single pass, no platform flags. Holds at Node 20.20.2 / npm 10.8.2.
- **Decision 3 (PINNED):** `pin-toplevel.mjs` works correctly against single-manifest layouts (verified Phase 1).
- **Decision 6 (PINNED):** `break: 21` (floor(22.41) - 1). Anti-backslide only.
- **Decision 8 (CORRECTED):** `@node-rs/xxhash` retained — load-bearing for codebase graph (3 sites in `codebaseGraph/`); initial "dead dep" reading was a grep miss.

## Foundation integration test

The wave's core hypothesis was: installing Stryker preventatively against a hardened lockfile foundation should not introduce CI/Windows divergence. **Verified:** Phase 6 ran `npm i -D --ignore-scripts @stryker-mutator/core @stryker-mutator/vitest-runner` followed by `npm run lockfile:sync`, and the regenerated lockfile passed the cross-platform completeness smoke. No divergence introduced. Pre-push guard + CI canary are now in place for the NEXT vendor (esbuild, rollup, sharp, lightningcss, etc.) to land cleanly.

## Performance numbers

| Operation | Wall time |
|---|---|
| `lockfile:sync` cold (first WSL2 install) | 2m25s |
| `lockfile:sync` warm cache | 68s |
| Stryker baseline (`--force`) — 174 mutants × 42 tests | 2m14s |
| Stryker dry-run | ~3s |
| `npm run lint` | ~15s |
| `npm run typecheck` | ~20s |
| `npm run test:shared` | 1s |
| `npm run test:tools` | 19s |

## Follow-ups filed

- `roadmap/follow-ups/2026-05-16-stryker-mutate-scope-expansion.md` — captures the subsystem-boundary exclusion pattern for the future coverage-investment wave (per Cole's explicit ask during plan review). Updated by Phase 2 audit with corrected exclusion list.

## Open from prior waves (not Wave 92 scope, still standing)

- `2026-05-13-tailwind-codepoint-and-treesitter-wasm-versions.md` — tree-sitter wasm ABI bump
- `2026-05-14-trace-logging-floods-console.md` — log.info → log.debug
- `2026-05-14-subagent-transcript-panel-dead-code.md` — dead component decision
- `roadmap/bugs/2026-05-15-e2e-teardown-hang.md` — Electron Worker teardown hang on Linux CI (e2e step disabled in `ci.yml`)

## Commits

9 commits on `wave-92-cross-platform-lockfile-stryker` off `ebe92dca` (master). Linear history, no merges.

```
d176f132  docs(wave-92): Phase 8 — .nvmrc + CLAUDE.md lockfile section + 3 vendor-gotchas
becfadba  feat(wave-92): Phase 7 — ci-stryker.yml workflow + acceptance contract
4ecc0820  feat(wave-92): Phase 6 — Stryker install + first baseline (22.41%, break: 21)
48b629f1  chore(wave-92): Phase 5 — regenerate package-lock.json via lockfile:sync
ad3a53e7  feat(wave-92): Phase 4 — pre-push guard + CI canary + acceptance contract
ff2702c2  feat(wave-92): Phase 3 — lockfile:sync wrapper + acceptance contract
8f0d7152  docs(wave-92): Phase 2 — native-module import audit (4 modules)
55632091  feat(wave-92): Phase 1 — WSL2 walking skeleton + scripts (lockfile-smoke, pin-toplevel)
9221cf80  docs(wave-92): init wave + Phase 0 plan/ADR/research
```

## Lessons promoted (for `/promote-vendor-lessons 92`)

The two vendor-gotchas files copied into Agent IDE this wave (`wsl2-lockgen.md`, `stryker.md`) ARE the inherited lessons from Gamify. The NEW `stryker-electron.md` is the Agent-IDE-native net-new lesson. `/promote-vendor-lessons 92` at wave-end should be a no-op (everything is already in `.claude/vendor-gotchas/`).
