# Wave 51 — CodeMode ⇄ internalMcp Integration
## Implementation Plan (DRAFT)

**Version target:** v2.8.0 (minor — unifies IDE's MCP optimization layer with IDE's graph tool server)
**Feature flags:** new `codemode.routeInternalMcp` (default `false`, flip on after soak), new `internalMcp.transport` (`sse` | `stdio`, default `stdio` after this wave)
**Dependencies:** Wave 48 shipped (task-gated internalMcp), Wave 50 shipped (enforcement decided)
**References:**
- `src/main/codemode/codemodeManager.ts`
- `src/main/codemode/mcpClient.ts`
- `src/main/codemode/proxyServer.ts`
- `src/main/codemode/executor.ts`
- `src/main/codemode/typeGenerator.ts`
- `src/main/internalMcp/internalMcpServer.ts`
- `src/main/internalMcp/internalMcpAutoInject.ts`
- `src/main/internalMcp/CLAUDE.md` — confirms CodeMode compatibility gap: "SSE transport not implemented — `McpServerConfig.url` is parsed but never used; only `command`/`args` stdio transports actually connect."

---

## Overview

The IDE ships two powerful MCP mechanisms that **don't currently talk to each other**:

1. **CodeMode** (`src/main/codemode/`) — MCP proxy that replaces many tool schemas with one `execute_code` tool. Agent writes TypeScript calling `servers.foo.bar(...)`; the proxy dispatches to real MCP servers via stdio. **Known token reduction mechanism for MCP-heavy sessions.**
2. **internalMcp** (`src/main/internalMcp/`) — SSE-based MCP server exposing 10–14 graph tools. **The biggest fixed MCP cost per IDE spawn (~5–7k when task-gated injection keeps it on).**

CodeMode's `mcpClient.ts` supports only stdio transport today. `internalMcp` runs over SSE on `http://127.0.0.1:<port>/sse`. So the highest-leverage MCP source in the IDE is **structurally incompatible** with the tool the IDE built to reduce MCP cost. Every "task-gated" spawn that does pull internalMcp in pays the full schema cost with no deferral.

Wave 51 closes that gap. Two possible approaches, and this wave picks one based on a scoping spike in Phase A:

- **Option 1: Add SSE transport to CodeMode's `mcpClient.ts`.** Minimally invasive for internalMcp, but complicates the CodeMode proxy (must handle both transports).
- **Option 2: Convert internalMcp from SSE to stdio.** Spawn a small node subprocess that serves the same tool set over stdio. Keeps CodeMode simple; the internal server gains a second transport.

The right choice probably depends on whether SSE remains useful elsewhere (web-based IDE mode?) and how much the CodeMode proxy changes. Phase A picks.

This wave is also where **Tier 6 #12 (deferred MCP in `-p` mode)** gets validated — if CodeMode routes internalMcp successfully, the agent pays ~500 tokens for `execute_code` instead of ~5–7k for the full schema set, and the deferred-loading question becomes moot.

---

## Implementation review summary

### Confirmed state

- `codemodeManager.ts` orchestrates enable/disable via `.claude/settings.json` mutation. Injects `__codemode_proxy` entry, backs up and disables real servers.
- `proxyServer.ts` runs as a subprocess of Claude Code. Reads the proxy config, connects to upstream MCP servers via stdio, exposes `execute_code` as a single tool.
- `mcpClient.ts`: minimal JSON-RPC 2.0 client, content-length framed, stdio-only. The `McpServerConfig.url` field is present in type defs but unused — code path for SSE does not exist.
- `internalMcpServer.ts` is an HTTP server implementing SSE: `GET /sse` event stream, `POST /message` JSON-RPC, `POST /messages` batch. 14 graph tools via `getActiveTools()`.
- `internalMcpAutoInject.ts` writes `{mcpServers: {ouroboros: {url: 'http://127.0.0.1:<port>/sse'}}}` as the settings entry. Wave 48 made this task-gated.
- CodeMode and internalMcp are both singletons at startup. Nothing orchestrates their lifecycle relative to each other.

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

## Phase A — Scoping spike: pick Option 1 or Option 2

**Goal:** Implement both in throwaway branches, measure, decide.

### New files (spike artifacts, may be discarded)

| File | ~Lines | Description |
|---|---|---|
| `roadmap/wave-51-spike-option-1-sse.md` | ~160 | Brief after implementing SSE in CodeMode: complexity, test coverage, risk. |
| `roadmap/wave-51-spike-option-2-stdio.md` | ~160 | Brief after implementing stdio in internalMcp: complexity, test coverage, risk. |
| `roadmap/wave-51-decision.md` | ~140 | Comparison, recommendation, rationale for the final pick. |

### Modified files (spike, reverted after decision)

Spike implementation touches either `codemode/mcpClient.ts` (Option 1) or `internalMcp/internalMcpServer.ts` + new `internalMcpStdioTransport.ts` (Option 2). Spike branches land in `spike/wave-51-option-1` and `spike/wave-51-option-2`, do not merge.

### Subagent briefing

- **Read first:** `codemode/mcpClient.ts`, `internalMcp/internalMcpServer.ts`, MCP spec on stdio vs HTTP-with-SSE transports.
- Implement Option 1: add SSE support to `mcpClient.ts` — need HTTP GET for `/sse` with event-stream parsing, POST to `/message` for JSON-RPC, pair them by session-id. Estimate LOC.
- Implement Option 2: add stdio transport to `internalMcpServer.ts` — likely easiest by spawning a second process that wraps `getActiveTools()` and serves over stdin/stdout. Estimate LOC.
- For each: measure time-to-first-tool-call, correctness on `search_graph` roundtrip, failure modes.
- **Recommendation criteria:**
  - LOC cost (maintenance burden)
  - Whether SSE has a legitimate use case beyond internalMcp (if not, Option 2 is cleaner)
  - Test coverage difficulty
  - Crash recovery clarity
