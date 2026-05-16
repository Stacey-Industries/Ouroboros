---
status: DRAFT
created: 2026-05-16
updated: 2026-05-16
wave: 93
slug: fix-sweep-drift-and-cleanups
tag: v2.17.1
---

# Wave 93 — Fix Sweep: Lockfile Drift Check + Cleanups

## Status

DRAFT · target `v2.17.1` (patch — fix-sweep) · drafted 2026-05-16.

## Context

Wave 92 (Cross-Platform Lockfile + Stryker, SHIPPED 2026-05-16, v2.17.0) shipped the lockfile generation foundation but surfaced a known gap at wrap: `pin-toplevel.mjs` only pins top-level deps, so a from-scratch regen can pull transitive minor/patch drift. The bug bit Wave 92's first PR push when `vite` 7.3.1 → 7.3.3 broke 1077 renderer tests on macOS; final fix used `npm install --package-lock-only` to add only the Stryker tree (preserving master's known-good transitive resolution). Until the drift gap is closed, the next dep addition must use the `--package-lock-only` workaround documented in `roadmap/HANDOFF.md`. Captured at `roadmap/follow-ups/2026-05-16-pin-toplevel-transitive-gap.md`.

Three other small follow-ups have accumulated since Wave 88 that bundle naturally with the drift work because none of them are large enough to justify a wave on their own and they are independent (no shared files, no shared subsystems):
- `roadmap/follow-ups/2026-05-14-trace-logging-floods-console.md` — 4 mechanical `log.info` → `log.debug` edits across 3 files; the floods make dev console unreadable, but the traces are still load-bearing diagnostics for two OPEN bugs so deletion is wrong.
- `roadmap/follow-ups/2026-05-13-tailwind-codepoint-and-treesitter-wasm-versions.md` (tree-sitter half only) — `web-tree-sitter@0.22.6` supports ABI 13-14 but `@vscode/tree-sitter-wasm@0.3.1` ships ABI 15 grammars, so the parser fails to load javascript/python grammars at runtime. Research confirms `web-tree-sitter@0.26.8` is current; ABI 15 added in 0.25.0. Agent IDE's usage is `Parser.init()` + `Parser.Language.load()` only (verified `src/main/codebaseGraph/treeSitterParser.ts:86,120`) — no deprecated `Language.query()` API, so the bump is API-transparent. The tailwind half is NOT in scope (unbounded investigation; belongs to Lane B).
- `roadmap/follow-ups/2026-05-14-subagent-transcript-panel-dead-code.md` — `src/renderer/components/Layout/ChatOnlyShell/SubagentTranscriptPanel.tsx` is defined and exported but never mounted; only references are the file itself, doc/CLAUDE.md mentions, and one integration test (`ChatWorkbenchFollowThrough.integration.test.tsx`) whose Wave-88 hot-patch dropped the panel assertion. Follow-up author recommends deletion (option 2); Cole confirmed deletion in scoping.

This is a sanctioned fix-sweep wave per the pipeline's "Lane A — Fix-sweep waves" carve-out: 4 small items, no single-feature unifying theme, phases group related items rather than building features.

## Goal

