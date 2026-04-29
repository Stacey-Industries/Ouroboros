# Wave 53l — CodeMode as Universal MCP Multiplexer (External Access)
## Implementation Plan (DRAFT)

**Status:** DRAFT — major design questions unresolved. Do NOT start before working through the design section below.
**Version target:** v2.8.0 (minor — meaningful change to MCP topology; affects external sessions; user-facing config surface changes)
**Dependencies:** Wave 53k must ship first (CodeMode file targeting). 53l extends what 53k makes work.

---

## Why this wave exists

User's request post-Wave-53j: *"I want all MCPs routed through CodeMode, ouroboros was just the first. How does external ones get access to CodeMode?"*

Currently CodeMode is wired into IDE-orchestrated launches only (via `claudeCodeLaunch.ts` calling `acquireCodeModeForLaunch`). External Claude Code sessions (terminal `claude` in project dir) read `~/.claude.json mcpServers` and `.mcp.json` directly, never touching CodeMode. The user wants CodeMode to be the surface for ALL MCP traffic — both IDE-internal AND external — and the optimization (one `execute_code` tool instead of N tool schemas per server) to apply everywhere.

This wave makes `__codemode_proxy` a discoverable user-level MCP server registered in `~/.claude.json mcpServers`, with the proxy aggregating all the user's other MCP servers (sentry, github, stripe, codebase-memory-mcp, context7, ouroboros, etc.) and exposing them as `servers.<name>.*` inside `execute_code`.

---

## Goal

After this wave, the user's `~/.claude.json mcpServers` looks like this:

```json
{
  "mcpServers": {
    "__codemode_proxy": {
      "type": "stdio",
      "command": "node",
      "args": ["<path to proxyServer.js>", "<path to proxy-config.json>"]
    }
  },
  "_codemodeManagedServers": {
    "sentry": { ...original config },
    "github": { ...original config },
    "stripe": { ...original config },
    "codebase-memory-mcp": { ...original config },
    "context7": { ...original config },
    "ouroboros": { ...original config }
  }
}
```

Every Claude Code session (IDE-internal or external) sees one tool: `__codemode_proxy.execute_code`. Inside it, the agent writes JS calling `servers.<name>.<tool>(...)` to access any of the proxied servers' tools. Context savings scale with the number of servers + tools.

---

## Scope

### In-scope (large)

