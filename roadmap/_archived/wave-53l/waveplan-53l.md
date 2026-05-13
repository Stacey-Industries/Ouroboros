# Wave 53l — CodeMode as Universal MCP Multiplexer (External Access)
## Implementation Plan (DRAFT)

**Status:** DRAFT — design decisions locked below (no hybrid; CodeMode-on means CodeMode-takes-over). Phase 0 is now a verification-only pass, not an open design exploration.
**Version target:** v2.8.0 (minor — meaningful change to MCP topology; affects external sessions; user-facing config surface changes)
**Dependencies:** Wave 53k must ship first (CodeMode file targeting). 53l extends what 53k makes work.

---

## Why this wave exists

User's request post-Wave-53j: *"I want all MCPs routed through CodeMode, ouroboros was just the first. How does external ones get access to CodeMode?"*

Currently CodeMode is wired into IDE-orchestrated launches only (via `claudeCodeLaunch.ts` calling `acquireCodeModeForLaunch`). External Claude Code sessions (terminal `claude` in project dir) read `~/.claude.json mcpServers` and `.mcp.json` directly, never touching CodeMode. The user wants CodeMode to be the surface for ALL MCP traffic — both IDE-internal AND external — and the optimization (one `execute_code` tool instead of N tool schemas per server) to apply everywhere.

This wave makes `__codemode_proxy` a discoverable user-level MCP server registered in `~/.claude.json mcpServers`, with the proxy aggregating all the user's other MCP servers (sentry, github, stripe, codebase-memory-mcp, context7, ouroboros, etc.) and exposing them as `servers.<name>.*` inside `execute_code`.

**Honest scope statement.** For non-IDE-resident servers (sentry, github, stripe, context7, codebase-memory-mcp, etc.) this wave delivers universal multiplex immediately — they spawn standalone and the proxy connects to them whether the IDE is running or not. For ouroboros specifically (which runs inside the IDE process), external sessions multiplex it only when the IDE is up; when the IDE is off the proxy gracefully degrades and exposes the other servers but ouroboros tools fail. Fully-offline ouroboros multiplex is contingent on the standalone-ouroboros-MCP follow-up wave.

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
- Extend `codemodeManager` to enumerate ALL `mcpServers` entries (minus `codemode.excludeFromMultiplex`), move them to `~/.claude/codemode-managed.json`, and write `__codemode_proxy` as the sole `mcpServers` entry.
- Update `proxyServer.ts` config loading to read its upstream list from `~/.claude/codemode-managed.json` (the managed-backup file is now the source of truth for proxy upstream config).
- Update Wave 51's routing matrix (`internalMcpRoutingPolicy.ts`): when CodeMode is enabled, `route-through-codemode` is steady-state — IDE-orchestrated sessions don't need their own per-spawn temp config layer; user config already routes through it.
- Add a deterministic rollback path: Settings UI toggle (`codemode.enabled: false`) restores user's `mcpServers` from `~/.claude/codemode-managed.json` and removes `__codemode_proxy`. **This is critical** — destructive changes to user config need a one-step undo.
- Add CodeMode telemetry (per-session `execute_code` call count, `servers.<name>.*` invocation counts, proxy cold-start latency). Required for measuring multiplexer value during soak.
- Document the new behavior in `src/main/codemode/CLAUDE.md` and a top-level user doc (`docs/codemode.md`).

### Out-of-scope

- Hooks / instrumentation of CodeMode's tool-call stream (orthogonal observability).
- Streamable HTTP transport migration for ouroboros (separate future wave).
- Replacing the SDK adoption (53i) — CodeMode would still talk to ouroboros via the same SDK-backed SSE server.

---

## Locked decisions

1. **Single mode: takeover.** No hybrid, no `takeoverUserConfig` opt-in. When `codemode.enabled: true`, CodeMode takes over `~/.claude.json mcpServers` at IDE startup — user's servers move to managed backup, `__codemode_proxy` becomes the sole entry. `codemode.enabled` is the one switch.
2. **Server selection: all, with explicit opt-out.** Default is multiplex every user-registered server. `codemode.excludeFromMultiplex: string[]` lets the user remove specific servers from the proxy if one misbehaves. No opt-in list — matches user intent ("all MCPs through CodeMode").
3. **Restoration data file: sibling, not in-line key.** `~/.claude/codemode-managed.json` holds the managed-backup blob (same file as Wave 53k uses for its disable semantic — CodeMode owns this file end-to-end). Avoids fragility against Claude Code schema additions and gives us write isolation.
4. **Rollback UX:** Settings UI toggle (`codemode.enabled: false`) triggers restore-from-backup. Plus document the manual JSON edit as last-resort fallback in `docs/codemode.md`.
5. **New-server pickup: stale-until-restart.** If user runs `claude mcp add foo …` while CodeMode is active, foo doesn't appear in the multiplex until next IDE restart. A reactive watcher is filed as a follow-up.
6. **Transport stays stdio.** Wave 53j's choice holds. The proxy spawns the ouroboros stdio bridge (per 53j) — no SSE handshake needed.
7. **Ouroboros + IDE-off: graceful degradation.** Proxy exposes only reachable servers. When IDE is off, the agent sees `execute_code` work for sentry/github/etc. but `servers.ouroboros.*` calls fail with a clear error. Fully-offline ouroboros is the standalone-server follow-up.

