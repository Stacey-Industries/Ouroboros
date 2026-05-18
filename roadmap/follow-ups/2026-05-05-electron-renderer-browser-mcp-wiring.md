---
status: OPEN
created: 2026-05-05
updated: 2026-05-16
severity: medium
---

# Electron renderer → interactive MCP wiring (for autonomous UI smoke + bug reproduction)

> **2026-05-16 update — cross-project audit + new research paths.** Original 2026-05-05 framing (browser-MCP for B0 bug repro) is still valid; new context below extends it. See **"## Update 2026-05-16"** at the bottom of this file for the new candidate paths (`electron-mcp-server`, `circuit-mcp`, Anthropic Computer Use) and the three-layer framing that re-prioritizes this work.

## Why this exists

The development-pipeline rule (`~/.claude/rules/development-pipeline.md`) defines Lane B B0 (bug reproduction) as a **mandatory gate** before diagnosing any bug. For UI bugs, B0 means starting a dev server and opening a browser MCP (`Claude_Preview` or `Claude_in_Chrome`) to reproduce the bug visually.

In Contractor App (web SPA), this works out of the box — `npm run dev` starts Vite at a localhost URL and the browser MCP can reach it.

In Agent IDE (electron desktop app), it does NOT work today. The renderer is a Chromium instance owned by the electron main process, and neither browser MCP knows how to attach to it. Without this wiring, every UI bug in Agent IDE requires the user (Cole) to manually reproduce, screenshot, and paste console/network logs — the agent can't do B0 autonomously.

## Goal

Make Agent IDE's renderer reachable from a `Claude_Preview` or `Claude_in_Chrome` MCP so a fresh Claude Code session can:

1. Start Agent IDE in dev mode
2. Open the renderer in the browser MCP
3. Navigate, inspect DOM, read console, capture screenshots — autonomously, without user intervention

This unlocks the full Lane B B0 workflow for Agent IDE UI bugs.

## Two candidate paths (research + pick one)

### Path A — Claude_Preview MCP pointing at the dev server URL

The electron-vite renderer dev server exposes `http://localhost:<port>` for HMR. Vite runs that anyway. If the URL is reachable from outside the electron process, `Claude_Preview` can point at it.

