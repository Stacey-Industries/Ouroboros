# Wave 83 — Electron renderer browser-MCP wiring (Path C — Playwright repro harness)

## Status

DRAFT · target v2.13.0 · drafted 2026-05-05.

## Context — why this wave exists

The global development-pipeline rule (`~/.claude/rules/development-pipeline.md`) defines Lane B B0 (bug reproduction) as a mandatory gate before diagnosing any UI bug. For web-SPA projects (Contractor App), "B0" means starting Vite, opening a browser MCP, and reproducing the bug autonomously. Agent IDE is an Electron desktop app, so the renderer is owned by Electron's main process and the browser MCPs in this environment can't reach it: `claude-in-chrome` is a Chrome extension that operates on the user's own Chrome (not a remote-CDP client), and `Claude_Preview` is not wired in this environment at all. Today every Agent IDE UI bug requires Cole to manually reproduce, screenshot, and paste console / network logs — the agent can't do B0 on its own.

Discovery (`roadmap/discovery/2026-05-05-electron-renderer-browser-mcp-wiring.md`) verified that the original follow-up's "Path A" (point `claude-in-chrome` at `http://localhost:5173`) and "Path B" (`--remote-debugging-port` + CDP attach) are both dead ends in this environment — Path A loses the preload bridge so the renderer doesn't bootstrap, and Path B has no consumer MCP. The discovery surfaced the actually-correct path: Agent IDE already has a working Playwright-electron e2e surface (`playwright.config.ts:26-35`, `e2e/electron.fixture.ts`, 12 existing specs). Wave 83 formalizes that surface as an agent-friendly bug-repro harness.

No companion bugfixes. No prior-wave delivery signal — wave 82.1 is on a different surface (chat-only workbench polish). The discovery doc is the single grounding artifact.

## Goal

A fresh Claude Code session in `C:\Web App\Agent IDE\` can reproduce an Electron-renderer UI bug by writing a one-off `e2e/_repro-<slug>.spec.ts` (copied from a shipped template), running `npm run repro -- <slug>`, and reading back screenshots, a console transcript, and a Playwright trace from `artifacts/repro-<slug>-<ts>/` — all without Cole touching anything.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/wave-83-electron-renderer-browser-mcp-wiring/wave-83-decisions.md`.

1. **Path C (Playwright-electron repro harness) is the chosen path.** Path A is dropped because the renderer needs the preload bridge to bootstrap, which is missing when loaded in a vanilla browser. Path B is dropped because no MCP in this environment can attach to a remote CDP endpoint.
2. **Repro target is the built artifact (`out/main/index.js`)**, not the dev server. Matches the existing 12 specs' fixture shape, avoids dev/prod divergence in repros, and the build cost (~30-60s) is paid once per fix cycle.
3. **Repro specs are authored as `.spec.ts` files directly** (copied from `e2e/_repro-template.spec.ts`), not via a custom JSON/YAML scenario DSL. The agent already knows Playwright's API verbatim and 12 in-repo specs serve as worked examples; a DSL would be new vocabulary with no upside.
4. **Two Playwright projects** (`electron` for CI via `test:e2e`, new `repro-electron` for agent-driven repros) with disjoint discovery rules (`testIgnore` on the former, `testMatch` on the latter). A single project with `testIgnore` would silently report "no tests found" when `npm run repro` passes the spec path positionally — Playwright's `testIgnore` applies even to explicit args.
5. **Path B's `app.commandLine.appendSwitch('remote-debugging-port', …)` is parked as a follow-up**, not bundled. It has no consumer in this environment; revisit if a CDP-capable MCP appears or for manual `chrome://inspect` debugging.

All five are locked from discovery + Stage 2 review with Cole. No outstanding `REQUIRES USER LOCK` decisions.

## Scope

**In scope:**

- `e2e/reproArtifacts.ts` — new shared types/helpers (`ReproSummary`, `ConsoleEntry`, `REPRO_OUTPUT_DIR_ENV`, `appendConsoleEntry`, `writeReproSummary`).
- `e2e/_repro-template.spec.ts` — new spec template the agent copies per repro. Fully wired console/screenshot/trace capture with inline gesture-example pointers to existing specs.
- `playwright.config.ts` — modified: `testIgnore: ['**/_repro-*.spec.ts']` on `electron` project + new `repro-electron` project with `testMatch: ['**/_repro-*.spec.ts']`.
- `scripts/repro-electron.mjs` — new driver that validates inputs, ensures `out/main/index.js` exists (auto-builds if not), spawns Playwright with the env-var output-dir contract, writes a top-level `summary.json`.
- `scripts/repro-electron.test.mjs` — new vitest covering argv parsing, missing-spec error path, missing-build triggers `npm run build`, env-var assembly. No real Playwright spawned.
- `package.json` — modified: add `"repro": "node scripts/repro-electron.mjs"`.
- `e2e/CLAUDE.md` — new (≤50 lines): when to use, the copy-edit-run loop, artifact contract, gesture-example pointer table.