- Write the decision doc with evidence, not preference.

### Acceptance

- [ ] Both spike branches pass a smoke roundtrip: agent calls `servers.ouroboros.search_graph("foo")` and receives results.
- [ ] Both briefs include LOC, test effort, risk.
- [ ] Decision doc explicitly picks one with evidence.
- [ ] Commit: `docs(wave-51): Phase A — scoping decision`

---

## Phase B — Implement chosen option

**Goal:** Ship the selected transport integration.

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

### Subagent briefing

- **Read first:** Phase A decision doc + the chosen option's spike branch.
- Do NOT carry over spike code verbatim — rewrite cleanly with full test coverage.
- Respect Wave 48's task-gating — the integration must honor `internalMcpScope` decisions.
- The chosen transport becomes default; the other transport stays supported (opt-in via config).
- If Option 2 wins, ensure the stdio subprocess has a clean exit path when the main process shuts down.

### Acceptance

- [ ] Chosen transport integration works end-to-end: agent can call `search_graph` etc.
- [ ] Test suite covers handshake, tool list, tool call, error propagation.
- [ ] Previous transport still works when config selects it.
- [ ] Task-gating from Wave 48 interacts correctly.
- [ ] Scoped tests pass.
- [ ] Commit: `feat(wave-51): Phase B — <option> integration`

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

## Phase D — Telemetry and soak

**Goal:** Measure before/after token cost per spawn, soak the flag, make the flip decision.

### New files

| File | ~Lines | Description |
|---|---|---|
| `scripts/measure-mcp-token-cost.ts` | ~220 | Reads spawn telemetry (extended in this wave to include MCP schema byte counts), compares CodeMode-routed vs direct-inject. Reports daily rollups. |

### Modified files

| File | Change |
|---|---|
| `src/main/orchestration/providers/claudeCodeLaunch.ts` | Emit per-spawn telemetry including MCP config bytes, routing decision, token estimate. |
| `docs/token-budget.md` (from Wave 48) | Add CodeMode routing section with measured impact. |
| `roadmap/session-handoff.md` | Capture soak observations, flip-flag criteria. |

### Acceptance

- [ ] Telemetry distinguishes routed vs direct-inject spawns.
- [ ] Rollup script produces measurable before/after.
- [ ] Soak period logged — at least 1 week with flag off, 1 week with flag on for a subset of spawns.
- [ ] Documentation reflects measured savings.
- [ ] Commit: `feat(wave-51): Phase D — telemetry and soak`

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
| `src/main/codemode/CLAUDE.md` | Remove the "SSE transport not implemented" gotcha (if Option 1 shipped) or update "stdio + SSE dual transport" note (if Option 2). |
| `src/main/internalMcp/CLAUDE.md` | Document the transport flag and default. |
| `docs/architecture.md` | Reflect unified MCP optimization path. |

### Acceptance

- [ ] Integration test green on both routing paths.
- [ ] Crash recovery test passes: CodeMode failure → graceful downgrade.
- [ ] CLAUDE.mds updated.
- [ ] Full suite: `npx vitest run`, `npx tsc --noEmit`, `npm run lint` — all clean.
- [ ] Commit: `docs(wave-51): Phase E — integration, crash recovery, docs`

---

## Subagent execution model

- **Model:** `sonnet`; Phase A spikes can run in parallel
- **Isolation:** Phase A uses isolated worktrees for the two spikes; subsequent phases sequential on `master`
- **Test policy:** scoped vitest per phase; parent runs full suite at wave close
- **Lint policy:** no relaxations
- **Commit policy:** one per phase; Phase A has 3 commits (two spike briefs + decision)
- **Scope discipline:** do NOT extend CodeMode to non-IDE spawns. Do NOT change internalMcp's tool set (Wave 48-50 handled trimming).

### Phase dispatch order

1. **Phase A** — scoping spike (parallel worktrees for Options 1 and 2)
2. **Phase B** — chosen option implementation
3. **Phase C** — CodeMode routing for internalMcp
4. **Phase D** — telemetry and soak (includes real-time flag flip window)
5. **Phase E** — crash recovery and docs

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

- [ ] Five phase commits on `master` (Phase A contributes 3 commits for spikes + decision).
- [ ] `npx vitest run` — 0 failures.
- [ ] `npx tsc --noEmit` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] Manual smoke:
  - [ ] CodeMode enable with `routeInternalMcp=true` → agent's `execute_code` can call `servers.ouroboros.search_graph`.
  - [ ] CodeMode disable → internalMcp reverts to direct injection behavior.
  - [ ] Crash CodeMode mid-session → next spawn falls back cleanly.
  - [ ] Token measurement shows `execute_code`-routed spawns have smaller MCP footprint than direct-inject.

---

## Out-of-wave follow-ups

- **Flag flip**: `codemode.routeInternalMcp` flips to default `true` after 2 weeks of clean soak.
- **User-facing enable/disable UI** for CodeMode (currently config-only for IDE spawns).
- **CodeMode for third-party MCP servers** (github, sentry, etc.) on a user-selectable subset.
- **WebSocket transport** for CodeMode if web-mode IDE grows beyond local-only use.
- **Dynamic tool unloading**: if CodeMode is active and the session hasn't invoked graph tools in N turns, drop the types from the namespace block to free tokens.