**Pros:** No electron-side changes, just configure the MCP.
**Cons:** Loads the renderer in a regular Chrome (not electron's chromium), so APIs that depend on electron context (`window.electronAPI`, the preload bridge) WILL NOT WORK in the preview. Pure renderer UI / styling / layout bugs would still reproduce; bugs that depend on IPC won't.

### Path B — Claude_in_Chrome MCP attaching to electron's chromium via remote debugging

Pass `--remote-debugging-port=<port>` when launching electron in dev mode. The chromium instance exposes a CDP (Chrome DevTools Protocol) endpoint. `Claude_in_Chrome` attaches to it the same way it attaches to a regular Chrome.

**Pros:** Real electron context — preload bridge works, IPC events fire, full fidelity to production renderer.
**Cons:** Requires electron-side config change. `--remote-debugging-port` exposes a CDP socket that should NOT be enabled in production builds (security concern). Need a dev-only flag.

### Recommendation seed

Path B is more correct (full-fidelity reproduction) but requires more setup. Path A is quicker but won't catch IPC-dependent bugs.

A potential third path: **both**. Path A for fast iteration on pure-renderer UI/layout bugs; Path B for IPC-touching bugs. Decide based on which set of bugs the user hits more often in practice.

## Files to investigate first

- `electron.vite.config.ts` (root) — renderer dev server configuration; look for the port + host settings
- `src/main/index.ts` (or equivalent) — electron `BrowserWindow` creation; this is where `--remote-debugging-port` arg would be threaded if going Path B
- `package.json` `scripts.dev` — how dev is launched; may need to add a flag
- `src/preload/index.ts` — for understanding what APIs Path A would lose access to

## Acceptance criteria

- [ ] A fresh Claude Code session in `C:\Web App\Agent IDE\` can run `npm run dev` (or whatever the chosen path requires)
- [ ] The session can open the running renderer in a browser MCP (Preview or in-Chrome)
- [ ] The session can take a screenshot of the renderer's current state
- [ ] The session can read DOM elements / inspect / capture console output
- [ ] The session can perform at least one click interaction and observe the result
- [ ] If Path B chosen: production builds do NOT expose the remote debugging port (verify with `npm run dist` artifact inspection)

## Pipeline classification

Lane A, Profile B (in-project feature, lighter discovery). Likely a single small wave (~1-3 phases):
- Phase 1: research current electron-vite renderer dev URL availability + decide path
- Phase 2: implement config change (Path A: MCP setup only; Path B: launch flag + dev/prod gating)
- Phase 3: smoke test from a fresh Claude session — reproduce a known UI element/state via the MCP

If both paths land, that's 4-5 phases.

## Research expectations (Stage 1+2 research gate)

- **Context7:** check current electron + electron-vite docs for `--remote-debugging-port` recommended pattern, and any existing `electron-vite` example projects that wire CDP
- **WebSearch:** Claude in Chrome / Claude Preview MCP wiring for electron — there may be community examples
- **Codebase graph:** trace `BrowserWindow` instantiation in Agent IDE main process to find the right injection point

## Why this is a follow-up, not a wave (yet)

The pipeline rollout (2026-05-05) named this as a setup task that unlocks Lane B B0 for Agent IDE. It's small enough to scope as a Profile B feature but specific enough that the next session shouldn't re-derive the goal. When you're ready, a new session reads this file + the pipeline rule, runs Stage 1 (lighter discovery), then `/wave-plan` for the implementation.

## How to start the next session

In a fresh Claude Code session in `C:\Web App\Agent IDE\`, give this prompt:

> Read `roadmap/follow-ups/2026-05-05-electron-renderer-browser-mcp-wiring.md` and `~/.claude/rules/development-pipeline.md`. We're starting the electron renderer browser-MCP wiring as a Profile B feature. Begin Stage 1 (Discovery) — pick Path A vs Path B vs both, with research from Context7 + the codebase graph. Surface the recommendation before moving to Stage 2.

That's enough. The agent will run the pipeline from there.

---

## Update 2026-05-16 — Three-layer framing + new candidate paths from cross-project audit

The 2026-05-05 framing was correct but narrow (Lane B B0 bug reproduction). A cross-project audit (2026-05-16) of UI-validation infrastructure surfaced the broader context — this work is part of a **three-layer parity goal** across Gamify / Contractor App / Agent IDE:

| Layer | What it does | Agent IDE status |
|---|---|---|
| Scripted E2E | Pre-written user flows, pass/fail | ✅ 16 Playwright specs + xvfb CI (Pipeline Hardening M-4) |
| Visual regression | Pixel diff against baseline | ❌ Not wired |
| **Interactive agent drive** | **Agent live-controls running app via MCP** | ❌ **Not wired (this follow-up)** |

For Cole's stated goal of agents handling smoke tests with minimal oversight, the interactive-drive layer is the highest-leverage missing piece. It enables:

- Post-wave smoke walks (agent navigates the affected surfaces, captures screenshots, judges visually)
- Lane B B0 bug reproduction (the original framing)
- Wave-end manual-smoke-gate automation (currently Cole eyeballs; agent could pre-walk + report findings)

### Cross-project parity

- **Gamify** — DONE. Maestro MCP wired via `.mcp.json` (M-2 followup wave 2).
- **Contractor App** — `Contractor App/roadmap/follow-ups/2026-05-16-playwright-mcp-wire.md` (Microsoft Playwright MCP, turnkey ~half day).
- **Agent IDE** — this follow-up (harder; Electron tooling is less mature).

### New candidate paths (in addition to original Path A / Path B above)

#### Path C — `electron-mcp-server` (community, CDP-based)

[`electron-mcp-server`](https://github.com/amafjarkasi/computer-use-electron-mcp-server) (verify URL via web search before commit) exposes Electron's renderer (Chromium via CDP) AND main-process APIs through an MCP. Similar in spirit to Microsoft Playwright MCP but Electron-aware.

**Pros:** Built for Electron specifically; covers both renderer and main process; DOM-aware (not pixel-based).
**Cons:** Community-maintained (not Electron-core official); maturity tier EMERGING per research; Electron version fragmentation risk (IPC API changed in v30+ — confirm Agent IDE's Electron version compatibility before committing).

#### Path D — `circuit-mcp` (unified web + Electron)

[`circuit-mcp`](https://github.com/icefort-ai/circuit-mcp) (verify) — single MCP that handles both web browsers and Electron windows. Same operational model as Playwright MCP but extended to desktop.

**Pros:** One MCP across Contractor App + Agent IDE; potentially reduces config sprawl.
**Cons:** Younger than `electron-mcp-server`; same community-maintained caveat; less battle-tested.

#### Path E — Anthropic Computer Use via desktop MCP wrapper

Anthropic's [Computer Use API](https://platform.claude.com/docs/en/docs/build-with-claude/computer-use) (beta header `computer-use-2025-11-24` for Opus 4.7 / Sonnet 4.6) — screenshot loop with pixel-coordinate actions. Reference deployment is Docker + VNC; can also run direct against Windows desktop via a desktop-MCP wrapper (nut.js / robotjs / AutoHotkey-bridge).

**Pros:** Anthropic-maintained, won't go stale; model-agnostic to UI framework (works against Electron, native apps, anything); future-proof.
**Cons:** Pixel-coordinate-based (less reliable than DOM-aware); higher latency; coordinate scaling needed for non-Opus-4.7 models; vision can mis-grade complex layouts; prompt-injection risk on rendered web content; setup complexity (Docker+VNC or desktop-MCP wrapper).

### Recommended decision path (2026-05-16)

Half-day spike before committing — too many unknowns to decide blind:

1. **Verify each MCP's current state via `ctx7` + WebSearch + the linked repos.** Maturity scores from the 2026-05-16 research (EMERGING for Paths C/D, PRODUCTION-beta for Path E) are point-in-time and need re-verification.
2. **Smoke-test the most promising candidate against Agent IDE's actual renderer** in a throwaway session. Can the agent navigate the chat surface? Read the file tree? Trigger an action?
3. **Decide** based on: (a) successful smoke test, (b) maintenance posture (Anthropic > Microsoft > community), (c) fit for Agent IDE's Electron version and architecture.

### Updated acceptance criteria (additive)

Original criteria still apply. Add:

- [ ] `/smoke agent-ide` slash command exists and produces a structured markdown report
- [ ] Decision documented in `roadmap/decisions/` (which path was picked + why)
- [ ] Maturity posture documented: this is EMERGING tier as of 2026, not PRODUCTION; spot-check screenshots remain Cole's responsibility for now

### Cross-references

- Audit findings: discussed in chat 2026-05-16; not yet logged to a wave brief
- Cross-project follow-up: `Contractor App/roadmap/follow-ups/2026-05-16-playwright-mcp-wire.md`
- Gamify counterpart (done): `Gamify/.mcp.json` (Maestro MCP)
- Adjacent: visual-regression gap for Agent IDE (not yet filed; deferred per chat — revisit Q3 2026)