**Out of scope:**

- Path B's `app.commandLine.appendSwitch('remote-debugging-port', …)` — separate follow-up, no consumer today.
- Dev-server-attach repro variant — built mode matches existing fixtures and avoids dev/prod divergence.
- Custom JSON/YAML scenario DSL — `.spec.ts` directly is the agent-friendlier surface.
- Wiring `claude-in-chrome` for any electron flow — extension-based, can't attach to electron's chromium.
- Repro for non-UI bugs — those have their own pipelines (vitest scoped scripts).
- Production-build behavioral changes — this is dev-time tooling only; `npm run dist` artifacts must be unaffected.

## Phases

| Phase | Topic | Implementer | Notes |
|---|---|---|---|
| 0 | Scaffolding contracts (`e2e/reproArtifacts.ts` + unit tests) | haiku-implementer | Create `e2e/reproArtifacts.ts` exporting `ReproSummary`, `ConsoleEntry`, `REPRO_OUTPUT_DIR_ENV`, `appendConsoleEntry`, `writeReproSummary`. Vitest covers append (multi-call → valid JSONL) + summary round-trip. No edits to existing files. Module must be importable from both a `.spec.ts` (Playwright runtime) and a `.mjs` (Node script consumer in Phase 2). Verify import resolution before declaring complete. |
| 1 | Playwright project + template spec | sonnet-implementer | Edit `playwright.config.ts`: add `testIgnore: ['**/_repro-*.spec.ts']` to `electron` project; add new `repro-electron` project (`testDir: './e2e'`, `testMatch: ['**/_repro-*.spec.ts']`, `use: { trace: 'on' }`, `timeout: 60_000`). Author `e2e/_repro-template.spec.ts` (~80 lines) importing from `electron.fixture` and `reproArtifacts`. Wire console/pageerror listeners eagerly via `electronApp.on('window', …)` so bootstrap logs are captured before `firstWindow()` resolves. Take a labelled screenshot, drain to `console.jsonl`, write `summary.json` in `test.afterEach`. Inline comments point at `e2e/agent-chat.spec.ts`, `e2e/basic-navigation.spec.ts`, `e2e/diff-gutter.spec.ts` for common gestures. |
| 2 | Driver script + npm entry | sonnet-implementer | Author `scripts/repro-electron.mjs` (~120 lines): argv parse → validate `e2e/_repro-<name>.spec.ts` exists → validate `out/main/index.js` exists, run `npm run build` if not (inherit stdio) → compute `artifacts/repro-<name>-<ts>/` → spawn `npx playwright test --project=repro-electron <spec>` with `PW_REPRO_OUTPUT_DIR` env set + `--output=<dir>` → on completion write top-level `summary.json` (always, even on script-level errors) → exit with Playwright's code. Add `"repro": "node scripts/repro-electron.mjs"` to `package.json`. Author `scripts/repro-electron.test.mjs` covering argv parsing / missing-spec / missing-build / env-var assembly with mocked `child_process.spawn`. Resolve the `.mjs → .ts` import question on first attempt — if cross-compilation fails, duplicate `REPRO_OUTPUT_DIR_ENV` constant locally and document the duplication risk in `e2e/CLAUDE.md`. |
| 3 | Documentation + acceptance verification | sonnet-implementer | Author `e2e/CLAUDE.md` (≤50 lines): when to reach for repro (Lane B B0), the copy-edit-run loop, the `ReproSummary` schema, gesture-example pointer table (3 specs, no more), what this is NOT. Run all discovery-doc acceptance criteria end-to-end from a clean state: `npm run repro -- template` (dirty + clean cases), `npm run test:e2e` (verify `_repro-*` not discovered), `npm run dist` (verify packaged `app.asar` does not contain `_repro-` files or `repro-electron.mjs`). Document each result in the wave's auto-brief with cited paths and exit codes. |
| 4 | Wave wrap (full lint + typecheck + scoped vitest + `/review` + push) | orchestrator | After Phase 3: `npm run lint`, `npm run typecheck`, `timeout 360 npx vitest run e2e/ scripts/` (per memory: subagents skip full `npm test`; parent runs scoped). Orchestrator diff review of every change. `/review` mechanical gap-check → PASS or address FLAGs. Manual smoke gate is exempted in this wave (see `~/.claude/rules/manual-smoke-gate.md` — applies to `src/renderer/components/Layout/**`; this wave touches only `e2e/`, `scripts/`, `playwright.config.ts`, `package.json`, no renderer code). Document the exemption rationale in the auto-brief. Then commit + push + tag v2.13.0. |

