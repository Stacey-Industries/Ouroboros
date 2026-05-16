# Session Handoff — 2026-05-16 (Wave 93 SHIPPED, CI gate bypassed)

**Audience:** the next Claude Code session.

---

## TL;DR

**Wave 93 (Fix Sweep: Lockfile Drift Check + Cleanups) is shipped** — released as **v2.17.1**, tagged. Four small follow-ups bundled into one patch wave; ~3 hours wall-clock; A/B/D dispatched in parallel, C blocked on A.

Closed:
- Wave 92's transitive-drift gap (Phase A — `scripts/lockfile-drift-check.mjs` + `lockfile-sync.mjs` integration).
- Console-flood from `[trace:agent-record]` / `[trace:ctx-preview]` (Phase B — `log.info` → `log.debug` at 5 sites).
- `web-tree-sitter` ABI 15 incompatibility (Phase C — bump `0.22.6` → `^0.26.8`; codebase-graph now uses `@vscode/tree-sitter-wasm@0.3.1` grammars cleanly instead of silently falling back).
- Dead `SubagentTranscriptPanel` component (Phase D — deleted; monitor-tab consolidation honored).

**⚠️ CI bypassed for v2.17.1.** GitHub Actions minutes exhausted (~16-day cooldown, refresh expected ~2026-06-01). Wave 93 shipped on local gates only:
- typecheck: clean
- lint: 0 errors, 4 pre-existing warnings (unchanged)
- `test:main`: 6345/6345
- `test:renderer`: 4104/4104
- `test:codebasegraph`: 672/672 (includes the new tree-sitter integration test)
- `test:agentchat`: 945/945

All Windows-local. Linux + macOS surfaces unverified for the v2.17.1 commits until CI minutes refresh. Risk surface is small: Phase A/B/D are pure-logic / log-level / deletion (no OS-specific behavior); Phase C is a vendor SDK bump where the cross-OS risk is `web-tree-sitter`'s wasm-loading path — which is the same `Parser.init({ locateFile })` call on every OS, and was verified Windows-local.

