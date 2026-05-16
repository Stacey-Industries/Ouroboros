---
status: DRAFT
created: 2026-05-16
type: wave-research-grounding
---

# Wave 92 Research — Cross-Platform Lockfile + Stryker (Agent IDE)

Grounding for Agent IDE's Wave 92 plan. The bulk of the foundation pattern is **inherited from Gamify Wave 9** (shipped 2026-05-15, `C:\Web App\Gamify\roadmap\wave-9-cross-platform-lockfile-stryker/`). This document captures Agent IDE deltas and re-verifies that Gamify's lessons still hold against current SDK versions.

**Primary source files (read these directly when implementing):**
- `C:\Web App\Gamify\stryker.config.mjs` — working Stryker 9.6.1 config
- `C:\Web App\Gamify\.github\workflows\ci-stryker.yml` — working dual-trigger CI workflow
- `C:\Web App\Gamify\scripts\lockfile-sync.mjs` — working WSL2 wrapper (214 lines)
- `C:\Web App\Gamify\.claude\vendor-gotchas\stryker.md` — vendor gotchas (5 entries)
- `C:\Web App\Gamify\.claude\vendor-gotchas\wsl2-lockgen.md` — WSL2 gotchas (5 entries)

## §1 — npm cross-platform lockfile behavior

**Status:** Active known issue as of 2026-05-15. Gamify Wave 9 confirmed the patterns hold against npm 10.9.8.