### Phase ordering

Strictly linear:

```
Phase 0 (contracts) → Phase 1 (Playwright project + template spec)
                    → Phase 2 (driver script + npm entry)
                    → Phase 3 (docs + acceptance)
                    → Phase 4 (wrap + push)
```

No parallelism. Each phase consumes the previous phase's deliverables: Phase 1 imports from Phase 0's `reproArtifacts.ts`; Phase 2 imports the same module + invokes the project Phase 1 created; Phase 3 documents the `summary.json` shape Phase 0 declared and the loop Phase 1+2 implemented; Phase 4 verifies the whole chain.

## Risks

| Risk | Mitigation |
|---|---|
| `.mjs → .ts` import incompatibility — `scripts/repro-electron.mjs` may not resolve `import { REPRO_OUTPUT_DIR_ENV } from '../e2e/reproArtifacts.ts'` because Node's ESM loader doesn't transpile TypeScript. | Phase 2 acceptance includes verifying the import works in Node ESM. If it fails, duplicate `REPRO_OUTPUT_DIR_ENV` (a single string constant) inline in `repro-electron.mjs` with a comment pointing at the canonical source in `reproArtifacts.ts`, and add a one-line `lint:repro` check (or doc note) reminding maintainers to keep the values in sync. Decision is local; doesn't expand scope. |
| Console listener timing — `page.on('console', …)` registered after `electronApp.firstWindow()` resolves misses bootstrap logs (the most diagnostic-relevant slice). | Template registers via `electronApp.on('window', win => win.on('console', …))` eagerly inside `test.beforeEach`, before any `await firstWindow()`. The pattern is documented inline in the template with a "do not move this below" comment. Phase 1 acceptance includes inspecting `console.jsonl` from a template run and confirming at least one bootstrap-era log line is present. |
| Single-instance lock collision — Cole's running IDE holds `requestSingleInstanceLock()`; spawning the test instance against the same `userData` would either fail to launch or hijack the running window. | The existing `e2e/electron.fixture.ts` already creates a fresh `--user-data-dir` per worker via `fs.mkdtempSync`. Verify on Cole's actual platform (Windows 11) that `mkdtempSync` + `--user-data-dir=` + a packaged-style launch survives the lock. If not, fall back to setting `OUROBOROS_NO_SINGLE_INSTANCE=1` in the env (would require a small main-process gate — escalates to a Tier-3 follow-up rather than expanding this wave). |
| Playwright `--output` flag colliding with `PW_REPRO_OUTPUT_DIR` env-var — Playwright's `--output` sets the project-wide output dir for traces / video / built-in artifacts, and the env-var-driven writes from inside the spec land at the same root. The two writers may clobber file names. | Phase 1 + Phase 2 acceptance include a literal `ls artifacts/repro-template-<ts>/` after a run and a check that all expected files coexist (`screenshot-01-loaded.png` from spec writer, `trace.zip` from Playwright, `console.jsonl` from spec writer, `summary.json` from script writer). If collision surfaces, namespace spec-writer files under `artifacts/repro-<name>-<ts>/spec/` and Playwright's under `…/playwright/`; update `summary.json` paths accordingly. |
| Windows path quoting in `child_process.spawn` argv — `path.resolve('artifacts', …)` produces a path with backslashes; `--output=<dir>` passed as a single argv element to `npx playwright test` may need shell-style quoting on Windows that Node's `spawn` handles inconsistently with `shell: true` vs `shell: false`. | Use `spawn(..., { shell: false })` and pass the path as a separate argv element (`'--output', dir`) rather than concatenating `--output=<dir>` into a single token. Phase 2 acceptance includes a Windows-platform run with a path containing spaces (the `C:\Web App\Agent IDE\artifacts\…` directory itself qualifies — `Web App` has a space). |
| Trace recording fails silently — Playwright's `trace.zip` only lands when the trace fixture is enabled and the test reaches teardown without a hard crash. If the renderer crashes during bootstrap (the bug we're trying to repro), the trace file may be missing or zero-byte. | `summary.json` schema declares `tracePath: string \| null`. The `writeReproSummary` helper checks `existsSync` before populating the field. Documentation in `e2e/CLAUDE.md` notes that a missing trace doesn't mean the harness failed — it may mean the bug crashed the renderer pre-teardown, which is itself diagnostic information. |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| 0 | `e2e/reproArtifacts.test.ts` — `appendConsoleEntry` (multi-call → valid JSONL parsable line-by-line), `writeReproSummary` (round-trip write/read, all `ReproSummary` fields preserved). | n/a | Pure helpers; vitest is sufficient. |
| 1 | n/a | One Playwright run of `e2e/_repro-template.spec.ts` against `out/main/index.js`. Asserts: spec exits 0; output dir contains `screenshot-01-loaded.png`, `console.jsonl`, `trace.zip`; `console.jsonl` parses as line-delimited JSON; `summary.json` matches `ReproSummary`. | The integration target is the spec itself running cleanly — there is no narrower seam to test. |
| 2 | `scripts/repro-electron.test.mjs` — argv parsing, missing-spec exits 2 with template-path message, missing-build invokes `npm run build` (mocked spawn, assert call), env-var assembly (`PW_REPRO_OUTPUT_DIR` set on spawn env). | One end-to-end `npm run repro -- template` from a clean state (delete `out/`, delete `artifacts/`). Asserts: build runs, Playwright runs, `artifacts/repro-template-<ts>/` exists with all expected files, exit code 0. | Mocked spawn for unit; real spawn for integration. Don't run real Playwright in unit tests — too slow. |
| 3 | n/a — documentation phase. | One end-to-end run of every discovery-doc acceptance criterion, transcribed into the wave's auto-brief. | Acceptance verification IS the test for Phase 3. |
| 4 | n/a | Full lint + typecheck + scoped vitest + `/review` mechanical gap-check. | Wave-wrap. |