After Wave 93, Agent IDE has a `scripts/lockfile-drift-check.mjs` invoked as `npm run lockfile:check:drift` that diffs an old vs new `package-lock.json` and surfaces every transitive version change with severity (patch / minor / major), wired into `scripts/lockfile-sync.mjs` so any future regen fails loud on unintended drift instead of silently shipping it. The four `[trace:agent-record]` / `[trace:ctx-preview]` `log.info` sites are lowered to `log.debug` so the dev console is readable while the diagnostic instrumentation stays in place for the still-open eviction bugs. `web-tree-sitter` is bumped to `0.26.8` so the existing `@vscode/tree-sitter-wasm@0.3.1` grammar files load cleanly — codebase-graph indexing of javascript/python files no longer falls back to non-tree-sitter parsing. `SubagentTranscriptPanel.tsx` and its testid plumbing are deleted, the ChatOnlyShell CLAUDE.md composition entry is corrected, and any orphan imports are removed. HANDOFF.md flips to reflect the closed gaps; the `--package-lock-only` workaround note is removed from the lockfile section.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/wave-93-fix-sweep-drift-and-cleanups/wave-93-decisions.md`.

1. **Drift-check approach: option 3 from the follow-up** — implement `scripts/lockfile-drift-check.mjs` that diffs old vs new lockfile JSON and warns/fails on any transitive version change ≥ patch. Does NOT extend `pin-toplevel.mjs` to sweep-pin transitives via `overrides` (option 2 — bloats `package.json`, loses semver intent, fights npm's design). Does NOT migrate to pnpm (option 4 — separate initiative). Surfaces drift loudly BEFORE push; human decides which to override.
2. **Drift severity gate: fail on minor+, warn on patch.** Patch bumps within a major version are usually safe (security patches included). Minor bumps cross a deliberate semver boundary and have historically introduced regressions (Wave 92's vite 7.3.1 → 7.3.3 was a patch and still broke; the rule is judgment-informed but not perfectly accurate). Fail-on-minor is the conservative default; patch warnings let the human override or accept.
3. **Wrapper integration: `lockfile-sync.mjs` invokes the drift checker post-regen, pre-marker-write.** If drift checker exits non-zero, the marker is NOT written — so the pre-push guard from Wave 92 Phase 4 will block any push of the drifted lockfile until the human either accepts the drift (re-run with `--accept-drift` flag) or fixes it. Defense in depth: drift-check is the warning layer; pre-push guard is the gate.
4. **`web-tree-sitter` target version: 0.26.8 (current stable).** Not pinning intermediate — the API surface we use (`Parser.init`, `Parser.Language.load`) is unchanged across 0.22→0.26. ABI 15 support added in 0.25.0; 0.26.8 is the current head and recommended in upstream releases. No deprecated `Language.query()` usage in Agent IDE (verified via grep), so the ESM/CJS module-format change is the only structural risk — Phase C verifies via build + grammar-load smoke.
5. **Trace-logging change: lower to `log.debug` at all 4 sites.** Not delete (the `chat-state-architecture-overhaul` follow-up explicitly says keep them through discovery). Not add a debug flag (no existing renderer debug-flag pattern; net-new mechanism unwarranted for 4 lines). `electron-log`'s console transport defaults to `info`, so `debug` is silently dropped unless someone sets `log.transports.console.level = 'debug'`.
6. **Dead code: delete, not re-mount.** `SubagentTranscriptPanel` was deliberately consolidated into the `monitor` tab via `useWorkbenchSurfacePolicy`'s `openUtility({ tab: 'monitor' })`. Re-mounting would fight that consolidation. Confirmed with Cole during scoping.

## Scope

**In scope:**

- **Phase A** — `scripts/lockfile-drift-check.mjs` (~60 lines): reads two `package-lock.json` paths from argv, walks `packages` keys, diffs versions, classifies changes (patch / minor / major / added / removed), prints a structured report. Exits 0 on no-drift or only patch-drift; exits 2 on any minor-or-major drift; exits 0 with `--accept-drift` regardless. Add `lockfile:check:drift` script to `package.json`. Wire into `scripts/lockfile-sync.mjs` post-regen — snapshot the lockfile before regen, run the drift checker after, skip marker-write on non-zero exit. Update `roadmap/HANDOFF.md` lockfile section to remove the `--package-lock-only` workaround note (drift-check now catches what the workaround was avoiding).
- **Phase B** — Lower 4 `log.info` → `log.debug` calls at the locations enumerated in the follow-up: `src/main/hooksDispatchLogic.ts:38`, `src/renderer/components/AgentChat/ComposerContextPreview.tsx:86,100-101` (2-3 edits), `src/renderer/hooks/useAgentEvents.ruleSkillDispatchers.ts:96`. No import changes, no logic changes, no test coverage needed (log-level change).
- **Phase C** — Bump `web-tree-sitter` 0.22.6 → 0.26.8 in `package.json`; regenerate `package-lock.json` via `npm run lockfile:sync` (validates Phase A end-to-end — if the drift checker fires on this dep bump, that's a Phase A bug and gates this phase). Run `npm run typecheck` + `npm run test:codebasegraph` to verify the API-compatibility claim. Verify at runtime that `treeSitterParser.ts` successfully loads javascript and python grammars without the `Incompatible language version 15` error. Boundary phase — orchestrator authors failing acceptance test before dispatch (vendor SDK contract).
- **Phase D** — Delete `src/renderer/components/Layout/ChatOnlyShell/SubagentTranscriptPanel.tsx`. Audit and remove any now-orphaned imports (only `SubagentTranscriptPanel`-importing files; the grep found only doc/test references). Update `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` to remove the `SubagentTranscriptPanel` composition-tree entry. Audit `ChatWorkbenchFollowThrough.integration.test.tsx` for any stale references and clean them up (Wave-88 hot-patch dropped the assertion but the reference may remain in setup/imports).
- **Phase E** — Wave wrap: scoped tests (`test:main`, `test:renderer`, `test:codebasegraph`), full lint + typecheck + formatter, `/review` mechanical gap-check, `wave-93-result.md`, `CHANGELOG.md [2.17.1]`, `git tag v2.17.1` post-CI, `HANDOFF.md` flip, `/promote-vendor-lessons 93` (tree-sitter is a vendor — Phase C lessons promote to `.claude/vendor-gotchas/tree-sitter.md`).

**Out of scope:**

- **Tailwind v4 codepoint error** (the other half of `2026-05-13-tailwind-codepoint-and-treesitter-wasm-versions.md`) — investigation unbounded (could be one-line stray backslash in tokens.css OR a tailwind v4 upstream regression). Belongs to Lane B (B0/B1 with reproduction first), not bundled into a fix-sweep.
- **Stryker `mutate` glob expansion** (`2026-05-16-stryker-mutate-scope-expansion.md`) — too large for a fix-sweep; deserves its own wave with per-tier `--dry-run` validation per the follow-up's expansion plan.
- **e2e teardown bug** (`roadmap/bugs/2026-05-15-e2e-teardown-hang.md`) — separate Lane B fix-wave per Cole's preference at Wave 92 wrap.
- **Re-mount `SubagentTranscriptPanel` as a distinct surface** — Decision 6: deletion is correct; re-mount would fight the deliberate `monitor`-tab consolidation.
- **Extending drift-check to handle `overrides`** (e.g., what happens when a user adds an `overrides` entry between regens) — first version handles the unintended-drift case; explicit `overrides` is intentional and out of scope until needed.
- **Migrating off `web-tree-sitter` to a native binding** — vendor switch, not in this wave.

## Phases

| Phase | Topic | Implementer | Notes |
| ----- | ----- | ----------- | ----- |
| A | Lockfile drift-check script + wrapper integration | sonnet-implementer | Write `scripts/lockfile-drift-check.mjs` (~60 lines, pure node, no deps): `node scripts/lockfile-drift-check.mjs <old-lockfile> <new-lockfile> [--accept-drift]`. Walks both lockfiles' `packages` keys, classifies each delta as patch/minor/major/added/removed via semver-parse, prints a colored report grouped by severity, exits 2 on minor+ unless `--accept-drift`. Wire into `scripts/lockfile-sync.mjs`: before regen, copy current `package-lock.json` to a temp path; after regen, run the drift check; on non-zero exit, do NOT write `.lockfile-sync.marker` and print the recovery instructions (re-run with `--accept-drift` env var, or hand-fix). Add `"lockfile:check:drift": "node scripts/lockfile-drift-check.mjs"` to `package.json` scripts. Update `roadmap/HANDOFF.md` to remove the `--package-lock-only` workaround note. Unit test: `scripts/lockfile-drift-check.test.mjs` covering 5 cases (no drift, patch-only drift, minor drift, major drift, added/removed deps). Test shape: **pyramid** (pure logic). |
| B | Lower trace-logging to `log.debug` | haiku-implementer | 4 mechanical edits, `log.info` → `log.debug`, at exact locations: `src/main/hooksDispatchLogic.ts:38` (1), `src/renderer/components/AgentChat/ComposerContextPreview.tsx:86,100,101` (2-3 depending on whether line 101 is a separate `log.info` call), `src/renderer/hooks/useAgentEvents.ruleSkillDispatchers.ts:96` (1). No import changes. No logic changes. No test changes. Brief explicitly: "Your tools are Read/Edit/Write. You CANNOT run tests, lint, or git. After editing, report DONE." Test shape: **n/a** (log-level change, no behavior change). |
| C | Bump `web-tree-sitter` 0.22.6 → 0.26.8 (vendor SDK boundary) | sonnet-implementer | **Boundary phase — vendor SDK contract.** Orchestrator authors failing acceptance test BEFORE dispatch: `src/main/codebaseGraph/treeSitterParser.integration.test.ts` (or extend existing) that calls `createTreeSitterParser()` and loads BOTH `javascript` and `python` grammars from disk, asserting no error thrown and `parser.parse('const x = 1;').rootNode.type === 'program'`. Subagent cannot modify the test. Update `package.json` dep `web-tree-sitter` to `^0.26.8`. Run `npm run lockfile:sync` — this also validates Phase A end-to-end (drift-check should pass since only `web-tree-sitter` and its transitives are intentionally changing; if drift-check fires on unrelated deps, that's a Phase A bug and gates this). Run `npm run typecheck` + `npm run test:codebasegraph` + the new acceptance test. Verify grammar load at runtime (script or manual: load javascript grammar via `treeSitterParser.ts`, parse a sample file, confirm no `Incompatible language version` warning). If the ESM/CJS module-format change requires import-path updates, do those in this phase. Test shape: **honeycomb** (vendor SDK seam, real integration). |
| D | Delete `SubagentTranscriptPanel` + orphan audit | haiku-implementer | Delete `src/renderer/components/Layout/ChatOnlyShell/SubagentTranscriptPanel.tsx`. Read `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` and remove the `SubagentTranscriptPanel` line from the Wave 46/47 composition-tree section. Read `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchFollowThrough.integration.test.tsx` and remove any remaining `SubagentTranscriptPanel` / `workbench-subagent-panel` references (imports, setup helpers, commented-out assertions). Do a final grep to confirm `SubagentTranscriptPanel` and `workbench-subagent-panel` return zero matches under `src/`. Brief explicitly: "Your tools are Read/Edit/Write. You CANNOT run tests or git. After editing, report DONE." Test shape: **n/a** (deletion + cleanup). |
| E | Wave wrap | orchestrator | Scoped suites: `npm run test:main` (Phase A's test + Phase B's logger reach), `npm run test:renderer` (Phase B + Phase D), `npm run test:codebasegraph` (Phase C). Then `npm run test` if time permits. `npm run lint`, `npm run typecheck`, formatter. `/review` mechanical gap-check — verdict gates merge. Orchestrator diff review of the whole wave. `wave-93-result.md`, `CHANGELOG.md [2.17.1]` entry, `git tag v2.17.1` post-CI, `HANDOFF.md` flip (Wave 93 SHIPPED; next per Cole — Wave 89 ChatOnlyShell or e2e-teardown bug-wave), `/promote-vendor-lessons 93` (creates/updates `.claude/vendor-gotchas/tree-sitter.md` with the ABI-15 lesson). Test shape: **n/a**. |

### Phase ordering

Phase A is the gate for Phase C (the dep bump regenerates the lockfile and is the real-world drift-check test). Phase B is independent — can run in parallel with A and C. Phase D is independent — no shared files with any other phase, can run anytime before E. Phase E blocks on all.

```
Phase A (drift-check script + wire)
   |
   v