- **[npm/cli#7961](https://github.com/npm/cli/issues/7961)** — npm 10.3+ *prunes* platform-specific optional-dependency entries on a normal `npm install` when `node_modules` already exists. Open as of 2026-05; no upstream fix shipped.
- **[npm/cli#4828](https://github.com/npm/cli/issues/4828)** — Windows npm skips resolving `"optional": true` dependency subtrees and writes an incomplete lockfile. The `--os`/`--cpu` flags do NOT override the skip; only a from-scratch Linux resolve walks the full tree.
- **`--package-lock-only` is insufficient** — it inherits whatever the existing `node_modules` skipped. A full from-scratch `npm install` is required.
- **`npm ci` semantics on incomplete lockfile:** errors with `Missing X from lock file` and exits 1. No automatic fallback.

**Agent IDE specifics:** Agent IDE has **no existing lockfile divergence** (confirmed Wave 88 Round 1 CI investigation — Round 2 was unrelated test-bug surfacing). The wave adopts the foundation preventatively because installing Stryker would introduce divergence (its `vitest-runner` historically pulled jsdom → optional CSS deps; current Stryker 9.6.1 no longer does — see §3).

## §2 — WSL2 lockfile-generation gotchas

**Inherited from Gamify Wave 9 (`wsl2-lockgen.md`, lastVerified 2026-05-15). Verify against Agent IDE's Node 20 pin in Phase 1 — Gamify used 22.22.3.**

| Gotcha | Detail | Source |
|---|---|---|
| `~` does NOT expand inside double quotes in bash | Use `$HOME` instead. `mkdir -p "~/lockgen/agent-ide"` creates a literal `~/` dir in cwd. | Gamify Wave 9 Phase 2 |
| Run `wsl.exe` from a normal Windows cwd, not `\\wsl$\...` UNC | UNC cwd → npm path-resolution failures ([npm/cli#6280](https://github.com/npm/cli/issues/6280)). Set `cwd: REPO_ROOT` (Windows path) on `spawnSync('wsl.exe', ...)`. | Gamify research-9 §2 |
| `/mnt/c/...` is 3-5× slower than ext4-native | Cumulative cost on npm's many small writes. Always run heavy IO in `$HOME/lockgen/<repo>/`. Confirmed: native 1m14s vs cross-fs 9 min. | [Microsoft Learn — Node.js on WSL2](https://learn.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-wsl) |
| `--ignore-scripts` required for manifest-only lockgen dir | Workspace `postinstall` scripts reference source files the lockgen dir doesn't have. Use `npm install --ignore-scripts --no-audit --no-fund`. | Gamify Wave 9 Phase 1 |
| `spawnSync('npm.cmd', ..., { shell: false })` broken since Node 18.20 | CVE-2024-27980 hardening. Use `{ shell: true }` for `.cmd` shims on Windows. | [Node CVE-2024-27980](https://nodejs.org/en/blog/vulnerability/april-2024-security-releases) |

**Agent IDE specifics:**
- Engine pin is `node >=20.0.0` (`package.json:engines.node`). Pre-wave WSL2 setup already has Node 20.20.2 installed via nvm — no additional setup.
- `~/lockgen/` directory already exists from Gamify's setup; Agent IDE gets `~/lockgen/agent-ide/`.
- Agent IDE is NOT a monorepo (single root `package.json`) — simpler than Gamify's 4-manifest pin. The `lockfile-sync.mjs` wrapper collapses to one MANIFESTS entry.

## §3 — Stryker API surface (current as of 2026-05)

**Versions Gamify shipped against:** `@stryker-mutator/core@9.6.1`, `@stryker-mutator/vitest-runner@9.6.1`. Re-verify in Phase 5 before pinning Agent IDE's deps.

### Config shape (`stryker.config.mjs`)

```js
// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  incremental: true,
  thresholds: {
    high: 80,
    low: 60,
    break: <ANTI_BACKSLIDE_FLOOR>, // set just below first measured score
  },
  mutate: [
    // Pure-logic-only globs. NO Electron, NO React, NO native bindings.
    'src/shared/**/*.ts',
    '!src/shared/**/*.test.ts',
    '!src/shared/**/*.d.ts',
    // Expand per ADR as adapter pattern proves out.
  ],
};
```

### Key gotchas (from Gamify's `stryker.md`, lastVerified 2026-05-15)

1. **Dual-frequency CI: PR + push to main + scheduled full.** Solo-dev workflows often skip PR for direct push to main — without a `push` trigger, the `break:` floor is unenforced 6 days out of 7. Use `if: github.event_name == 'pull_request' || github.event_name == 'push'` on incremental, `if: github.event_name == 'schedule'` on full.
2. **`--incremental` doesn't force re-baseline; use `--force`.** `npx stryker run --incremental` reads `reports/stryker-incremental.json` and only mutates touched files. The scheduled full job MUST use `--force` to bypass the baseline.
3. **`.stryker-tmp/` must be gitignored.** Stryker copies the entire project per worker. Interrupted runs leave multi-GB orphans. Agent IDE already has `.stryker-tmp/` in `.gitignore:67` (Wave 88 hot-fix `3a5db2be`) — verified, no action needed.
4. **Gitignore `reports/stryker-incremental.json`** for solo-dev — churns ~6K lines per run. Cost: one-time full-run on fresh clone to rebuild the baseline.
5. **`break:` is a floor, not a target.** Set just below current measured score — anti-backslide only. Raising is a deliberate "coverage investment" decision in a future wave.

### Sandbox + native modules (the headline Agent IDE problem)

- **Stryker copies the whole project (including `node_modules`) into `.stryker-tmp/sandbox-XXXX/` per worker.** It then runs the test runner inside the sandbox.
- **Sandbox CANNOT rebuild native modules.** [stryker-js#1621](https://github.com/stryker-mutator/stryker-js/issues/1621), open. Any test that imports `better-sqlite3`, `node-pty`, `@parcel/watcher`, native FFI bindings will fail with `MODULE_NOT_FOUND` or `Could not locate the bindings file` inside the sandbox.
- **Workaround pattern:** scope `mutate` globs tightly to pure-logic code that does NOT import native bindings — even transitively. Tests that DO need native bindings stay covered by regular vitest integration tests (the existing `npm test` path), just not by Stryker mutation runs.
- **`tempDirName` config:** can relocate the sandbox dir but does NOT solve the native-module rebuild problem. Don't bother unless disk IO is the bottleneck.
- **Agent IDE implication:** the wave's "native-module adapter refactor" exists to make a clear lexical seam between "pure logic Stryker can mutate" and "native-binding integration code Stryker cannot reach." The adapter doesn't enable Stryker to *test* native modules — it enables Stryker to *not import* them transitively from pure-logic code.

## §4 — Electron native modules in Agent IDE

From the codebase explorer pass (full report in the haiku-explorer output):

| Module | Version | Import sites | Existing adapter shape |
|---|---|---|---|
| `better-sqlite3` | ^12.8.0 | `src/main/storage/database.ts:12-13` (single import; consumers use exported helpers) | YES — `database.ts` exports `openDatabase(dbPath)` with WAL pragmas. Thin but real. |
| `node-pty` | ^1.2.0-beta.11 | `src/main/pty.ts:2` (single import) | Partial — `pty.ts` is the boundary; consumers should not import `node-pty` directly. Verify no leaks. |
| `@parcel/watcher` | ^2.5.6 | `src/main/watchers/nativeWatcher.ts:10` (single import) | YES — `nativeWatcher.ts` wraps `subscribe()` with backend selection. |
| `@node-rs/xxhash` | ^1.7.6 | **3 import sites** in `src/main/codebaseGraph/` (`graphDatabaseSession.ts:9`, `indexingPipelineSupport.ts:6`, `mcpToolHandlerDefs.ts:6`), all `import { xxh3 } from '@node-rs/xxhash'`. Introduced Wave 14 for content-hashing. | Single-subsystem (codebaseGraph) confined; keep as load-bearing. Counts as 4th native dep Stryker must avoid. |

**Implication for the wave:** the adapter refactor is "harden existing seams + audit for direct imports," not "build adapter from scratch." Three of four live modules have a single-import-site shape (`better-sqlite3`, `node-pty`, `@parcel/watcher`); `@node-rs/xxhash` is subsystem-confined to `codebaseGraph/` (3 sites). The wave's job is (a) verify no leak outside the expected sites, (b) define `mutate` globs that exclude every file that imports any of the four — even transitively.

This is materially smaller than the meta-spec implied ("the bulk of the wave; likely multi-phase"). The audit + glob scoping probably fits in 1-2 phases, not 3-4.

**Named-import discovery gotcha:** Initial codebase grep for `@node-rs/xxhash` as a literal package name returned zero results, leading to a false "dead dep" reading. The correct regex is `from ['\"]@node-rs/xxhash` (or `require\(['\"]@node-rs/xxhash`) which finds the `import { xxh3 } from '@node-rs/xxhash'` shape. Phase 2's audit MUST use the named-import-aware regex for all four modules — bare package-name grep misses named-import call sites.

**electron-rebuild postinstall.** Agent IDE's `package.json` has:
- `"postinstall": "electron-rebuild -f -w better-sqlite3,node-pty && node tools/build-changelog.js"` (line 68)
- `"rebuild:native": "electron-rebuild -f -w better-sqlite3,node-pty"` (line 66)
- `ci.yml` runs `npm ci --ignore-scripts` (skips postinstall) then explicit `electron-rebuild -f -w better-sqlite3,node-pty` (lines 42, 67)

The Stryker sandbox `npm install` step (if any — Stryker uses an in-place copy, not a fresh install) will trigger postinstall. The sandbox will likely fail electron-rebuild because there's no Electron binary in the sandbox. Two paths:
- **A. Skip electron-rebuild in sandbox:** detect Stryker context via `STRYKER_MUTATOR_RUNNER` env or similar; no-op the postinstall script. Risky — assumes Stryker sets a discoverable env.
- **B. Tightly-scoped `mutate` globs:** if `mutate` only includes pure-logic files and those tests don't trigger native rebuild paths, the sandbox never tries to rebuild. This is the path Gamify took (their `mutate` is `packages/contracts/src/**/*.ts` — pure types/validators). Phase 5 verifies this assumption empirically.

## §5 — GitHub Actions Stryker workflow patterns

**Inherited from Gamify Wave 9 (`ci-stryker.yml`, 72 lines). Direct copy-with-adjustments works for Agent IDE.**

```yaml
name: Mutation Testing (Stryker)

on:
  pull_request:
  push:
    branches:
      - master   # Agent IDE uses master, not main
  schedule:
    - cron: '17 4 * * 1'  # Mondays 04:17 UTC

jobs:
  mutation-incremental:
    if: github.event_name == 'pull_request' || github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'    # Agent IDE pin, NOT Gamify's 22
          cache: 'npm'
      - run: npm ci --ignore-scripts   # Agent IDE pattern from ci.yml
      - run: node node_modules/electron/install.js   # explicit electron binary
      - run: npx stryker run --incremental

  mutation-full:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      # ... same setup ...
      - run: npx stryker run --force
```

**Agent IDE deltas vs Gamify:**
- `node-version: '20'` (not 22)
- `branches: [master]` (not main)
- `npm ci --ignore-scripts` + explicit electron install (matches existing `ci.yml`)
- NO `npm run build --workspace=...` step — Agent IDE is not a monorepo
- NO `electron-rebuild` step if `mutate` globs are tight enough (verify Phase 5)

**Caching considerations:**
- `actions/setup-node@v4` `cache: 'npm'` caches `~/.npm` — fine, transparent.
- Do NOT cache `.stryker-tmp/` — sandbox copies are run-scoped and must be fresh.
- Caching `reports/stryker-incremental.json` between runs is possible via `actions/cache`, but the baseline-on-fresh-clone cost is one-time per CI runner per week. Skip for v1; revisit if PR latency becomes a problem.

## §6 — Vendor knowledge inheritance

Files to copy/adapt from Gamify into Agent IDE's `.claude/vendor-gotchas/` at wave-end via `/promote-vendor-lessons 92`:

- **`stryker.md`** (Gamify version is 138 lines) — copy as-is, change `relatedPaths` from Gamify-specific to Agent-IDE-specific. The 5 gotchas (dual-trigger CI, `--force` for full, sandbox gitignore, baseline gitignore, break-as-floor) are universal.
- **`wsl2-lockgen.md`** (104 lines) — copy as-is, change `sdkVersion` from `Node 22.22.3 / npm 10.9.8` to `Node 20.20.2 / npm <pinned>`. The 5 gotchas (`~` quoting, UNC cwd, `/mnt/c` cost, `--ignore-scripts`, `.cmd` shim) are universal.
- **New Agent IDE-specific gotcha (Phase 5+ output):** Stryker `mutate` glob design for an Electron app — how to scope tightly enough that the sandbox never imports native bindings. This is the wave's net-new lesson.

## §7 — Open questions for Phase 1 walking skeleton to resolve

1. **Exact npm invocation.** Does `npm install --ignore-scripts --no-audit --no-fund` against a from-scratch lockgen dir produce a complete lockfile (win32/linux/darwin optional deps) at Node 20.20.2 + npm 10.x? Gamify confirmed yes at 22.22.3 + npm 10.9.8 — verify it holds.
2. **Version preservation mechanism.** Gamify uses `scripts/pin-toplevel.mjs` to pin caret ranges to currently-resolved exact versions *before* the regen, preventing opportunistic minor bumps. Agent IDE inherits this pattern; verify the script works against Agent IDE's single-manifest layout (it's currently 4-manifest-aware).
3. **Electron-rebuild interaction.** Does Stryker's sandbox actually run `postinstall` (electron-rebuild)? If yes, does it fail visibly, or silently corrupt the run? Phase 5 verifies empirically by running `npx stryker run --dry-run` after install.
4. **`@node-rs/xxhash` removal safety.** Confirm zero runtime imports across the entire built output (not just src/). If safe, remove from `package.json` in Phase 4 before lockfile regen.

## §8 — Sources

- npm cross-platform: [npm/cli#7961](https://github.com/npm/cli/issues/7961), [#4828](https://github.com/npm/cli/issues/4828), [#6280](https://github.com/npm/cli/issues/6280)
- Stryker: [docs.stryker-mutator.io](https://stryker-mutator.io/docs/stryker-js/), [incremental mode](https://stryker-mutator.io/docs/stryker-js/incremental/), [stryker-js#1621](https://github.com/stryker-mutator/stryker-js/issues/1621)
- WSL2: [Microsoft Learn — Node.js on WSL](https://learn.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-wsl)
- Node CVE: [CVE-2024-27980](https://nodejs.org/en/blog/vulnerability/april-2024-security-releases)
- Gamify Wave 9 canonical artifacts: `C:\Web App\Gamify\roadmap\wave-9-cross-platform-lockfile-stryker/`, `C:\Web App\Gamify\.claude\vendor-gotchas\{stryker,wsl2-lockgen}.md`, `C:\Web App\Gamify\stryker.config.mjs`, `C:\Web App\Gamify\.github\workflows\ci-stryker.yml`, `C:\Web App\Gamify\scripts\lockfile-sync.mjs`