## Acceptance criteria

- [ ] `e2e/reproArtifacts.ts` exists and exports `ReproSummary`, `ConsoleEntry`, `REPRO_OUTPUT_DIR_ENV`, `appendConsoleEntry`, `writeReproSummary` with the types declared in the spec.
- [ ] `e2e/reproArtifacts.test.ts` exists and passes under `npx vitest run e2e/reproArtifacts.test.ts`.
- [ ] `playwright.config.ts` contains a `repro-electron` project with `testMatch: ['**/_repro-*.spec.ts']` and the existing `electron` project has `testIgnore: ['**/_repro-*.spec.ts']`.
- [ ] `e2e/_repro-template.spec.ts` exists and `npx playwright test --project=repro-electron e2e/_repro-template.spec.ts` exits 0 against the current `master` build.
- [ ] After a template run, the output dir contains: at least one `screenshot-*.png`, a `console.jsonl` parsable as line-delimited JSON, a non-zero-byte `trace.zip`, and a `summary.json` matching the `ReproSummary` shape.
- [ ] `npm run test:e2e` does NOT discover any `_repro-*` test ids (verified by reporter output containing zero matches for `_repro-`).
- [ ] `scripts/repro-electron.mjs` and `package.json` `repro` script exist; `npm run repro -- template` exits 0 against the current build and produces `artifacts/repro-template-<ts>/`.
- [ ] `npm run repro -- nonexistent` exits 2 with a message naming the template path and the copy command.
- [ ] After `rm -rf out/`, `npm run repro -- template` rebuilds, runs the spec, and exits 0.
- [ ] After deliberately breaking the template (e.g., asserting against a non-existent selector), `npm run repro -- template` exits non-zero AND `summary.json` exists with `passed: false`.
- [ ] `scripts/repro-electron.test.mjs` exists and passes under `npx vitest run scripts/`.
- [ ] `e2e/CLAUDE.md` exists, ≤50 lines, passes `npm run lint:claude-md`, contains the loop instructions and `ReproSummary` schema reference.
- [ ] `npm run dist` produces a packaged build whose `app.asar` does NOT contain `_repro-` files or `repro-electron.mjs` (verified by listing the asar contents).
- [ ] Wave-final: full `npm run lint` clean, full `npm run typecheck` clean, scoped vitest (`e2e/ scripts/`) clean, `/review` mechanical gap-check returns PASS or FLAGs all addressed.
- [ ] Wave-final: ADR file `roadmap/wave-83-electron-renderer-browser-mcp-wiring/wave-83-decisions.md` records the five locked decisions from this plan.

