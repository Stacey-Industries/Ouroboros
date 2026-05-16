# Wave 51 — CodeMode ⇄ internalMcp Integration

## Implementation Plan

**Status:** ✅ COMPLETED — 2026-04-27 · Released as v2.9.0 · Result: `roadmap/auto-briefs/wave-51-result.md`
**Version target:** v2.9.0 (minor — new agent capability surface; CodeMode goes from dormant code to wired-into-launch)
**Feature flags:** new `codemode.enabled` (default `false`), new `codemode.routeInternalMcp` (default `false`; flip on after user-driven soak post-wave), new `internalMcp.transport` (`sse` | `stdio`; default depends on Phase A decision)
**Dependencies:** Wave 48 ✅ (task-gated internalMcp via `internalMcpScope.ts`), Wave 50 ✅ (graph tap fix in `hooksGraphUsageTap.ts`)
**References:**
- `src/main/codemode/codemodeManager.ts` — enable/disable flow (currently NOT invoked from launch path)
- `src/main/codemode/mcpClient.ts:107` — literally throws `'SSE transport not yet implemented'` when given a `url`
- `src/main/codemode/proxyServer.ts` — subprocess spawned by Claude Code; not imported by main process
- `src/main/codemode/executor.ts` — VM sandbox for `execute_code`
- `src/main/codemode/typeGenerator.ts` — TS namespace generator from upstream tool schemas
- `src/main/codemode/CLAUDE.md:62` — gotcha: "SSE transport not implemented — `McpServerConfig.url` is parsed but never used"
- `src/main/internalMcp/internalMcpServer.ts:217` — `startInternalMcpServer` (HTTP+SSE)
- `src/main/internalMcp/internalMcpAutoInject.ts` — writes `{mcpServers: {ouroboros: {url: ...}}}`
- `src/main/internalMcp/internalMcpScope.ts` — Wave 48 task-gating
- `src/main/orchestration/providers/claudeCodeLaunch.ts` — IDE spawn entry point (must be modified to invoke CodeMode)

---

## Overview

The IDE ships two powerful MCP mechanisms that **don't currently talk to each other**:

1. **CodeMode** (`src/main/codemode/`) — MCP proxy that replaces many tool schemas with one `execute_code` tool. Agent writes TypeScript calling `servers.foo.bar(...)`; the proxy dispatches to real MCP servers via stdio. **Known token reduction mechanism for MCP-heavy sessions.**
2. **internalMcp** (`src/main/internalMcp/`) — SSE-based MCP server exposing 10–14 graph tools. **The biggest fixed MCP cost per IDE spawn (~5–7k when task-gated injection keeps it on).**

CodeMode's `mcpClient.ts` supports only stdio transport today. `internalMcp` runs over SSE on `http://127.0.0.1:<port>/sse`. So the highest-leverage MCP source in the IDE is **structurally incompatible** with the tool the IDE built to reduce MCP cost. Every "task-gated" spawn that does pull internalMcp in pays the full schema cost with no deferral.