### Phase 0 = verification only (no design pause)

Quick smokes before Phase A starts:
- Confirm Claude Code CLI tolerates `mcpServers` containing only `__codemode_proxy` (other servers absent). 30-second test: `claude mcp list` after rename, confirm proxy entry present and others absent.
- Confirm `~/.claude/codemode-managed.json` is not read by Claude Code itself (it shouldn't be — it's our private file).
- Time first-tool-use latency on an external session with the proxy multiplexing 6 upstream servers. **Target: <2s cold start.** If significantly worse, surface it before flipping defaults.

---

## Phases (sketched — not finalized)

| Phase | Goal | Subagent / responsibility |
|---|---|---|
| 0 | Verification smokes per "Phase 0 = verification only" above. ADR (`roadmap/decisions/wave-53l.md`) committed reflecting the locked decisions. **No design pause.** | Orchestrator + user. |
| A | Implement the new auto-inject path: `codemodeManager` writes `__codemode_proxy` to `~/.claude.json mcpServers` and moves user's other servers to `~/.claude/codemode-managed.json`. Gated on `codemode.enabled` (no separate takeover flag). | sonnet-implementer. |
| B | Update routing matrix in `internalMcpRoutingPolicy.ts`: route-through-codemode is steady-state when CodeMode is enabled — no per-spawn override needed. | Orchestrator. |
| C | Update `proxyServer.ts` upstream-config loading to read from `~/.claude/codemode-managed.json`. Add graceful-degradation path: unreachable upstream servers → tool calls fail with clear error, reachable servers continue working. | sonnet-implementer. |
| D1 | Backend rollback path: IPC handler that restores `~/.claude.json mcpServers` from the managed-backup file, removes `__codemode_proxy`, signals running proxy to exit. Tested independently of UI. | sonnet-implementer. |
| D2 | Settings UI surface for the `codemode.enabled` toggle + rollback affordance. Token-clean styling per `.claude/rules/renderer.md`. **Manual smoke gate required** per `~/.claude/rules/manual-smoke-gate.md`. | sonnet-implementer (renderer + IPC pairing). |
| E | Telemetry: emit per-session `execute_code` count, `servers.<name>.*` invocation counts, proxy cold-start latency to the existing telemetry sink. | sonnet-implementer. |
| F | Smoke tests: external session sees `__codemode_proxy` only; agent calls `execute_code`; rollback works; IDE-off graceful degradation; first-tool-use latency under 2s with 6 upstream servers. Signed manual smoke checklist included. | Orchestrator + user. |
| G | Wrap-up: result brief (with smoke checklist), ADR, plan flip, version bump v2.8.0 (minor — user-facing topology change, new config surface, schema-changing rollback path), push. | Orchestrator. |

**Upgrade path note.** Existing v2.7.x users with CodeMode on: behavior changes — CodeMode now manages user config. The release notes must call this out, point to the rollback toggle, and document the manual-edit fallback. Users with `codemode.enabled: false` see no change.

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

- [ ] All seven locked decisions reflected in `roadmap/decisions/wave-53l.md`.
- [ ] When `codemode.enabled: true`, IDE startup auto-injects `__codemode_proxy` to `~/.claude.json mcpServers` and moves user's other servers to `~/.claude/codemode-managed.json`.
- [ ] `codemode.excludeFromMultiplex: string[]` config option respected — excluded servers stay in `~/.claude.json mcpServers` directly.
- [ ] External `claude mcp list` shows only `__codemode_proxy` (plus any excluded servers).
- [ ] Fresh external Claude Code session: agent's tool list shows one `mcp__codemode_proxy__execute_code`; not the individual servers' tools.
- [ ] Asking the agent a graph-shaped query routes through `execute_code(servers.ouroboros.trace_call_path(...))`.
- [ ] Rollback (Settings UI toggle to `codemode.enabled: false`) restores user's `mcpServers` from `~/.claude/codemode-managed.json` and removes `__codemode_proxy`.
- [ ] When IDE is off, external session still sees `__codemode_proxy`; `servers.ouroboros.*` calls fail with a clear error; other proxied servers still work.
- [ ] First-tool-use latency on external session with 6 upstream servers measured and under 2s.
- [ ] Telemetry emits per-session `execute_code` count + per-server invocation counts + proxy cold-start latency.
- [ ] Manual smoke gate signed in result brief (renderer-touching wave per Phase D2).
- [ ] No regressions in IDE-orchestrated sessions.

---

## Out-of-wave follow-ups

- **Standalone ouroboros MCP server** — extract the codebase-memory-mcp behavior into a process independent of the IDE so external CodeMode sessions can use ouroboros tools when the IDE is off. Wave-sized; has been on the follow-up list since 53d.
- **Reactive `~/.claude.json` watcher** — pick up new MCP servers without IDE restart (decision 5 follow-up).
- **`codemode.enabled` default flip** — only after a soak period with telemetry data confirming the multiplexer's value vs the per-session subprocess-spawn cost. Phase E telemetry feeds this decision.