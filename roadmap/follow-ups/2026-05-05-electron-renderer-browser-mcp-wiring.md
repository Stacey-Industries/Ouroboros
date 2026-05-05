---
status: OPEN
created: 2026-05-05
updated: 2026-05-05
severity: medium
---

# Electron renderer → browser MCP wiring (for autonomous UI bug reproduction)

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
