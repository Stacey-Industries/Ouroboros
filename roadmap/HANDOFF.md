# Session Handoff — 2026-05-16 (Wave 92 SHIPPED, master CI GREEN)

**Audience:** the next Claude Code session.

---

## TL;DR

**Wave 92 (Cross-Platform Lockfile + Stryker) is shipped** — merged to master as commit `4f129140` (PR #9), released as **v2.17.0**, tagged. Adopted Gamify Wave 9's lockfile-foundation pattern preventatively, then installed Stryker on top (`@stryker-mutator/core@9.6.1` + `@stryker-mutator/vitest-runner@9.6.1`). First mutation baseline: **22.41%** on `src/shared/**` (174 mutants), `break: 21` floor armed.

**Master CI is GREEN on all 3 platforms** (macOS, Ubuntu, Windows) as of 2026-05-16. New `ci-stryker.yml` workflow runs mutation testing on PR + push (incremental) and weekly Monday cron (full --force).

**Next wave options** (Cole's call):
1. **Wave 89 — ChatOnlyShell Layout Overhaul** (stacked terminals + overlay drawers). Phase 0 = extend `useResizable` for sibling-stack resize (the Wave 88 prerequisite).
2. **e2e teardown bug-wave** (`roadmap/bugs/2026-05-15-e2e-teardown-hang.md`) — Electron Worker teardown timeouts on Linux CI under xvfb. Re-enabling e2e blocked on this.
3. **Small follow-ups fix-sweep** — trace-logging flood, tree-sitter wasm bump, transcript panel dead code, Wave 92's transitive-gap follow-up.

---

## Wave 92 — what shipped (v2.17.0)

### Foundation tooling (the long-term value)

- **`npm run lockfile:sync`** — WSL2-native lockfile regeneration. Drives `~/lockgen/agent-ide/` (ext4) at Node 20.20.2 via `wsl.exe` from PowerShell. Writes `.lockfile-sync.marker` as provenance. 68s on warm cache.
- **`npm run lockfile:check`** — validates `package-lock.json` sha256 matches `.lockfile-sync.marker`. Advisory bypass: `LOCKFILE_SYNC_GUARD_BYPASS=1`.
- **`scripts/hooks/pre-push`** — POSIX shell git hook. Install once per clone: `git config core.hooksPath scripts/hooks`. Blocks pushes whose lockfile changes lack a valid marker.
- **CI canary in `ci.yml`** — `node scripts/lockfile-smoke.mjs` runs on all 3 OS after `npm ci --ignore-scripts`. Catches incomplete lockfiles before they ever land.
- **`scripts/lockfile-smoke.mjs`** + **`scripts/pin-toplevel.mjs`** — completeness check + version-preservation helpers (ported verbatim from Gamify Wave 9).

### Stryker activation

- `stryker.config.mjs` at root — `testRunner: 'vitest'`, `incremental: true`, `mutate: ['src/shared/**/*.ts', ...]` (tight v1 scope), `thresholds.break: 21`.
- `.github/workflows/ci-stryker.yml` — `mutation-incremental` on PR + push to master, `mutation-full` (`--force`) on weekly Monday cron. Both enforce `break: 21`.
- `npm run mutation:test` (incremental) and `mutation:test:full` (--force) scripts.
- `.stryker-tmp/` and `reports/stryker-incremental.json` + `reports/mutation/` gitignored.

### Docs + vendor-gotchas

- `.nvmrc` at repo root (`20`)
- `CLAUDE.md` has a new "Lockfile" subsection
- 3 vendor-gotcha files at `.claude/vendor-gotchas/`:
  - `wsl2-lockgen.md` (ported from Gamify, 5 universal gotchas)
  - `stryker.md` (ported from Gamify, 5 universal + Vitest runner specifics)
  - `stryker-electron.md` (Agent-IDE-native — 4-module no-touch list, subsystem-boundary expansion pattern, two load-bearing config options)

### Locked decisions (per `roadmap/wave-92-cross-platform-lockfile-stryker/wave-92-decisions.md`, 8 decisions)

- **D2 (pinned Phase 1):** single-pass `npm install --ignore-scripts --no-audit --no-fund` produces complete cross-platform lockfile at Node 20.20.2 / npm 10.8.2. No `--os` flags needed.
- **D5:** Stryker `mutate` v1 scope is `src/shared/**` only. Expansion deferred to a coverage-investment wave.
- **D6 (pinned Phase 6):** `break: 21` = floor(22.41) - 1. Anti-backslide only.
- **D8:** `@node-rs/xxhash` retained — load-bearing for `codebaseGraph/` (3 sites, named-import shape).
- `overrides.node-gyp: ^11.0.0` retained — still load-bearing (distutils removal in Python 3.12; verified Phase 5).
- `overrides.vite: 7.3.1` added — pins to known-good vite version (see "Known issues" below).

---

## Known issue — lockfile shipped as master+Stryker, NOT a sync-regenerated lockfile

**The wave's foundation tooling is in place, BUT the actual `package-lock.json` shipped in v2.17.0 was NOT produced by `lockfile:sync`.** It's master's pre-Wave-92 lockfile + `npm install --package-lock-only` adding only the Stryker tree.

**Why:** Phase 5's "from-scratch regen via WSL2" produced a complete cross-platform lockfile but with drifted transitives (vite 7.3.1 → 7.3.3 + multiple Babel transforms), causing 1077 renderer test failures on all 3 CI OS (`ReferenceError: React is not defined` — vite's React plugin transform regression). Pinning vite alone wasn't sufficient; too many other transitives also shifted.

**Resolution:** reverted lockfile to master + `npm install --package-lock-only @stryker-mutator/core@^9.6.1 @stryker-mutator/vitest-runner@^9.6.1` for minimal delta. Marker regenerated with `generatedBy: 'wave-92-phase-9-revert-and-add'` (honest provenance, not a `lockfile:sync` lie).

**Follow-up filed:** `roadmap/follow-ups/2026-05-16-pin-toplevel-transitive-gap.md` — captures the structural lesson. ADR Decision 3 ("preserve currently-resolved versions") protects top-level deps only via `pin-toplevel.mjs`; transitives can still drift on a from-scratch regen. Recommended fix: add `scripts/lockfile-drift-check.mjs` (compare old vs new lockfile, warn/fail on unexpected version changes) before `lockfile:sync` is trusted for the next regen.

**Practical implication:** the next time someone needs to regenerate the lockfile (add/remove a dep), running `npm run lockfile:sync` may produce another drifted state. Until the drift-check tooling lands, the safe pattern is `git checkout HEAD -- package-lock.json` + `npm install --package-lock-only @new-dep` for additions, or hand-craft via overrides for transitive pins.

---

## Open follow-ups (Wave 92 + carried over)

In `roadmap/follow-ups/`:
- **`2026-05-16-stryker-mutate-scope-expansion.md`** — widening Stryker's mutate scope beyond `src/shared/**` to subsystem-boundary exclusion (`!src/main/storage/**`, `!src/main/codebaseGraph/**`, etc., minus the 4 native modules). Wave 92's Phase 2 audit captured the corrected exclusion list. Coverage-investment wave material.
- **`2026-05-16-pin-toplevel-transitive-gap.md`** — see "Known issue" above. Add a drift-check script before next regen.
- `2026-05-13-tailwind-codepoint-and-treesitter-wasm-versions.md` — tailwind half fixed (Wave 88); tree-sitter wasm ABI drift still open.
- `2026-05-14-trace-logging-floods-console.md` — `log.info → log.debug` at 4 sites. Small `haiku-implementer` task.
- `2026-05-14-subagent-transcript-panel-dead-code.md` — `SubagentTranscriptPanel` defined but never mounted; decide re-mount vs delete.

In `roadmap/bugs/`:
- **`2026-05-15-e2e-teardown-hang.md`** — TRIAGED. Electron Worker teardown timeouts on every Linux e2e test under xvfb; e2e step disabled in `ci.yml` pending a focused fix-wave. Re-enabling is the prerequisite for restoring Playwright coverage.
- `2026-05-14-master-ci-ubuntu-windows-failures.md` — RESOLVED 2026-05-15 (Wave 88 ship tail).

---

## How the foundation works (for the next agent that needs to use it)

### To regenerate the lockfile (after adding/removing deps)

⚠️ **WARNING:** `lockfile:sync` currently produces drift on transitives (vite, Babel transforms, etc.) that can break CI. Until the drift-check tooling lands (`2026-05-16-pin-toplevel-transitive-gap.md`), the safer pattern is:

```powershell
# 1. Add the new dep without scripts (skips electron-rebuild)
npm install --package-lock-only --ignore-scripts <new-pkg>

# 2. Verify nothing else drifted
git diff package-lock.json | grep '"version"' | head -50

# 3. If only the new dep's tree changed: commit. Otherwise: revert + override the drifters.
```

The full `lockfile:sync` flow IS shipped and works mechanically (`npm run lockfile:sync` runs cleanly, produces a complete cross-platform lockfile, writes the marker). The issue is purely the transitive-drift consequence.

### To install the pre-push guard locally

```powershell
git config core.hooksPath scripts/hooks
```

One-time per clone. After this, pushes that touch `package-lock.json` without a valid `.lockfile-sync.marker` are blocked. Override per-push: `$env:LOCKFILE_SYNC_GUARD_BYPASS=1; git push`.

### To run mutation testing locally

```powershell
npm run mutation:test       # incremental against the saved baseline
npm run mutation:test:full  # full --force re-baseline (~2-3 min)
```

HTML report at `reports/mutation/mutation.html`. The baseline file at `reports/stryker-incremental.json` is gitignored — fresh clones pay a one-time full-run cost.

---

## Stashed work (preserved)

- `stash@{0}` — "pre-pivot WIP: wave-87 chat-orchestration + wave-m5 docs" (original pre-pivot state, untouched).
- `wave-87-chat-orchestration-cleanup` branch — 16 local-only commits, untouched. The 88→91 pivot supersedes Wave 87's substrate goals; user's call whether to resurrect or abandon.

---

## What to do next

1. **Wave 89 — ChatOnlyShell Layout Overhaul** — stacked terminals (interactive Claude on top, dev shell below) + overlay drawers floating full-height over the right portion. Phase 0 prerequisite: extend `useResizable` for sibling-stack resize (Wave 88 only proved fixed-edge consumer pattern). Run `/wave-plan 89` (or `/wave-plan-lite 89`).

2. **e2e teardown bug-wave** — `roadmap/bugs/2026-05-15-e2e-teardown-hang.md`. Probably its own focused Lane B bundling teardown-hang + per-spec drift (`roadmap/follow-ups/2026-05-13-electron-e2e-spec-drift.md`).

3. **Small fix-sweep** — bundle the trace-logging, tree-sitter wasm, transcript panel, and Wave 92 lockfile drift-check follow-ups into one cleanup wave.

4. **Stryker mutate-scope expansion + coverage investment** — separate initiative; not next-up but worth tracking as the natural pairing for raising the `break: 21` floor.

## Vendor knowledge

`/promote-vendor-lessons 92` is effectively a no-op for this wave — Phase 8 already wrote the 3 vendor-gotcha files directly into `.claude/vendor-gotchas/`. The structural lessons are captured. Future waves touching WSL2 lockfile generation OR Stryker auto-load these files via the nested-CLAUDE.md `@import` mechanism.
