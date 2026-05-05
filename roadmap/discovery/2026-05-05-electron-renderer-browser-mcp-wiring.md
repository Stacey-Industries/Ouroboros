---
status: PLANNED
created: 2026-05-05
updated: 2026-05-05
slug: electron-renderer-browser-mcp-wiring
profile: B
stage: 1-discovery
---

# Electron renderer browser-MCP wiring — design (Stage 1)

## Goal

Unlock autonomous Lane B B0 (UI bug reproduction) for Agent IDE. A fresh Claude Code session must be able to reproduce a UI bug in the built IDE, capture artifacts (screenshot + console transcript + Playwright trace), and read those artifacts back — without user intervention.

## Why the original follow-up's Path A and Path B are dropped

The follow-up at `roadmap/follow-ups/2026-05-05-electron-renderer-browser-mcp-wiring.md` proposed two paths assuming `Claude_Preview` and `Claude_in_Chrome` MCPs both exist and the latter can attach to a remote Chrome DevTools Protocol endpoint. Investigation:

- **Path A — `claude-in-chrome` at the dev URL.** The `claude-in-chrome` MCP is a Chrome extension that operates on tabs in the user's own Chrome. Loading `http://localhost:5173` there gives no preload bridge — `window.electronAPI` is `undefined`, so the renderer either crashes during bootstrap or renders a degraded shell with no IPC-loaded data. Useless for the bugs that matter.
- **Path B — `--remote-debugging-port` on Electron's chromium.** No MCP in this environment can attach to that endpoint. `claude-in-chrome`'s `switch_browser` only switches between Chrome instances running the extension; it is not a remote-CDP client. The endpoint would be a write-only enabler with no consumer.

Both paths are dropped from this wave. Path B is parked as a follow-up if a CDP-capable MCP appears later or for manual `chrome://inspect` debugging.

## Path C — Playwright-electron repro harness

Agent IDE already has a working Playwright-electron e2e surface:

- `playwright.config.ts` defines an `electron` project.
- `e2e/electron.fixture.ts` uses `_electron.launch()` from `playwright` to spawn `out/main/index.js` with a fresh `--user-data-dir` per worker. The fixture exposes `electronApp` and `page` (the renderer's first window) with full DOM, console, network, screenshot, and click APIs — and full preload-bridge fidelity because it spawns the real built binary.
- 12 existing specs use this fixture (`agent-chat`, `app-launch`, `basic-navigation`, `theme-import`, `diff-gutter`, `agent-launch`, `conflict-banner`, `spec-scaffold`, `checkpoint-restore`, `compare-providers`, plus mobile/* which are out of scope here).

Path C formalizes a repro entrypoint on top of this surface so a session can write a one-off `.spec.ts`, run it via a single npm script, and read back artifacts.

## Components

### 1. `e2e/_repro-template.spec.ts` (new)

Minimal scaffold the agent copies into `e2e/_repro-<name>.spec.ts` and edits per bug. Contents:

- Import from `electron.fixture.ts`.
- One `test()` block that launches the app, waits for renderer ready (`domcontentloaded`), drains console messages into a transcript, takes a labelled screenshot, and exits.
- Inline comments pointing to the existing 12 specs as worked examples for common gestures (clicking a tree row, opening a settings panel, entering text in the composer, opening a chat thread).

The underscore prefix marks it as a copy-target, not a real test.

### 2. `e2e/_repro-<bug-slug>.spec.ts` (per-bug, agent-authored)

The agent authors one of these per repro. They:

- Match the underscore-prefix glob.
- Land their outputs in `artifacts/repro-<bug-slug>-<ts>/`.
- Are scoped to a dedicated `repro-electron` Playwright project (see component 4), not the `electron` project that `test:e2e` runs.
- Can be committed if useful for permanent regression coverage; usually deleted after the bug closes.

### 3. `npm run repro -- <name>` script (new)

Add to `package.json`:

```
"repro": "node scripts/repro-electron.mjs"
```

`scripts/repro-electron.mjs` responsibilities:

1. Parse `<name>` from argv.
2. Validate `e2e/_repro-<name>.spec.ts` exists. If not, print the path of the template and the copy command, exit non-zero.
3. Validate `out/main/index.js` exists. If not, run `npm run build` first; surface build failures and exit non-zero before spawning Playwright.
4. Stamp a timestamp; compute `artifacts/repro-<name>-<ts>/`. Set `PW_OUTPUT_DIR` env var the spec reads to write its console transcript and `summary.json`.
5. Spawn `npx playwright test --project=repro-electron e2e/_repro-<name>.spec.ts --reporter=list,json --output=<dir>`.
6. After completion, write a top-level `summary.json` to the artifacts folder containing: pass/fail, duration, list of screenshot paths, console transcript path, trace.zip path.
7. Exit code matches Playwright's so the agent can branch on success/failure.

### 4. `playwright.config.ts` change

Add a new `repro-electron` Playwright project that mirrors the `electron` project's setup but uses `testMatch: ['**/_repro-*.spec.ts']`. Add `testIgnore: ['**/_repro-*.spec.ts']` to the existing `electron` project so `npm run test:e2e` (which runs `--project=electron`) does not discover them, while `npm run repro` (which runs `--project=repro-electron`) does.

This avoids the gotcha where Playwright's `testIgnore` applies even to positionally-passed files: a single project with `testIgnore` would silently report "no tests found" when `npm run repro` passes the spec path explicitly. Two projects keep the discovery rules disjoint and unambiguous.

### 5. Console + screenshot capture pattern (in template)

The template wires:

- `page.on('console', msg => transcript.push({type, text, ts}))` — drains to `console.jsonl` in the output dir on test end.
- `page.on('pageerror', ...)` and `electronApp.on('close', ...)` — same drain.
- `page.screenshot({ path: 'screenshot-<step>.png', fullPage: true })` — agent calls per step.
- Playwright trace recording (`trace: 'on'` per-test override, since the global config uses `'on-first-retry'`) — produces a `trace.zip` viewable at https://trace.playwright.dev/.

All artifacts live under `artifacts/repro-<name>-<ts>/`.

### 6. `e2e/CLAUDE.md` (new)

Short doc (under 50 lines) that explains:

- When the agent should reach for `npm run repro` (Lane B B0 for UI bugs, after the user reports a UI-bearing issue).
- The copy-edit-run loop with `_repro-template.spec.ts`.
- How to read artifacts back (file paths, what `summary.json` contains).
- Pointer to existing specs as gesture examples.

## Data flow

```
agent identifies UI bug in Agent IDE
  ↓
agent reads e2e/_repro-template.spec.ts
  ↓
agent writes e2e/_repro-<slug>.spec.ts (copies template, edits selectors / steps)
  ↓
agent runs `npm run repro -- <slug>`
  ↓
script ensures build (out/main/index.js exists) → spawns playwright with electron fixture
  ↓
fixture launches out/main/index.js with fresh --user-data-dir per worker
  ↓
test executes: page.click, page.fill, page.screenshot, etc.
  ↓
artifacts/repro-<slug>-<ts>/{screenshot-*.png, console.jsonl, trace.zip, summary.json}
  ↓
agent reads summary.json + screenshots → B1 (Diagnose)
```

## Error handling

- **Build missing:** script auto-builds. If build fails, surface the build error and exit non-zero before spawning Playwright.
- **Spec missing:** clear error pointing at the template and the copy command.
- **Renderer crash on bootstrap (the bug itself crashes the app):** Playwright's `firstWindow()` rejects; the test fails, console + pageerror drain still completes for whatever fired before the crash.
- **Stuck Electron process:** Playwright's per-test timeout (30s in `playwright.config.ts`) kills it. Fresh `--user-data-dir` per run avoids state pollution from prior repros or from the user's running IDE instance.
- **Single-instance lock collision with the user's running IDE:** already handled by `electron.fixture.ts` (fresh `--user-data-dir` bypasses `requestSingleInstanceLock`).

## Testing

- **Unit:** `scripts/repro-electron.mjs` is small enough that argv parsing + path validation + build-fallback are the only logic worth a test. A vitest under `tools/` or `scripts/` covering: missing-spec error path, missing-build triggers `npm run build`, env-var assembly. Skip if it stays trivial.
- **Integration / canonical demo:** ship `e2e/_repro-template.spec.ts` itself as the smoke target. After implementation, `npm run repro -- template` should pass against the current build, and `npm run test:e2e` should NOT discover any `_repro-*` tests (the two projects' discovery rules are disjoint by design).
- **Acceptance smoke:** a fresh Claude Code session, given only `e2e/CLAUDE.md` and the template, produces a working `_repro-<slug>.spec.ts` for a known UI affordance (e.g., "wait for app to be ready and screenshot the empty state") and the artifacts folder shows the expected screenshot + console transcript.

## Out of scope

- Path B's `app.commandLine.appendSwitch('remote-debugging-port', ...)`. Parked as a follow-up.
- Dev-server-attach repro variant. Built-mode matches the existing 12 specs and avoids dev/prod divergence in repros.
- Custom JSON/YAML scenario DSL. `.spec.ts` directly is the agent-friendlier surface (training data + 12 worked examples in-repo).
- Wiring `claude-in-chrome` for any electron flow.
- Repro for non-UI bugs (those have their own pipelines: vitest for unit, the existing `test:*` scoped scripts for integration).

## Acceptance criteria

- [ ] A fresh Claude Code session can run `npm run repro -- template` against the shipped `e2e/_repro-template.spec.ts` and find artifacts in `artifacts/repro-template-<ts>/`, no user intervention.
- [ ] The artifacts folder contains: at least one PNG screenshot, a `console.jsonl` of console messages, a `trace.zip`, and `summary.json`.
- [ ] `npm run test:e2e` does NOT pick up `_repro-*.spec.ts` (verified by running `test:e2e` and confirming no `_repro-` test ids in output). The new `repro-electron` project does — `npm run repro -- template` finds and runs the template spec.
- [ ] Production builds (`npm run dist`) are unaffected — no new code in main process; this is dev-time tooling only.
- [ ] `e2e/CLAUDE.md` documents the agent loop in under 50 lines.
- [ ] `summary.json` schema is documented in `e2e/CLAUDE.md` so the agent knows what fields to read.

## Phase preview (for `/wave-plan` in Stage 3)

1. Author `e2e/_repro-template.spec.ts` (template + console/screenshot wiring) + `playwright.config.ts` change (add `repro-electron` project, add `testIgnore` to `electron` project).
2. Implement `scripts/repro-electron.mjs` + `package.json` `repro` script + `summary.json` writer.
3. Author `e2e/CLAUDE.md` (under 50 lines).
4. Verify acceptance criteria end-to-end: run `npm run repro -- template` from a clean state, inspect artifacts; run `npm run test:e2e` and confirm `_repro-*` is excluded.

Single small wave, likely 3-4 phases. ADR likely empty (no architectural choice — building on the existing Playwright-electron surface).

## References

- Original follow-up: `roadmap/follow-ups/2026-05-05-electron-renderer-browser-mcp-wiring.md`
- Existing fixture: `e2e/electron.fixture.ts`
- Existing config: `playwright.config.ts`
- Pipeline rule: `~/.claude/rules/development-pipeline.md` (Lane B B0)
- Manual smoke gate: `~/.claude/rules/manual-smoke-gate.md` (related but distinct: that's wave-end UX smoke, this is bug repro)