One CI run did execute (the wave's last action minutes) on the post-wave follow-up commit (`16e8c7f0`): **CI failure 1/11009** (flaky perf test on `threadStoreSearch.test.ts` — pre-existing, Wave-41-era code, not touched by Wave 93). **Mutation Testing (Stryker) passed cleanly** (1m17s, `break: 21` still holds). The flaky perf test is filed at `roadmap/follow-ups/2026-05-16-threadstoresearch-perf-test-flaky-windows-ci.md` with three fix options; option 1 (timeout bump under CI) is the recommended start.

When Actions minutes return, push any tiny change (or `gh run rerun`) to validate the v2.17.1 commits on Linux + macOS. The Wave 92 CI baseline was ~20min full suite + ~1.5min Stryker.

**Master CI was GREEN on all 3 platforms** (macOS, Ubuntu, Windows) as of Wave 92 ship (2026-05-16, commit `4f129140`).

**Next wave options** (Cole's call):
1. **Wave 89 — ChatOnlyShell Layout Overhaul** (stacked terminals + overlay drawers). Phase 0 = extend `useResizable` for sibling-stack resize (the Wave 88 prerequisite).
2. **e2e teardown bug-wave** (`roadmap/bugs/2026-05-15-e2e-teardown-hang.md`) — Electron Worker teardown timeouts on Linux CI under xvfb. Re-enabling e2e blocked on this.
3. **Stryker mutate-scope expansion** (`roadmap/follow-ups/2026-05-16-stryker-mutate-scope-expansion.md`) — widen Stryker's `mutate` globs beyond `src/shared/**` per the Phase-2 subsystem-boundary plan. Pairs naturally with a coverage investment to raise the `break: 21` floor.

---

## Wave 93 — what shipped (v2.17.1)

### Phase A — Lockfile drift checker

- **`scripts/lockfile-drift-check.mjs`** (176 lines, pure node, no deps) + `npm run lockfile:check:drift`. Diffs two `package-lock.json` files via JSON walk, classifies version changes by severity (patch / minor / major / prerelease / added / removed), prints structured ANSI report, exits 2 on minor+ unless `--accept-drift` is passed.
- **Wrapper integration**: `scripts/lockfile-sync.mjs` snapshots the lockfile pre-regen to `tmpdir()`, runs drift-check post-regen, and skips marker-write on non-zero exit. Recovery message names the `LOCKFILE_SYNC_ACCEPT_DRIFT=1` override. Defense in depth: drift-check is the warning layer; the Wave 92 pre-push guard is the gate.
- **6-case vitest test suite** at `scripts/lockfile-drift-check.test.mjs` (no-drift / patch-only / minor / major / added+removed / accept-drift override).

### Phase B — Trace silencing

5 `log.info` → `log.debug` edits across 4 files:
- `src/main/hooksDispatchLogic.ts:38` (`[trace:agent-record]` instructions-loaded)
- `src/renderer/components/AgentChat/ComposerContextPreview.tsx:86,100,101` (3 `[trace:agent-record]` + `[trace:ctx-preview]` calls)
- `src/renderer/components/AgentChat/ContextPreview.popover.tsx:278` (orchestrator-added; brief listed only ComposerContextPreview)
- `src/renderer/hooks/useAgentEvents.ruleSkillDispatchers.ts:96` (`[trace:agent-record]` write-rules)

Traces preserved for the still-open eviction-bug investigations (`2026-05-11-context-preview-rules-evicted-after-time.md`, `2026-05-07-context-preview-rules-disappear-after-chat-start.md`); `electron-log`'s renderer console transport defaults to `info` so debug lines are dropped unless someone enables them via `log.transports.console.level = 'debug'`.

### Phase C — web-tree-sitter 0.22.6 → ^0.26.8 (ABI 15)

- `package.json` bumped. `package-lock.json` regenerated via `npm install --package-lock-only --ignore-scripts` (minimal delta — only the web-tree-sitter entry changed; mirrors Wave 92's safe pattern, avoids unrelated transitive drift). `.lockfile-sync.marker` written with honest provenance `generatedBy: 'wave-93-phase-c-package-lock-only'`.
- Code adaptations across 5 files for the 0.25+ named-export rewrite: `import Parser from 'web-tree-sitter'` → `import { Language, type Node, Parser } from 'web-tree-sitter'`; `Parser.SyntaxNode` → `Node` (65 references mechanically renamed); `Parser.Language` → `Language`; `require.resolve('web-tree-sitter')` → `require.resolve('web-tree-sitter/web-tree-sitter.wasm')` (the wasm asset moved to an explicit export key in 0.26+).
- **Orchestrator-authored acceptance test** at `src/main/codebaseGraph/treeSitterParser.integration.test.ts` (per `~/.claude/rules/orchestrator-owned-acceptance-tests.md`): probes `Parser.setLanguage` with `@vscode/tree-sitter-wasm@0.3.1`'s ABI 15 javascript + python grammars; both load and parse without error. 2/2 pass post-bump (fails pre-bump with `Incompatible language version 15`).
- All 672 codebase-graph tests still pass.

### Phase D — SubagentTranscriptPanel deleted

- `src/renderer/components/Layout/ChatOnlyShell/SubagentTranscriptPanel.tsx` deleted (was exported but never mounted).
- ChatOnlyShell `CLAUDE.md` composition tree cleaned + Wave 47 Phase C entry softened to note the consolidation.
- `ChatWorkbenchFollowThrough.integration.test.tsx`'s "WHAT IS NOT MOCKED" comment scrubbed.

### Vendor knowledge

- **NEW**: `.claude/vendor-gotchas/tree-sitter.md` — captures the 0.22→0.26 migration lessons (ABI compatibility table, named-export rewrite, wasm export-key resolution, `Parser.SyntaxNode → Node` rename, lockfile-bump pattern). Auto-loaded by future waves touching `src/main/codebaseGraph/treeSitter*`.
- Other Wave-92 vendor-gotchas unchanged (`wsl2-lockgen.md`, `stryker.md`, `stryker-electron.md`).

### Locked decisions (per `roadmap/wave-93-fix-sweep-drift-and-cleanups/wave-93-decisions.md`, 6 decisions)

- D1: drift-check via diff-and-warn script (option 3 of follow-up's 4).
- D2: fail on minor+, warn on patch. `--accept-drift` is human-override.
- D3: drift-check runs post-regen, gates marker-write.
- D4: `web-tree-sitter` target ^0.26.8 (current stable; forward-pin not hold-back).
- D5: trace-logging lowered to `log.debug` (not deleted; not flag-gated).
- D6: `SubagentTranscriptPanel` deleted (not re-mounted) — honors the monitor-tab consolidation.

---

## Lockfile foundation — current state (post-Wave-93)

The `package-lock.json` in master was bootstrapped via `npm install --package-lock-only` during Wave 92 + extended by Wave 93 Phase C via the same minimal-delta pattern. Going forward, **lockfile regenerations flow through `npm run lockfile:sync`** — the Wave 93 drift checker now catches unintended transitive drift before marker-write.

### To regenerate the lockfile (after adding/removing deps)

```powershell
npm run lockfile:sync
```

The drift checker (`scripts/lockfile-drift-check.mjs`) runs automatically post-regen and gates marker-write. If it exits non-zero (minor/major transitive drift), the marker is NOT written and a recovery message is printed. Options:

- **Accept the drift:** `$env:LOCKFILE_SYNC_ACCEPT_DRIFT=1; npm run lockfile:sync`
- **Fix the drift:** inspect `git diff package-lock.json`, add `overrides` pins for the drifting transitives, then re-run.
- **Standalone check:** `npm run lockfile:check:drift -- <old-lockfile> <new-lockfile>`
- **Single-dep surgical bump** (avoids the full WSL2 regen): `npm install --package-lock-only --ignore-scripts <pkg>@<version>`, then manually write `.lockfile-sync.marker` with `generatedBy: '<descriptive-name>'` (see `.claude/vendor-gotchas/tree-sitter.md` for an example recovery). This bypasses `lockfile-sync` entirely.

### To install the pre-push guard locally

```powershell
git config core.hooksPath scripts/hooks
```

One-time per clone. Pushes that touch `package-lock.json` without a valid `.lockfile-sync.marker` are blocked. Override per-push: `$env:LOCKFILE_SYNC_GUARD_BYPASS=1; git push`.

### To run mutation testing locally

```powershell
npm run mutation:test       # incremental against the saved baseline
npm run mutation:test:full  # full --force re-baseline (~2-3 min)
```

HTML report at `reports/mutation/mutation.html`. The baseline file at `reports/stryker-incremental.json` is gitignored — fresh clones pay a one-time full-run cost.

---

## Open follow-ups (post-Wave-93)

In `roadmap/follow-ups/`:
- **`2026-05-16-stryker-mutate-scope-expansion.md`** — widening Stryker's mutate scope beyond `src/shared/**` to subsystem-boundary exclusion. Wave 92's Phase 2 audit captured the exclusion list. Pair with coverage investment to raise the `break: 21` floor.
- `2026-05-13-tailwind-codepoint-and-treesitter-wasm-versions.md` — status PARTIAL. Tree-sitter half closed by Wave 93 Phase C; tailwind half effectively closed by Wave 88 (`@source not` directive). File kept as historical record.
- Other older follow-ups remain — see `roadmap/follow-ups/` listing for the long-tail (mostly chat-orchestration / context-preview investigations).

In `roadmap/deferred/`: 6 deferred initiatives unchanged from Wave 92.

In `roadmap/bugs/`:
- **`2026-05-15-e2e-teardown-hang.md`** — TRIAGED. Electron Worker teardown timeouts under xvfb on Linux CI; e2e step still disabled in `ci.yml`. Re-enabling is the prerequisite for restoring Playwright coverage. Promotion candidate to a Lane B fix-wave.
- `2026-05-14-master-ci-ubuntu-windows-failures.md` — RESOLVED (Wave 88 ship tail).

Resolved this wave (status RESOLVED in their frontmatter, kept for history):
- `2026-05-16-pin-toplevel-transitive-gap.md` (Phase A)
- `2026-05-14-trace-logging-floods-console.md` (Phase B)
- `2026-05-14-subagent-transcript-panel-dead-code.md` (Phase D)

---

## Stashed work (preserved)

- `stash@{0}` — "pre-pivot WIP: wave-87 chat-orchestration + wave-m5 docs" (original pre-pivot state, untouched).
- `wave-87-chat-orchestration-cleanup` branch — 16 local-only commits, untouched. The 88→91 pivot supersedes Wave 87's substrate goals; user's call whether to resurrect or abandon.

---

## What to do next

1. **Wave 89 — ChatOnlyShell Layout Overhaul** — stacked terminals (interactive Claude on top, dev shell below) + overlay drawers floating full-height over the right portion. Phase 0 prerequisite: extend `useResizable` for sibling-stack resize (Wave 88 only proved fixed-edge consumer pattern). Run `/wave-plan 89` (or `/wave-plan-lite 89`).

2. **e2e teardown bug-wave** — `roadmap/bugs/2026-05-15-e2e-teardown-hang.md`. Probably its own focused Lane B bundling teardown-hang + per-spec drift (`roadmap/follow-ups/2026-05-13-electron-e2e-spec-drift.md`).

3. **Stryker mutate-scope expansion + coverage investment** — separate initiative; not next-up but worth tracking as the natural pairing for raising the `break: 21` floor. The Wave 92 Phase 2 audit captured the exclusion list; that's the starting point.

## Vendor knowledge

`/promote-vendor-lessons 93` should:
- Update `.claude/vendor-gotchas/wsl2-lockgen.md` with the drift-check addendum (the wrapper now gates marker-write on drift).
- Confirm `.claude/vendor-gotchas/tree-sitter.md` was written at Phase C (yes — it was; this just documents that lessons are captured).

Future waves touching `web-tree-sitter`, WSL2 lockgen, or Stryker auto-load these files via the nested-CLAUDE.md `@import` mechanism.