## Verification

### Per-phase experiential observation

The data-shape probes below confirm the JSON / file-on-disk populates correctly. They do NOT confirm the user observes anything different — that's what this table is for. Each row anchors a phase to a concrete user-facing surface and the full path from change site to observation. See `~/.claude/notes/wave-process.md` "Site 2" for the rule.

| Phase | Observation point | Path to it | What "working" looks like there |
|---|---|---|---|
| 0 | Internal — no observation point | n/a | Phase 0 ships only type declarations and helper functions consumed by Phase 1 (spec) and Phase 2 (script). No user-facing surface — types are not rendered, helpers are not invoked end-to-end until later phases. Verification is unit-test-only. |
| 1 | Cole drags `artifacts/.../trace.zip` (or the Playwright project's `test-results/` `trace.zip`) into the trace viewer at https://trace.playwright.dev/ in his browser | `e2e/_repro-template.spec.ts` source → `playwright.config.ts` `repro-electron` project entry → `npx playwright test --project=repro-electron` invocation → `_electron.launch()` in `electron.fixture.ts` → spawned `out/main/index.js` Electron process → renderer Page actions captured by Playwright trace recorder → `trace.zip` written to project output dir → Cole drags into trace.playwright.dev's web viewer | Trace viewer's screenshot panel renders the actual loaded Ouroboros IDE chrome — title bar with menu strip visible, chat-only or IDE shell rendered (whichever comes up), file tree or empty-project state visible. The action timeline shows the eager-registered `console` listener firing before `firstWindow()` resolves (verifiable by scrubbing to t=0 and seeing console events in the timeline panel). It is not a blank window, not a crash dialog, not a "Failed to load" error page. |
| 2 | Cole opens the file `artifacts/repro-template-<ts>/screenshot-01-loaded.png` in his OS image viewer (Windows Photos / Preview / similar) after running `npm run repro -- template` from a fresh terminal | `npm run repro -- template` in terminal → `scripts/repro-electron.mjs` argv parse → ensure-build (rebuild if `out/main/index.js` missing) → compute `artifacts/repro-template-<ts>/` → `child_process.spawn` of `npx playwright test --project=repro-electron e2e/_repro-template.spec.ts --output=<dir>` with `PW_REPRO_OUTPUT_DIR=<dir>` env → spec reads env → spec calls `page.screenshot({ path: <dir>/screenshot-01-loaded.png })` → PNG written to disk → script writes top-level `summary.json` → Cole opens the PNG in his image viewer | Image viewer renders a real, full-color screenshot of the running Ouroboros IDE — visible title bar, visible window chrome, visible chat shell or IDE layout. The image has the actual application UI in it, not a blank canvas, not the OS desktop, not a system error dialog. Cole can identify the IDE at a glance and the file size is in the hundreds of KB to a few MB (a successful screenshot of a complex UI). |
| 3 | Cole reads `e2e/CLAUDE.md` open in his editor (Monaco artifact pane in Ouroboros itself, or his external editor) and follows the documented copy-edit-run loop end-to-end | `e2e/CLAUDE.md` opened in editor → Cole reads the "loop" section → Cole copies the documented `cp e2e/_repro-template.spec.ts e2e/_repro-myslug.spec.ts` command → Cole runs `npm run repro -- myslug` per the doc → terminal exits 0 → Cole opens the documented `artifacts/repro-myslug-<ts>/` path → finds the documented files (`screenshot-*.png`, `console.jsonl`, `trace.zip`, `summary.json`) → opens `summary.json` and the schema matches what the doc described | Cole reads the doc top-to-bottom in under 2 minutes (50-line constraint enforces brevity), follows the loop without needing to ask for clarification, and the terminal/filesystem state at the end matches the doc's "you'll see" promises exactly. The doc's gesture-example pointer table (3 specs) lists files that actually exist and contain the gestures the doc claims. There are no broken file paths, no commands the doc names that don't exist in `package.json`. |
| 4 | Internal — no observation point | n/a | Wave-wrap verification is meta — full lint, typecheck, vitest, `/review` mechanical gap-check, manual smoke exemption documented. None of these have a user-facing surface beyond green CI; the user-observable phases (1, 2, 3) carry the experiential observations. Phase 4's deliverable is the wave shipping cleanly to main. |

### Data-shape probes

Run after Phase 3, before wave-wrap, with a fresh `npm run repro -- template` invocation:

```bash
# Output dir exists with timestamped name
ls artifacts/repro-template-* | tail -1

# All expected files present
test -f "$(ls -d artifacts/repro-template-* | tail -1)/screenshot-01-loaded.png" && echo OK
test -f "$(ls -d artifacts/repro-template-* | tail -1)/console.jsonl" && echo OK
test -f "$(ls -d artifacts/repro-template-* | tail -1)/trace.zip" && echo OK
test -f "$(ls -d artifacts/repro-template-* | tail -1)/summary.json" && echo OK

# console.jsonl is line-delimited JSON
DIR=$(ls -d artifacts/repro-template-* | tail -1)
node -e "require('fs').readFileSync('$DIR/console.jsonl','utf8').trim().split('\n').forEach(l => JSON.parse(l))" && echo OK

# summary.json matches ReproSummary
node -e "const s = require('./$DIR/summary.json'); ['name','startedAt','finishedAt','durationMs','passed','screenshots','consoleTranscriptPath','tracePath','testFile'].forEach(k => { if (!(k in s)) throw new Error('missing '+k) }); console.log('OK')"
```

```bash
# CI exclusion verified
npx playwright test --project=electron --list | grep -c '_repro-' # expect 0

# Production exclusion verified
npm run dist
# inspect dist/win-unpacked/resources/app.asar contents (cross-platform: use `npx asar list`)
npx asar list dist/win-unpacked/resources/app.asar | grep -E '_repro-|repro-electron\.mjs' | wc -l # expect 0
```

## Files the next agent should read first

1. `roadmap/discovery/2026-05-05-electron-renderer-browser-mcp-wiring.md` — the design doc this plan implements; ground truth for component shapes, error-handling expectations, and out-of-scope items.
2. `roadmap/follow-ups/2026-05-05-electron-renderer-browser-mcp-wiring.md` — original follow-up; explains why Paths A and B were considered and why they're parked.
3. `roadmap/wave-83-electron-renderer-browser-mcp-wiring/wave-83-decisions.md` — ADR scaffold; Phase 0 fills it from the Locked decisions section above.
4. `playwright.config.ts` — the file Phase 1 modifies; understand the existing `electron` project shape before adding the second.
5. `e2e/electron.fixture.ts` — the fixture the template imports verbatim; do not modify, just consume.
6. `e2e/agent-chat.spec.ts` — exemplar spec for the template's gesture-pointer comments; longest realistic spec and demonstrates the patterns the agent will reach for.
7. `e2e/basic-navigation.spec.ts` and `e2e/diff-gutter.spec.ts` — two more exemplars referenced by the template's pointer table.
8. `package.json` — Phase 2 adds one script entry; understand the existing `test:*` ordering before adding `repro`.
9. `~/.claude/rules/manual-smoke-gate.md` — Phase 4 documents this wave's exemption; read the rule to write the rationale correctly.

## Note to the implementer

This wave is dev-time tooling, not a runtime feature. The product surface is the artifact folder Cole opens after a repro run, not anything the renderer renders differently. Resist the temptation to "improve" any code outside `e2e/`, `scripts/`, `playwright.config.ts`, and `package.json` — the existing electron fixture, the existing 12 specs, the existing test:e2e flow are all working and out of scope. Tier-3 scope creep here is especially tempting because dev tooling sits adjacent to lots of related code; per the development pipeline, surface any noticed-but-unrelated issue as a follow-up rather than fixing it inline.

The single most likely failure mode is shipping Phase 1 with a console-listener timing bug (`page.on('console', …)` registered after `firstWindow()` resolves, missing bootstrap logs) that goes undetected because the template smoke run doesn't fail — the harness still produces files, they're just incomplete. The acceptance criterion "at least one bootstrap-era log line is present in `console.jsonl`" exists to catch this; do not skip it. The second most likely failure mode is the `.mjs → .ts` import question landing wrong in Phase 2 — if it fails, duplicate the constant and document the duplication; do not invent a custom resolver. The third is forgetting that Cole runs Windows 11 and most Playwright/Node ergonomics docs assume POSIX paths — pass `--output` as separate argv tokens, not concatenated, and test on a path with a space (the project root has one: `C:\Web App\Agent IDE`).

Per existing repo policy (memory entries): subagents skip full `npm test` (~280s exceeds patience); the orchestrator runs `timeout 360 npx vitest run <scoped paths>` post-commit. Push policy is per-wave, not per-phase — accumulate phase commits locally, push once at Phase 4 wrap after `/review` PASS.

Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

## Orchestrator dispatch checklist

1. **Verify ADR scaffold exists.** Confirm `roadmap/wave-83-electron-renderer-browser-mcp-wiring/wave-83-decisions.md` exists with the five locked decisions transcribed from the Locked decisions section. If the scaffold is empty, populate it before dispatching Phase 0.
2. **Phase 0 dispatch (haiku-implementer).** Brief covers: file path (`e2e/reproArtifacts.ts`), exact exported names, `ReproSummary` and `ConsoleEntry` field lists, vitest spec path (`e2e/reproArtifacts.test.ts`). Acceptance gate to advance: `npx vitest run e2e/reproArtifacts.test.ts` exits 0 + a probe `node -e "import('./e2e/reproArtifacts.ts')"` (or .mjs equivalent) confirms the module loads from a Node consumer.
3. **Orchestrator diff review of Phase 0.** Verify only `e2e/reproArtifacts.ts` and `e2e/reproArtifacts.test.ts` were created; no edits to existing files. Lint + typecheck on touched files.
4. **Phase 1 dispatch (sonnet-implementer).** Brief covers: `playwright.config.ts` edit (both projects), `e2e/_repro-template.spec.ts` authoring, console-listener-timing constraint (eager `electronApp.on('window')`), the three exemplar specs to cite. Acceptance gate: `npx playwright test --project=repro-electron e2e/_repro-template.spec.ts` exits 0; output dir contains all four expected files; `console.jsonl` has at least one bootstrap-era line.
5. **Orchestrator diff review of Phase 1.** Verify `playwright.config.ts` changes are exactly the two declared (no incidental edits to existing projects). Verify `_repro-template.spec.ts` imports cleanly from both `electron.fixture` and `reproArtifacts`. Run a manual `npm run test:e2e --project=electron --list | grep _repro-` and confirm zero matches.
6. **Phase 2 dispatch (sonnet-implementer).** Brief covers: `scripts/repro-electron.mjs` shape (argv parse → validate → build-fallback → spawn → summary write → exit), `package.json` script addition, `scripts/repro-electron.test.mjs` (mocked spawn), `.mjs → .ts` import resolution risk (if it fails, duplicate the constant locally). Acceptance gate: `npm run repro -- template` exits 0 from a clean state; `npm run repro -- nonexistent` exits 2 with template-path message; `rm -rf out/ && npm run repro -- template` rebuilds and exits 0; vitest covers all four unit cases.
7. **Orchestrator diff review of Phase 2.** Verify only the two new script files and one `package.json` line. Run `npm run repro -- template` from a Windows-shaped path (the repo root has a space — `C:\Web App\Agent IDE`) to verify path quoting.
8. **Phase 3 dispatch (sonnet-implementer).** Brief covers: `e2e/CLAUDE.md` content (under 50 lines, four sections: when, loop, schema, gestures, anti-patterns), and the full discovery-doc acceptance walk-through with cited evidence. Acceptance gate: `npm run lint:claude-md` clean; every discovery-doc acceptance criterion checked off in the wave's auto-brief with paths/exit-codes; `npm run dist` packaged build verified to not contain repro files.
9. **Orchestrator diff review of Phase 3.** Verify `e2e/CLAUDE.md` is the only file added/edited. Read the doc cold (no prior context) and assess whether the loop instructions match what the harness does.
10. **Phase 4 wrap (orchestrator).** Run `npm run lint`, `npm run typecheck`, `timeout 360 npx vitest run e2e/ scripts/`, `/review` mechanical gap-check. Address any FLAGs. Document the manual-smoke-gate exemption in the wave's auto-brief (this wave touches `e2e/`, `scripts/`, `playwright.config.ts`, `package.json` — no `src/renderer/components/Layout/**`, so the rule doesn't fire). Commit Phase 4's wrap deliverables, push the accumulated wave commits, tag v2.13.0, update CHANGELOG.