**Bigger picture (out of this wave's scope but informing the design).** A typical IDE spawn currently inherits 5 user-global MCP servers (`sentry`, `github`, `stripe`, `codebase-memory-mcp`, `context7`) on top of internalMcp. If each contributes 1–3k of tool schemas, CodeMode could replace 10–20k of MCP schema cost with one ~500-token `execute_code` tool — a 20–40x reduction. This wave proves the bridge with internalMcp; routing the user-global servers is a follow-up wave.

Wave 51 closes the internalMcp gap. Two possible approaches, picked in Phase A:

- **Option 1: Add SSE transport to CodeMode's `mcpClient.ts`.** Minimally invasive for internalMcp; complicates the CodeMode proxy (must handle both transports).
- **Option 2: Convert internalMcp to also speak stdio.** Spawn a small node subprocess that serves the same tool set over stdio. Keeps CodeMode simple; internal server gains a second transport.

**Why this wave was revised.** The original draft proposed real implementations of both options in throwaway worktrees with measurement. The revision uses a **paper spike** — read both files, sketch each option's diff, estimate LOC + risk, decide. Building two real implementations of MCP transport for a single decision is wasted work; the relevant signal (complexity, blast radius, test surface) is visible from a careful read. The original Phase D also baked in a literal week-long soak which can't fit in one orchestration session — revised Phase D ships the telemetry + flag and treats the actual soak/flip as a post-wave follow-up the user runs in their own time.

A separate consequence of verification: **CodeMode is currently dormant** — `codemodeManager` is not invoked from `claudeCodeLaunch.ts`. So this wave isn't only "bridge transports" — it's also "wire CodeMode into the launch path so the bridge actually runs." Phase B absorbs that work.

---

## Implementation review summary

### Confirmed state (2026-04-27)

- ✅ `codemodeManager.ts` orchestrates enable/disable via `.claude/settings.json` mutation. Injects `__codemode_proxy` entry, backs up and disables real servers.
- ✅ `proxyServer.ts` runs as a subprocess of Claude Code (NOT imported by main). Reads the proxy config, connects to upstream MCP servers via stdio, exposes `execute_code`.
- ✅ `mcpClient.ts`: minimal JSON-RPC 2.0 client, content-length framed, stdio-only. **`config.url` triggers `throw new Error('SSE transport not yet implemented')` at line 107.** Real work to add SSE.
- ✅ `internalMcpServer.ts:217 startInternalMcpServer` — HTTP server with SSE endpoints: `GET /sse`, `POST /message`, `POST /messages`. 10–14 graph tools via `getActiveTools()`.
- ✅ `internalMcpAutoInject.ts` writes `{mcpServers: {ouroboros: {url: 'http://127.0.0.1:<port>/sse'}}}`. Wave 48 made this task-gated via `internalMcpScope.ts`.
- ❌ **CodeMode is dormant** — no grep matches for `codemodeManager` / `enableCodemode` / `disableCodemode` under `src/main/orchestration/`. The manager exists; nothing calls it from a launch path. **Phase B must wire it in.**
- ❌ No `codemode.*` config keys exist. Phase B adds the namespace.
- ❌ No per-spawn MCP token-cost telemetry exists. Phase D adds it.

### Gaps this wave closes

- **CodeMode is blind to internalMcp.** Even with CodeMode enabled, internalMcp bypasses it entirely because of transport mismatch.
- **No scoping decision has been made** on whether to add SSE to CodeMode or convert internalMcp to stdio. Both are viable; they have different maintenance profiles.
- **No measurement of CodeMode's actual token savings** on a real IDE session. Pre-wave anecdotal "known to reduce MCP cost" needs ground truth.
- **Crash recovery between the two subsystems is undefined.** If CodeMode crashes mid-session after having disabled internalMcp's upstream, internalMcp is dark.

---

## Scope

### In-scope

- Phase-A spike: implement both approaches in throwaway branches, measure, pick one.
- Ship the chosen integration.
- Ensure CodeMode can route internalMcp's graph tools as `servers.ouroboros.search_graph(...)` style calls.
- Per-spawn decision: when Wave 48's `internalMcpScope === 'task-gated'` requires graph tools AND `codemode.routeInternalMcp` is on, route through CodeMode instead of direct injection.
- Telemetry comparing token cost with/without CodeMode routing.
- Crash recovery for mixed-state scenarios (CodeMode enabled, internalMcp expected but transport missing).
- Soak period with flag default off; flip on after a week of telemetry.

### Out-of-scope

- Supporting WebSocket MCP transport (CodeMode is stdio-first by design).
- Building web-mode MCP access beyond what SSE already provides.
- Exposing CodeMode to non-IDE Claude Code spawns (the CodeMode lifecycle is IDE-managed).
- Replacing internalMcp's tool set (Waves 48-50 handled trimming).

---

## Verified starting point

Reusable:

- `codemodeManager.ts` enable/disable flow.
- `mcpClient.ts` stdio client (will be extended or bypassed depending on Phase A).
- `proxyServer.ts` subprocess lifecycle.
- `executor.ts` VM sandbox.
- `typeGenerator.ts` TypeScript namespace generation from tool schemas.
- `internalMcpServer.ts` SSE server (will be kept or complemented with stdio depending on Phase A).
- Wave 48 telemetry infrastructure for before/after comparison.

Explicitly targeted:

- Phase A spike on both Option 1 and Option 2.
- Routing decision in `codemodeManager.ts` for internalMcp.
- Transport flag on `internalMcpTypes.ts`.
- Combined crash recovery for both subsystems.

---

## Architecture

### If Option 1 selected (SSE in CodeMode)

```text
proxyServer.ts
 ├─ reads proxy config
 ├─ for each upstream server:
 │    ├─ if command/args → stdio mcpClient           (today)
 │    └─ if url          → sse mcpClient             ← NEW
 ├─ dispatches execute_code calls
 └─ types from both transports merged in typeGenerator
```

### If Option 2 selected (stdio in internalMcp)

```text
internalMcpServer.ts
 ├─ stdio transport (default)                         ← NEW
 │    └─ serves same tool set over stdio JSON-RPC
 └─ sse transport                                     (kept; used by web mode)
injectIntoProjectSettings
 ├─ if transport === 'stdio' → {command, args}        ← NEW
 └─ if transport === 'sse'   → {url}                  (today)
```

**Key design calls:**

- Whichever option wins, the **user-facing API for agents is unchanged** — they call `servers.ouroboros.<tool>(...)` through CodeMode's execute_code, or invoke the tool directly when CodeMode is off.
- The routing decision must be **per-spawn**, not process-global. One spawn could use CodeMode+internalMcp; another could use direct internalMcp; another could use neither.
- Crash recovery: if CodeMode crashes and internalMcp is routed through it, the spawn must be able to fall back to direct injection OR abort cleanly. No silent tool unavailability.
- TypeScript namespace generation (`typeGenerator.ts`) must include internalMcp tools when CodeMode routing is active, so the agent's `execute_code` TypeScript has proper types.

---

## Phase A — Paper spike + decision

**Goal:** Read both files, sketch each option's diff, estimate LOC + risk, decide. **No code written this phase.**

### New files

| File | ~Lines | Description |
|---|---|---|
| `roadmap/wave-51-decision.md` | ~200 | Side-by-side comparison: each option's required changes, LOC estimate, test surface, risk to existing stdio path / existing SSE path, web-mode usage notes. Final pick with rationale. |

### Subagent briefing

- **Read in full:** `src/main/codemode/mcpClient.ts`, `src/main/codemode/proxyServer.ts`, `src/main/internalMcp/internalMcpServer.ts`, `src/main/internalMcp/internalMcpAutoInject.ts`, `src/main/internalMcp/internalMcpTools*.ts`, both subsystem `CLAUDE.md` files. Optionally consult `mcp-spec` notes via context7 if anything in the protocol is unclear.
- For Option 1 (SSE in `mcpClient.ts`): sketch the diff. What functions need to change? How does session-id pairing work between `GET /sse` and `POST /message`? Does it need reconnection logic? Does it touch `proxyServer.ts`? Estimate LOC for impl + tests.
- For Option 2 (stdio in `internalMcp`): sketch a new `internalMcpStdioTransport.ts` that wraps `getActiveTools()` and serves stdio JSON-RPC. Where does it spawn from? Lifecycle? Does `internalMcpAutoInject.ts` need branching to write `{command, args}` instead of `{url}`? Estimate LOC for impl + tests.
- **Recommendation criteria** (in order of weight):
  1. LOC + maintenance burden
  2. Blast radius on the existing transport (stdio for CodeMode, SSE for internalMcp/web-mode)
  3. Test surface
  4. Crash recovery clarity
  5. Future use cases (if SSE has a real future for non-internalMcp servers, keep it; if not, prefer stdio everywhere)
- Pick one with evidence. If genuinely tied, default to **Option 2** (stdio in internalMcp) — keeps CodeMode simple and matches the MCP ecosystem's stdio-first norm.

### Acceptance

- [ ] Decision doc covers both options with concrete sketches.
- [ ] LOC estimates for impl + tests for each.
- [ ] Final pick declared with rationale.
- [ ] Commit: `docs(wave-51): Phase A — paper spike and decision`

### Anti-patterns

- Do NOT actually implement either option. Phase B does that.
- Do NOT commit "spike" code that gets reverted. The decision doc is the deliverable.

---

## Phase B — Implement chosen option + wire CodeMode into launch path

**Goal:** Ship the selected transport integration AND make CodeMode actually run for IDE spawns. CodeMode is currently dormant code — Phase B is when it goes live.

### New / modified files (shape depends on Phase A pick)

If Option 1 (SSE in CodeMode):

| File | ~Lines | Change |
|---|---|---|
| `src/main/codemode/mcpClient.ts` | +~200 | Add SSE code path. Detect `url` field → use SSE, else stdio. |
| `src/main/codemode/mcpClient.test.ts` | ~180 | SSE test suite: event parsing, POST/GET pairing, reconnection. |
| `src/main/codemode/proxyServer.ts` | ~+40 | Pass-through: SSE config entries work the same as stdio entries. |

If Option 2 (stdio in internalMcp):

| File | ~Lines | Change |
|---|---|---|
| `src/main/internalMcp/internalMcpStdioTransport.ts` | ~260 | New file: stdio JSON-RPC loop serving `getActiveTools()`. |
| `src/main/internalMcp/internalMcpStdioTransport.test.ts` | ~200 | Full stdio protocol test suite. |
| `src/main/internalMcp/internalMcpAutoInject.ts` | ~+60 | Write `{command, args}` entry when transport is stdio. |
| `src/main/internalMcp/internalMcpTypes.ts` | ~+20 | Add `transport: 'sse' \| 'stdio'` to options. |
| `src/main/main.ts:95-113` | ~+20 | Respect `internalMcp.transport` config. |

### Additional Phase B work — wire CodeMode into launch

Independent of the option pick:

| File | Change |
|---|---|
| `src/main/configSchemaTail.ts` (or `configSchemaTailExt.ts` if cap) | Add `codemode` namespace: `{ enabled: boolean default false, routeInternalMcp: boolean default false }`. |
| `src/main/configAppTypes.ts` | Add the matching interface fields. |
| `src/main/orchestration/providers/claudeCodeLaunch.ts` | Read `codemode.enabled`. If true, invoke `codemodeManager` enable for the spawn's working dir before launching. On exit / failure path, ensure disable runs. |

### Subagent briefing

- **Read first:** Phase A decision doc, `claudeCodeLaunch.ts` (full file), `codemodeManager.ts` (full file). Also `internalMcpAutoInject.ts` for understanding the settings-file mutation contract.
- **Single phase, two scopes:** transport implementation + launch wiring. Commit them together.
- Do NOT carry over spike-style scratch code — Phase A is read-only, no spike code exists. Build clean with full test coverage.
- Respect Wave 48's task-gating — the integration must honor `internalMcpScope` decisions.
- The chosen transport becomes the default for internalMcp; the other transport stays supported (opt-in via `internalMcp.transport` config).
- If Option 2 wins, ensure the stdio subprocess has a clean exit path on main-process shutdown.
- Launch wiring is idempotent — re-enabling CodeMode for a spawn that already has the proxy entry must be a no-op.

### Acceptance

- [ ] Chosen transport integration works end-to-end: agent can call `search_graph` etc.
- [ ] Test suite covers handshake, tool list, tool call, error propagation.
- [ ] Previous transport still works when config selects it.
- [ ] Task-gating from Wave 48 interacts correctly.
- [ ] `codemode.enabled` config exists; default `false`.
- [ ] `claudeCodeLaunch.ts` invokes `codemodeManager` enable when flag is on.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-51): Phase B — <option> integration + CodeMode launch wiring`

---

## Phase C — CodeMode routing for internalMcp

**Goal:** When CodeMode is enabled AND the spawn needs graph tools, route internalMcp through CodeMode instead of direct schema injection.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/codemode/internalMcpRoutingPolicy.ts` | ~180 | Decides per-spawn: direct-inject internalMcp, or route through CodeMode, or neither. Honors `codemode.routeInternalMcp` flag + Wave 48's `internalMcpScope`. |
| `src/main/codemode/internalMcpRoutingPolicy.test.ts` | ~180 | Matrix: CodeMode on/off × task-gating × route flag. |

