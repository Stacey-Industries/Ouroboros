# Wave 83 — Architecture Decisions

Five decisions are locked from discovery + Stage 2 review. All use the abbreviated `Context / Pick / Rationale` form because the spectrum framing was applied during discovery (`roadmap/discovery/2026-05-05-electron-renderer-browser-mcp-wiring.md`) — the picks landed there; this file is the durable record.

## Decision 1: Path C (Playwright-electron repro harness) over Path A or Path B

**Context:** The follow-up at `roadmap/follow-ups/2026-05-05-electron-renderer-browser-mcp-wiring.md` proposed two paths for autonomous Lane B B0 (UI bug reproduction) on Agent IDE: Path A (`Claude_Preview` MCP at the renderer's dev URL) and Path B (Electron's `--remote-debugging-port` + `Claude_in_Chrome` CDP attach). Discovery investigation found Path A loses the preload bridge — the renderer either crashes during bootstrap or renders a degraded shell with no IPC-loaded data — and Path B has no MCP consumer in this environment because `claude-in-chrome` is a Chrome extension that only operates on the user's own Chrome (its `switch_browser` is not a remote-CDP client). Discovery also surfaced that Agent IDE already has a working Playwright-electron e2e surface (`playwright.config.ts`, `e2e/electron.fixture.ts`, 12 existing specs).

**Pick:** Path C — formalize the existing Playwright-electron surface as an agent-friendly bug-repro harness.

**Rationale:** Full preload-bridge fidelity (spawns the real built binary). Zero new MCP infrastructure. The agent already knows Playwright API verbatim (training data + 12 in-repo worked examples). Eliminates Path A's bootstrap problem and Path B's missing-consumer problem in a single move.

## Decision 2: Repro target is the built artifact (`out/main/index.js`), not the dev server

**Context:** The harness must launch Agent IDE before exercising it. Two options: build mode (run `npm run build` first, launch `out/main/index.js`) or dev mode (run `electron-vite dev`, attach to the running renderer). Build mode adds ~30-60s per fix cycle; dev mode adds HMR but requires a different fixture pattern.

**Pick:** Build mode.

**Rationale:** Matches the existing `e2e/electron.fixture.ts` shape and all 12 existing specs — the agent has working examples to mimic, no fixture-divergence to maintain. Avoids dev/prod divergence (HMR can mask or shift bugs; the bug we ship is the built one). The build cost is paid once per implementation cycle, tolerable.

## Decision 3: Repro specs are authored as `.spec.ts` files directly, not via a custom JSON/YAML scenario DSL

**Context:** The agent needs to express bug-reproduction steps somewhere. Options: a JSON/YAML scenario format the harness interprets, or `.spec.ts` files using Playwright's API directly.

**Pick:** `.spec.ts` directly, with a copy-target template at `e2e/_repro-template.spec.ts`.

**Rationale:** Playwright API is in the agent's training data; a custom DSL is new vocabulary the agent must learn from a single README. Twelve in-repo specs serve as worked examples for any gesture (clicking, filling, multi-window, network interception, viewport sizing). A DSL is limited by what the harness explicitly supports — every new gesture becomes a harness extension. `.spec.ts` is full power day one.

## Decision 4: Two Playwright projects (`electron` for CI, `repro-electron` for repros) with disjoint discovery rules

**Context:** Repro specs must NOT run in `npm run test:e2e` (CI) but MUST run when the agent invokes `npm run repro`. Two implementations: (a) a single `electron` project with `testIgnore: ['**/_repro-*.spec.ts']` and have `npm run repro` somehow override the ignore, or (b) two projects — `electron` ignores the repro glob, `repro-electron` matches it.

**Pick:** Two projects.

**Rationale:** Playwright's `testIgnore` filter applies even to positionally-passed file arguments. A single project with `testIgnore` would silently report "no tests found" when `npm run repro` passes the spec path explicitly, and there's no clean override flag. Two projects keep the discovery rules disjoint and unambiguous: `--project=electron` for CI, `--project=repro-electron` for repros.

## Decision 5: Path B (`app.commandLine.appendSwitch('remote-debugging-port', …)`) is parked as a separate follow-up, not bundled

**Context:** Adding `app.commandLine.appendSwitch('remote-debugging-port', port)` gated by `!app.isPackaged` to `bootstrapApp()` in `src/main/mainStartupHelpers.ts` is a small (3-5 line) change. It exposes a CDP endpoint that a future CDP-capable MCP could consume, and enables manual `chrome://inspect` debugging today. The change has no consumer in this wave.

**Pick:** Park in a follow-up file at `roadmap/follow-ups/`. Do not bundle into wave 83.

**Rationale:** No consumer means the change is a write-only enabler. Bundling adds scope to a wave whose acceptance criteria don't depend on it, against the pipeline rule "Don't add features beyond what the task requires." Re-open if a CDP-capable MCP appears or if `chrome://inspect` workflows become a recurring need — both are fine triggers.