- Move CodeMode auto-inject from per-spawn (current `scopedMcpConfig` model) to user-level (in `~/.claude.json` directly, written once at IDE startup).
- Extend `codemodeManager` to enumerate ALL `mcpServers` entries (not just an explicit list passed by the IDE), move them to a managed-backup namespace (`_codemodeManagedServers` or similar), and write `__codemode_proxy` as the sole `mcpServers` entry.
- Update `proxyServer.ts` config loading to read the managed-backup namespace as its upstream list (currently it's given an explicit config from `codemodeManager`; that contract stays, but the source of truth shifts to user config).
- Update Wave 51's routing matrix (`internalMcpRoutingPolicy.ts`): when CodeMode is enabled at user level, `route-through-codemode` becomes the steady-state — IDE-orchestrated sessions don't need their own per-spawn temp config layer to engage CodeMode; the user config already routes through it.
- Add a deterministic rollback path: a single command (CLI subcommand or settings UI button) that restores the user's `mcpServers` from `_codemodeManagedServers` and removes `__codemode_proxy`. **This is critical** — destructive changes to user config need a one-step undo.
- Document the new behavior in `src/main/codemode/CLAUDE.md` and a top-level user doc (`docs/codemode.md` or similar).

### Out-of-scope

- Hooks / instrumentation of CodeMode's tool-call stream (orthogonal observability).
- Streamable HTTP transport migration for ouroboros (separate future wave).
- Replacing the SDK adoption (53i) — CodeMode would still talk to ouroboros via the same SDK-backed SSE server.

---

## Open design questions — must resolve before Phase A

### Q1. Opt-in semantics

Two models:

- **Global takeover.** When `codemode.enabled: true`, CodeMode replaces the user's `mcpServers` block at IDE startup. User loses direct access to individual servers in non-CodeMode contexts (Anthropic Desktop, etc.). Maximum context savings; biggest behavior change.
- **Coexist by default.** `__codemode_proxy` added alongside the existing servers. User has both surfaces. No context savings (worse than current state — agent has 1 + N tool schemas instead of N), but zero destructive change.
- **Hybrid (preferred):** Coexist by default; a separate flag (`codemode.takeoverUserConfig: true`) opts into the takeover model.

Recommendation: Hybrid. `codemode.enabled` controls IDE-orchestration routing (Wave 53j semantics). `codemode.takeoverUserConfig` controls the user-level multiplex (this wave's contribution). Both default false. User opts in to as much as they want.

### Q2. Server selection

Does CodeMode multiplex ALL user-registered MCP servers, or a curated list?

- **All:** Simplest; matches "user wants CodeMode for everything." Risks: if a server has auth flows or odd lifecycles, it might break under proxy. Each server's behavior under CodeMode needs verification.
- **Curated list:** User specifies which servers to multiplex via config (`codemode.multiplexedServers: ["ouroboros", "github"]`). Safer; explicit opt-in per server.

Recommendation: Default to all when `takeoverUserConfig: true`, with an opt-out list (`codemode.excludeFromMultiplex: ["sentry"]`) for servers known to misbehave. Avoid an opt-in list unless we hit specific problems — defaulting to "all" matches the user's intent.

### Q3. Rollback UX

Destructive changes to `~/.claude.json` need a clear undo:

- A CLI subcommand (`ouroboros codemode disable` — but we don't have an Ouroboros CLI; not applicable).
- A Settings UI button in the IDE (likely the right surface).
- A documented manual edit (last-resort fallback).

Recommendation: Settings UI toggle that flips `codemode.takeoverUserConfig: true → false` and triggers a restore-from-backup pass. Plus document the manual JSON edit in case the IDE is unreachable.

### Q4. Cross-IDE-restart consistency

If the user adds a new MCP server while CodeMode is active (e.g., `claude mcp add foo …`), how does CodeMode see it?

- **Reactive:** the IDE watches `~/.claude.json` for changes; on detected new server, moves it to managed backup + updates proxy config + restarts proxy.
- **Stale-until-restart:** the user must restart the IDE (or run `codemode reload`) for new servers to be picked up.

Recommendation: Stale-until-restart for v1. Reactive watching has its own complexity and isn't worth it until the v1 model is proven.

### Q5. Config schema impact

`~/.claude.json` is Claude Code CLI's primary config. Adding `_codemodeManagedServers` as a sibling to `mcpServers` is presumably tolerated (Claude Code is liberal about unknown top-level keys), but should be verified. Worst case, use a different file entirely (e.g., `~/.claude/codemode-managed.json`) to avoid touching Claude Code's own state.

### Q6. The `transport: "stdio"` question

Wave 53j flipped `internalMcp.transport: "stdio"`. With Wave 53l's user-level multiplex, ouroboros is no longer a directly-registered server (it's behind the proxy). Does `internalMcp.transport` even matter post-53l?

- The IDE still needs to expose ouroboros somewhere for the proxy to connect to. If transport=sse, the proxy connects via HTTP+SSE. If transport=stdio, the proxy spawns the ouroboros stdio bridge (Wave 53j's work).
- Recommendation: Stay with `transport: "stdio"` (Wave 53j's choice). Or revisit if the proxy benefits from direct SSE.

### Q7. External session discovery

For external sessions to actually use the user-level `__codemode_proxy`, Claude Code CLI has to:
- Read `~/.claude.json mcpServers` and find `__codemode_proxy` ✓ (we're already targeting the right file post-53k)
- Spawn the proxy via `command: "node", args: [proxyServerPath, proxyConfigPath]`
- The proxy must be able to find the IDE's running ouroboros server (the `<port>` is dynamic).

This is the fragility point. Currently `proxyServer.ts` reads its config from a JSON file the IDE writes. The config has the upstream server connection info INCLUDING ouroboros's current port. **If the user starts an external session while the IDE is OFF, the proxy launches but ouroboros isn't running — proxy fails, agent loses graph tools.**

Resolution options:
- (a) The proxy gracefully degrades — exposes only the servers that ARE reachable. User loses ouroboros tools when IDE is off, but other servers (sentry/github/etc.) still work.
- (b) Block the wave on first standalone-MCP-server work for ouroboros (Wave 53m or similar). External sessions via CodeMode become contingent on the IDE being up; standalone ouroboros would unblock fully-offline use.

Recommendation: (a) — graceful degradation. Standalone ouroboros is its own wave; this wave doesn't depend on it.

---

## Phases (sketched — not finalized)

| Phase | Goal | Subagent / responsibility |
|---|---|---|
| 0 | Resolve Q1–Q7 design questions in this doc + in `roadmap/decisions/wave-53l.md`. **No code.** | Orchestrator + user. |
| A | Implement the new auto-inject path: `codemodeManager` writes `__codemode_proxy` + `_codemodeManagedServers` to `~/.claude.json`. Behind `codemode.takeoverUserConfig` flag. | sonnet-implementer. |
| B | Update routing matrix in `internalMcpRoutingPolicy.ts`: when takeover is on, route-through-codemode is steady-state (no per-spawn override needed). | Orchestrator. |
| C | Update `proxyServer.ts` upstream-config loading to handle the new managed-backup format. | sonnet-implementer. |
| D | Add Settings UI surface for the takeover toggle + rollback. | sonnet-implementer (renderer side; pairs with main-process IPC). |
| E | Smoke tests: external session sees `__codemode_proxy` only; agent calls `execute_code`; rollback works; one-server-down graceful degradation. | Orchestrator + user. |
| F | Wrap-up: result brief, ADR, plan flip, version bump (likely v2.8.0 — minor), push. | Orchestrator. |

---

## Risks

| Risk | Mitigation |
|---|---|
| User's existing MCP workflow breaks (servers disappear from `claude mcp list`) | Hybrid opt-in (Q1 default coexist). Clear docs. Settings UI rollback. |
| `_codemodeManagedServers` (or whatever key) gets stripped by Claude Code or another tool | Verify in Phase 0. Worst case use a sibling file (Q5). |
| Proxy's upstream connection to ouroboros breaks when IDE is off | Graceful degradation per Q7. Document that external CodeMode → ouroboros requires IDE running. |
| `~/.claude.json` write contention with concurrent Claude Code usage | Atomic write throughout (`.tmp` + rename — same pattern as 53g/53j). Worst case, the IDE serializes its writes via a per-file mutex. |
| User edits `~/.claude.json` manually while CodeMode is active | Stale-until-restart (Q4). Document. |
| Each Claude Code session spawns a new proxy subprocess | Yes — that's the cost. CodeMode pays one proxy spawn per session for one tool registered (vs the current N MCP servers visible). For a user with 5+ MCP servers, the trade-off is favorable. |
| Cloudflare's CodeMode has its own evolution; our fork might drift | Pin behavior in tests; ratchet on changes. |

---

## Acceptance criteria (wave-level)

- [ ] Q1–Q7 design questions resolved in ADR.
- [ ] `codemode.takeoverUserConfig` flag added + default false.
- [ ] When flag is on, IDE startup auto-injects `__codemode_proxy` to `~/.claude.json mcpServers`, moves user's other servers to `_codemodeManagedServers`.
- [ ] External `claude mcp list` shows only `__codemode_proxy`.
- [ ] Fresh external Claude Code session: agent's tool list shows one `mcp__codemode_proxy__execute_code` (or however CodeMode exposes the tool); not the individual servers' tools.
- [ ] Asking the agent a graph-shaped query routes through `execute_code(servers.ouroboros.trace_call_path(...))`.
- [ ] Rollback (settings toggle) restores user's `mcpServers` from `_codemodeManagedServers` and removes `__codemode_proxy`.
- [ ] When IDE is off, external session still sees `__codemode_proxy` but ouroboros tools fail gracefully (other proxied servers still work).
- [ ] No regressions in IDE-orchestrated sessions.

---

## Out-of-wave follow-ups

- **Standalone ouroboros MCP server** — extract the codebase-memory-mcp behavior into a process independent of the IDE so external CodeMode sessions can use ouroboros tools when the IDE is off. Wave-sized; has been on the follow-up list since 53d.
- **Reactive `~/.claude.json` watcher** — pick up new MCP servers without IDE restart (Q4 follow-up).
- **CodeMode-specific telemetry** — track which `servers.<name>.*` calls the agent actually makes, so we can measure the multiplexer's value (vs the cost of one extra subprocess hop). Not blocking; informs whether we flip schema defaults globally.
- **Schema default flip** for `codemode.takeoverUserConfig` — only after a long soak period and clear data on the trade-off.