Phase C (web-tree-sitter bump — exercises drift-check end-to-end)
   |
   |    Phase B (log.info → log.debug — independent, parallel)
   |    Phase D (delete dead component — independent, parallel)
   |       |              |
   +-------+--------------+
                          |
                          v
                Phase E (wave wrap)
```

Blocking phases: **Phase A blocks Phase C.** **Phase E blocks on all.** Phases B and D have no dependencies and can dispatch in parallel as soon as Phase A completes (or even earlier — they touch no shared files with A).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Phase A's drift checker has false positives (e.g., classifies a dep that was added as drift), blocking legitimate regens. | Unit tests in Phase A cover the 5 classification cases. Real-world test is Phase C — if drift-check fires on anything other than `web-tree-sitter` and its transitives, that's a Phase A bug surfaced before push. The `--accept-drift` escape hatch is the human-override path. |
| Phase A's wrapper integration breaks `lockfile:sync` for non-drift-related reasons (e.g., the pre-regen snapshot path collides with another temp file). | Phase A's edit to `lockfile-sync.mjs` is small (~10 lines: snapshot, run check, branch on exit code). Phase C exercises the full wrapper end-to-end. If wrapper breaks, Phase C surfaces it before the wave can land. |
| `web-tree-sitter@0.26.8`'s ESM/CJS module-format change breaks Agent IDE's import path. | Research confirms the core API (`Parser.init`, `Parser.Language.load`) is unchanged. The risk surface is bundler-level. Phase C's typecheck + `test:codebasegraph` + grammar-load smoke test catches this. If the bump requires `.cjs` extension or import path tweaks, those are in scope for Phase C. |
| `web-tree-sitter@0.26.8` bump pulls transitive drift that Phase A's checker flags, gating the wave on what's logically the foundation test. | This is the WORKING-AS-INTENDED case for the wave. The drift checker correctly flags any unintended transitives; human reviews and either pins, accepts, or fixes. If the transitives are clean (only `web-tree-sitter` itself changes), drift-check passes silently. |
| Phase D leaves a dead import in `ChatWorkbenchFollowThrough.integration.test.tsx` that Phase E's `test:renderer` catches as a broken import. | Phase D's brief explicitly requires a final grep for `SubagentTranscriptPanel` and `workbench-subagent-panel` returning zero matches under `src/`. Phase E's scoped test suite is the second-layer catch. |
| The four trace-log sites in Phase B drift to different lines between plan-write and dispatch (someone touches the files first). | Brief includes the grep pattern (`log.info('[trace:agent-record]'` and `log.info('[trace:ctx-preview]'`) so the implementer finds them regardless of exact line. If the line moves, the grep still works. |
| Vendor-gotcha promotion at wave wrap collides with an existing `.claude/vendor-gotchas/tree-sitter.md` (unlikely — no current file). | Pre-check at Phase E: list `.claude/vendor-gotchas/`; if `tree-sitter.md` exists, append rather than overwrite. `/promote-vendor-lessons 93` handles this conventionally. |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
| ----- | ---- | ----------- | ----- |
| A | `scripts/lockfile-drift-check.test.mjs` — 5 cases: no-drift / patch-only / minor / major / added-removed | none | Pure-logic phase. Pyramid shape. The "integration" is Phase C's end-to-end exercise. |
| B | none | none | Log-level change, no behavior change. Existing tests still pass because `log.debug` is silently dropped at info level (same observable behavior). |
| C | none new | Orchestrator-authored acceptance test in `src/main/codebaseGraph/treeSitterParser.integration.test.ts` — loads js + py grammars from disk, asserts no ABI error. Existing `test:codebasegraph` suite re-runs to catch any regression in graph indexing. | Honeycomb shape. Boundary = vendor SDK. The acceptance test is the contract — bumping the dep must keep `Parser.Language.load(javascript_wasm)` working. |
| D | none | Existing `ChatWorkbenchFollowThrough.integration.test.tsx` re-runs after cleanup to verify no import breakage. | Deletion phase. No new tests; existing tests are the safety net for "did the cleanup remove too much." |
| E | n/a | n/a | Wrap phase. Full scoped suites + lint + typecheck + `/review`. |

## Acceptance criteria

- [ ] `scripts/lockfile-drift-check.mjs` exists, ≤ 100 lines, no external deps.
- [ ] `npm run lockfile:check:drift -- <old> <new>` exits 0 on identical lockfiles, exits 0 with patch-only diff, exits 2 on minor diff, exits 2 on major diff.
- [ ] `npm run lockfile:check:drift -- <old> <new> --accept-drift` exits 0 regardless of severity.
- [ ] `scripts/lockfile-sync.mjs` runs the drift checker post-regen; on non-zero exit, the `.lockfile-sync.marker` is NOT written and a recovery message names the `--accept-drift` flag or fix path.
- [ ] `roadmap/HANDOFF.md` lockfile section no longer contains the `--package-lock-only` workaround note.
- [ ] `grep -rn "log\.info\('\[trace:agent-record\]" src/` returns zero hits.
- [ ] `grep -rn "log\.info\('\[trace:ctx-preview\]" src/` returns zero hits.
- [ ] `grep -rn "log\.debug\('\[trace:agent-record\]" src/` returns ≥ 2 hits (sites preserved).
- [ ] `grep -rn "log\.debug\('\[trace:ctx-preview\]" src/` returns ≥ 2 hits (sites preserved).
- [ ] `package.json` declares `"web-tree-sitter": "^0.26.8"`; `package-lock.json` resolves it.
- [ ] `npm run test:codebasegraph` passes.
- [ ] The new tree-sitter acceptance test (`treeSitterParser.integration.test.ts`) passes, asserting no `Incompatible language version` error when loading javascript + python grammars.
- [ ] `find src -name SubagentTranscriptPanel.tsx` returns zero results.
- [ ] `grep -rn "SubagentTranscriptPanel\|workbench-subagent-panel" src/` returns zero hits.
- [ ] `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` no longer references `SubagentTranscriptPanel`.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test:main`, `npm run test:renderer`, `npm run test:codebasegraph` all pass at wrap.
- [ ] `/review` returns PASS or FLAG-with-flags-addressed.
- [ ] `CHANGELOG.md` has a `[2.17.1]` entry; `git tag v2.17.1` exists post-CI.
- [ ] `roadmap/HANDOFF.md` flipped to "Wave 93 SHIPPED" with next-wave options listed.
- [ ] `.claude/vendor-gotchas/tree-sitter.md` exists or is updated with the ABI-15 / 0.22 → 0.26 lesson.

## Verification

### Per-phase experiential observation

| Phase | Observation point | Path to it | What "working" looks like there |
| ----- | ----------------- | ---------- | ------------------------------- |
| A | Terminal output of `npm run lockfile:sync` after a deliberate transitive drift | shell → `lockfile-sync.mjs` → spawns WSL2 `npm install` → snapshot diff → drift-check exit 2 → marker NOT written → recovery message printed to stdout | The user runs `lockfile:sync`, sees a structured drift report listing each changed dep with severity, sees the message "marker not written — re-run with --accept-drift or fix the drift," and the working tree's `package-lock.json` is the regenerated one (so the human can inspect) but `.lockfile-sync.marker` is absent so the pre-push guard will block. |
| B | Dev console of the running Electron dev session during a chat startup | `npm run dev` → Electron main + renderer launch → `instructions_loaded` hook fires → renderer console transport (`electron-log`) at level=info → `log.debug` line silently dropped | The user opens dev tools after starting a chat with rules loaded; the console is no longer flooded with `[trace:agent-record]` / `[trace:ctx-preview]` lines. The user sees normal startup logs without 50+ trace lines in a 2-second burst. If the user manually sets `log.transports.console.level = 'debug'` in the dev tools console, the traces reappear (preservation verified). |
| C | Real codebase-graph index of a project containing javascript or python source | `treeSitterParser.ts` → `Parser.init()` → `Parser.Language.load(path/to/javascript.wasm)` → no `Incompatible language version 15` error → parser instance returned → graph indexer parses files normally | The user opens a project with `.js` or `.py` files in Agent IDE; the graph indexer runs (visible in main-process logs); the `[treeSitterParser] load failed: javascript ... Incompatible language version 15` error is GONE from the logs; symbol resolution for javascript/python in the codebase-graph queries returns tree-sitter-grade results (not fallback). |
| D | `ChatOnlyShell` rendered in a live IDE session, plus the dev tools elements panel | `ChatOnlyShell` mount → composition tree renders → DOM has no element with `data-testid="workbench-subagent-panel"` | The user opens the IDE, lands in the ChatOnlyShell; the layout is visually identical to before the deletion (the component was already unmounted in production — deleting the file is invisible to the user). Dev tools elements panel search for `workbench-subagent-panel` returns zero matches. The integration test suite still passes (no broken imports). |
| E | `npm run test`, `npm run lint`, `npm run typecheck` all green; CI run on the PR all green across 3-OS; `git tag v2.17.1` pushed | terminal → CI workflow → 3-OS matrix → green checks on PR | All gates pass. PR merges. `git tag -l v2.17.1` returns the tag. The wave-93-result.md is on master. |

### Data-shape probes

```bash
# Phase A — drift script behavior
node scripts/lockfile-drift-check.mjs /tmp/old.json /tmp/new.json && echo OK
node scripts/lockfile-drift-check.mjs /tmp/old.json /tmp/minor-drift.json; test $? -eq 2 && echo "minor-blocks-correctly"
node scripts/lockfile-drift-check.mjs /tmp/old.json /tmp/minor-drift.json --accept-drift && echo "override-works"

# Phase A — marker discipline
ls -la .lockfile-sync.marker  # should NOT exist after a drift-triggering regen without --accept-drift

# Phase B — trace silencing
grep -rn "log\.info('\[trace:agent-record\]" src/  # expect: zero
grep -rn "log\.info('\[trace:ctx-preview\]" src/  # expect: zero
grep -rn "log\.debug('\[trace:agent-record\]" src/  # expect: >=2
grep -rn "log\.debug('\[trace:ctx-preview\]" src/  # expect: >=2

# Phase C — version + load
node -e "console.log(require('./package.json').dependencies['web-tree-sitter'] || require('./package.json').devDependencies['web-tree-sitter'])"
# expect: ^0.26.8 or 0.26.8
npx vitest run src/main/codebaseGraph/treeSitterParser.integration.test.ts

# Phase D — deletion
test ! -f src/renderer/components/Layout/ChatOnlyShell/SubagentTranscriptPanel.tsx && echo "deleted"
grep -rn "SubagentTranscriptPanel\|workbench-subagent-panel" src/  # expect: zero

# Phase E — version + tag
git tag -l v2.17.1
grep "## \[2.17.1\]" CHANGELOG.md
```

## Files the next agent should read first

1. `roadmap/wave-93-fix-sweep-drift-and-cleanups/wave-93-decisions.md` — ADR with the 6 locked decisions; read first.
2. `roadmap/follow-ups/2026-05-16-pin-toplevel-transitive-gap.md` — Phase A's source-of-truth follow-up with the recommended option and rationale.
3. `roadmap/follow-ups/2026-05-14-trace-logging-floods-console.md` — Phase B's exact site list + per-site rationale (why-not-delete is important).
4. `roadmap/follow-ups/2026-05-13-tailwind-codepoint-and-treesitter-wasm-versions.md` — Phase C source; read ONLY the tree-sitter half (sections 2 + "Fix shape" + "Verification"). The tailwind half is out of scope.
5. `roadmap/follow-ups/2026-05-14-subagent-transcript-panel-dead-code.md` — Phase D source; the "Option 2 — Delete it" subsection is the picked path.
6. `scripts/lockfile-sync.mjs` (214 lines) — Phase A wrapper integration target. Read end-to-end before editing.
7. `scripts/pin-toplevel.mjs` — context for what the drift-checker complements (NOT replaces). Read for understanding only.
8. `src/main/codebaseGraph/treeSitterParser.ts` — Phase C target. Lines 86 (`Parser.init`) and 120 (`Parser.Language.load`) are the API surfaces being validated against the bump.
9. `src/renderer/components/Layout/ChatOnlyShell/SubagentTranscriptPanel.tsx` — Phase D delete target; read once to confirm zero non-test consumers before deletion.
10. `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` — Phase D doc update target.
11. `roadmap/HANDOFF.md` — wave-end flip target; also has the current `--package-lock-only` workaround note that Phase A removes.
12. `roadmap/wave-92-cross-platform-lockfile-stryker/waveplan-92.md` — exemplar wave shape; reference for any ambiguity about section structure.

## Note to the implementer

This is a fix-sweep wave — four independent small items bundled because each is too small to justify a wave on its own. The spirit is: close small open gaps that have accumulated, leave the codebase cleaner than you found it, do not extend scope.

The temptation to resist is treating Phase A as an opportunity to redesign `lockfile-sync.mjs`. Don't. Phase A is a ~60-line script + ~10-line wrapper integration. If you find a deeper structural issue in `lockfile-sync.mjs` (e.g., the existing 5-WSL2-gotchas list misses one), file it as a Tier 3 follow-up and keep moving. Same for Phase C: if the `web-tree-sitter` bump surfaces a deeper issue with `treeSitterParser.ts`'s ABI fallback logic, that's a Tier 3 follow-up, not in-wave work. Phase D is deletion — do not "improve" the surrounding ChatOnlyShell composition while you're there. Phase B is mechanical — do not also tidy up the surrounding hook code while you're editing the trace lines.

The boundary phase is Phase C (vendor SDK contract). The orchestrator authors `src/main/codebaseGraph/treeSitterParser.integration.test.ts` BEFORE dispatching the subagent; the subagent cannot modify it. The test asserts the contract: load javascript + python grammars, no ABI error. That is the pass criterion — not "tests I wrote myself pass."

> Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

For Phase B specifically: "tests pass" is necessary but the observation is "dev console is no longer flooded." Start `npm run dev`, open dev tools, start a chat, look at the console. If you cannot, say so — and the orchestrator runs that smoke before wrap.

## Orchestrator dispatch checklist

A green per-phase gate with nothing Tier 3 means the orchestrator dispatches the next phase in the same turn. The turn ends between phases only for a Tier 3 discovery needing a user call, a genuine user-judgment decision the grounding doesn't determine, or wave-end. See the Phase-boundary protocol in `~/.claude/notes/wave-process.md`.

1. **Verify ADR exists at `roadmap/wave-93-fix-sweep-drift-and-cleanups/wave-93-decisions.md`** with all 6 decisions filled in (Phase 0). If any decision is still stubbed, fill it now from this plan's "Locked decisions" section.
2. **Phase A** (sonnet-implementer) — `scripts/lockfile-drift-check.mjs` + wrapper wire-up + unit tests. Gate: `npx vitest run scripts/lockfile-drift-check.test.mjs` passes (5 cases); manual smoke: hand-craft an old/new pair with minor drift and confirm exit 2. Boundary classification: NOT a boundary phase (tooling-internal). No `sonnet-phase-reviewer` dispatch — orchestrator's own diff glance.
3. **Phase B** (haiku-implementer) — 4 mechanical log-level edits. Brief explicitly: "Your tools are Read/Edit/Write. You CANNOT run tests, lint, or git. After editing, report DONE." Gate: orchestrator runs `npm run lint` on touched files; greps confirm 0 `log.info` for the two trace tags and ≥ 2 `log.debug` each. Trivial phase — no `sonnet-phase-reviewer` dispatch. **Can dispatch in parallel with Phase A — no shared files.**
4. **Phase D** (haiku-implementer) — delete + CLAUDE.md update + integration test reference cleanup. Brief explicitly: "Your tools are Read/Edit/Write. You CANNOT run tests or git." Gate: orchestrator runs `grep -rn 'SubagentTranscriptPanel\|workbench-subagent-panel' src/` and confirms zero hits; `npm run test:renderer` passes (catches any broken imports). Trivial phase — no `sonnet-phase-reviewer` dispatch. **Can dispatch in parallel with Phases A and B — no shared files.**
5. **Phase C** (sonnet-implementer) — `web-tree-sitter` 0.22.6 → 0.26.8 bump. **Boundary phase — orchestrator authors `src/main/codebaseGraph/treeSitterParser.integration.test.ts` BEFORE dispatch, runs it locally to confirm it FAILS (right now, against 0.22.6 + ABI 15 grammars — should fail with the ABI error).** Then dispatch with the brief naming the test path and "you may not modify it." Gate: the acceptance test passes; `npm run typecheck` passes; `npm run test:codebasegraph` passes; drift-check from Phase A passes (real-world validation). **`sonnet-phase-reviewer` dispatch on the diff before declaring the gate green** — boundary phase, vendor SDK, mental-model divergence risk is real. **Blocks on Phase A** (drift-check must work before this exercises it).
6. **Phase E** (orchestrator) — wave wrap. Run scoped suites (`test:main`, `test:renderer`, `test:codebasegraph`), `npm run lint`, `npm run typecheck`, formatter. `/review` mechanical gap-check — verdict gates merge (PASS or FLAG with all flags addressed). Orchestrator diff review of the whole wave. Run the data-shape probes from the Verification section. Write `wave-93-result.md`. `CHANGELOG.md [2.17.1]` entry. `git push`, await CI, squash-merge on green. `git tag v2.17.1` post-CI; push tag. `HANDOFF.md` flip (Wave 93 SHIPPED; next per Cole — Wave 89 ChatOnlyShell or e2e-teardown bug-wave). `/promote-vendor-lessons 93` — extracts tree-sitter lessons to `.claude/vendor-gotchas/tree-sitter.md`. Manual smoke gate: NOT required — no `src/renderer/components/Layout/**` user-facing changes (Phase D is a delete of an unmounted component; visually identical).