### Modified files

| File | Change |
|---|---|
| `src/main/codemode/codemodeManager.ts` | On enable, include internalMcp's entry in the proxy config. On disable, clean up. |
| `src/main/internalMcp/internalMcpAutoInject.ts` | When routing policy says "through CodeMode", skip direct injection — the proxy already exposes the tools. |
| `src/main/orchestration/providers/claudeCodeLaunch.ts` | Consult the routing policy before preparing settings files. |
| `src/main/codemode/typeGenerator.ts` | Include internalMcp tools in generated TypeScript namespace. |
| `src/main/configSchemaTail.ts` | Add `codemode.routeInternalMcp: boolean` — default `false`. |

### Subagent briefing

- **Read first:** `codemodeManager.ts` enable/disable flow, Wave 48's `internalMcpScope.ts`, Phase B implementation.
- Routing decision is idempotent against settings file. Read → compare → write only on delta.
- Crash recovery: if CodeMode fails to connect to internalMcp, policy should downgrade gracefully — direct-inject and continue, rather than leave the spawn without graph tools.
- `typeGenerator.ts` produces the `declare namespace servers` block Monaco uses for `execute_code` autocomplete — it MUST include `servers.ouroboros.*` types when routing is active.

### Acceptance

- [ ] CodeMode-on + task-gated + route flag on → `execute_code` routes internalMcp calls.
- [ ] CodeMode-off + task-gated → direct injection (Wave 48 behavior preserved).
- [ ] Crash simulation: CodeMode unhealthy → policy downgrades to direct inject.
- [ ] TypeScript types include `servers.ouroboros.*`.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-51): Phase C — CodeMode routing for internalMcp`

---

## Phase D — MCP token cost telemetry + flag

**Goal:** Ship the telemetry and the rollup script so a future soak can produce real before/after numbers. **No in-session soak.** The actual flag flip is a post-wave follow-up the user runs against live data.

### New files

| File | ~Lines | Description |
|---|---|---|
| `scripts/measure-mcp-token-cost.ts` | ~220 | Reads spawn telemetry, compares CodeMode-routed vs direct-inject MCP cost. Reports rollups. Runnable any time post-wave to drive the flip decision. |

### Modified files

| File | Change |
|---|---|
| `src/main/orchestration/providers/claudeCodeLaunch.ts` | Emit per-spawn telemetry including MCP config bytes, routing decision (CodeMode-on/CodeMode-off, internalMcp scope, transport), and a token-estimate field. |
| `docs/token-budget.md` (if exists; otherwise create a small section in `docs/architecture.md`) | Add CodeMode routing description with how to read the rollup. |
| `roadmap/session-handoff.md` | Capture flip criteria and the post-wave soak protocol. |

### Subagent briefing

- The telemetry sink is whatever Wave 48 established. If Wave 48 wrote to `~/.ouroboros/telemetry/*.jsonl`, reuse that location with a new file (e.g., `mcp-spawn-cost.jsonl`).
- Token estimate is `bytes / 4` is fine — don't import a real tokenizer for this. Document the approximation.
- Rollup script is tsx-runnable, reads the JSONL stream, computes per-day median token estimate split by routing decision. Outputs a table.
- **No soak this wave.** Document the post-wave protocol in `session-handoff.md`: "run for one week with flag off, one week with flag on, run rollup, decide."

### Acceptance

- [ ] Telemetry emits routing decision + cost estimate per spawn.
- [ ] Rollup script runs against synthetic and real data.
- [ ] `session-handoff.md` documents the post-wave flip protocol.
- [ ] Scoped tests for the telemetry emitter.
- [ ] Commit: `feat(wave-51): Phase D — MCP cost telemetry + rollup script`

---

## Phase E — Crash recovery, integration, docs

**Goal:** Prove the two subsystems coexist cleanly under failure, wrap the wave.

### New files

| File | ~Lines | Description |
|---|---|---|
| `src/main/codemode/codemode.internalMcp.integration.test.ts` | ~280 | End-to-end: CodeMode enable → internalMcp routed → tool call roundtrip → CodeMode disable → clean state. |
| `src/main/codemode/crashRecovery.test.ts` | ~220 | Simulates mid-session crashes, verifies downgrade to direct-inject and settings file cleanup. |

### Modified files

| File | Change |
|---|---|
| `src/main/codemode/CLAUDE.md:62` | Remove or update the "SSE transport not implemented" gotcha based on which option shipped. |
| `src/main/internalMcp/CLAUDE.md` | Document the transport flag and default; note the routing-through-CodeMode path. |
| `docs/architecture.md` | Reflect unified MCP optimization path. Add a one-paragraph "MCP transport and CodeMode routing" section. |
| `CLAUDE.md` (project root) | Add `docs/token-budget.md` (or wherever Phase D landed the cost write-up) to "Further Reading". |

### Acceptance

- [ ] Integration test green on both routing paths.
- [ ] Crash recovery test passes: CodeMode failure → graceful downgrade.
- [ ] CLAUDE.mds updated.
- [ ] Full suite: `npx vitest run`, `npx tsc --noEmit`, `npm run lint` — all clean.
- [ ] Commit: `docs(wave-51): Phase E — integration, crash recovery, docs`

---

## Subagent execution model

- **Model:** `sonnet`; built-ins (`general-purpose`) preferred for cross-cutting work since catalog agents have been unreliable mid-tool-loop. Tight single-module phases can use `sonnet-implementer`.
- **Isolation:** sequential on `master`. No worktrees this wave (Phase A is read-only paper work; subsequent phases write code in disjoint directories).
- **Test policy:** scoped vitest per phase; orchestrator runs full suite at wave close.
- **Lint policy:** no relaxations. Standard project rules.
- **Commit policy:** one per phase. Phase A has one commit (the decision doc).
- **Scope discipline:** do NOT extend CodeMode to non-IDE spawns or third-party MCP servers (follow-up wave). Do NOT change internalMcp's tool set (Waves 48–50 handled trimming).

### Phase dispatch order

1. **Phase A** — paper spike, decision doc
2. **Phase B** — chosen option implementation + CodeMode launch wiring
3. **Phase C** — per-spawn routing policy
4. **Phase D** — MCP cost telemetry + rollup script (no in-session soak)
5. **Phase E** — integration test + crash recovery + docs

---

## Risks

| Risk | Mitigation |
|---|---|
| Neither option is clearly better. | Phase A decision doc must pick one with evidence. If the spike shows genuine parity, default to Option 2 (stdio in internalMcp) as simpler from CodeMode's perspective. |
| SSE in CodeMode breaks stdio in subtle ways. | If Option 1 wins, full regression suite on existing stdio servers. |
| internalMcp stdio subprocess leaks on shutdown. | Explicit lifecycle: spawn on first request, kill on main-process quit + a 5s idle timeout. |
| CodeMode routing makes tool calls slower than direct injection. | Latency telemetry per-call. If CodeMode adds >100ms per tool call, surface in rollup so users can opt out. |
| Deferred MCP in `-p` mode is an Anthropic CLI feature that arrives mid-wave and moots the work. | Fine — the wave still clarifies CodeMode's scope and closes the transport mismatch. Sunk cost is small. |
| Crash in CodeMode leaves settings file with `__codemode_proxy` and `ouroboros` both present. | Phase E crash recovery test covers this. Startup reconciliation fixes mixed state. |

---

## Acceptance criteria (wave-level)

- [ ] Five phase commits on `master` (one per phase).
- [ ] `npx vitest run` (timeout 800) — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors (pre-existing FileViewer warnings excepted).
- [ ] `npm run lint:claude-md` — 0 errors.
- [ ] Manual smoke (orchestrator runs):
  - [ ] CodeMode enable with `routeInternalMcp=true` → agent's `execute_code` can call `servers.ouroboros.search_graph`.
  - [ ] CodeMode disable → internalMcp reverts to direct injection behavior.
  - [ ] Crash CodeMode mid-session → next spawn falls back to direct inject cleanly (covered by `crashRecovery.test.ts`).
  - [ ] Telemetry rollup runs and produces a sensible table.
- [ ] Result brief at `roadmap/auto-briefs/wave-51-result.md`.
- [ ] Status flipped to ✅ COMPLETED.
- [ ] Single push at wave close.

---

## Out-of-wave follow-ups

- **Soak + flag flip.** Run with `codemode.enabled=true, codemode.routeInternalMcp=false` for one week, then `routeInternalMcp=true` for one week. Run `npx tsx scripts/measure-mcp-token-cost.ts` and compare. Flip defaults if savings are real and no regressions.
- **CodeMode for user-global MCP servers.** Today's IDE sessions inherit `sentry`, `github`, `stripe`, `codebase-memory-mcp`, `context7` from `~/.claude.json`. Routing those through CodeMode could replace 10–20k of MCP schema cost with one ~500-token `execute_code`. Big win, separate wave because it touches user-global config.
- **User-facing enable/disable UI** for CodeMode (config-only today).
- **WebSocket transport** for CodeMode if web-mode IDE grows.
- **Dynamic tool unloading.** If CodeMode is active and the session hasn't invoked graph tools in N turns, drop the types from the namespace block to free tokens.
