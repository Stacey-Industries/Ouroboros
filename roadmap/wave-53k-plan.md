# Wave 53k — Fix CodeMode File Targeting (mirror of Wave 53g)
## Implementation Plan (DRAFT)

**Status:** DRAFT — queued for execution tonight. Decisions locked below; no Phase 0 design pause needed.
**Version target:** v2.7.12 (patch — bug fix; mirror of 53g's file-targeting fix applied to CodeMode)
**Dependencies:** Waves 53g (`.mcp.json` discovery), 53i (SDK adoption), 53j (stdio bridge SDK rewrite + CodeMode opt-in for IDE-orchestrated sessions). All shipped.

---

## Why this wave exists

Wave 53j flipped CodeMode on for IDE-internal sessions. User smoke-tested and reported the agent still calls `ouroboros` directly, not `__codemode_proxy`. Investigation found this in the IDE log:

```
[codemode] enable failed; falling back to direct inject:
   None of the requested MCP servers were found in settings.
```

`codemodeManager` reads from `.claude/settings.json mcpServers` for both global (`~/.claude/settings.json`) and project (`<projectRoot>/.claude/settings.json`) scope. Wave 53g moved `ouroboros` out of that file (Claude Code CLI doesn't read `.claude/settings.json` for MCP discovery — it reads `~/.claude.json mcpServers` and `.mcp.json`). So when CodeMode looks for ouroboros to add to its proxy list, it finds nothing, returns `success: false`, the routing matrix downgrades to `direct-inject`, and the agent gets ouroboros via the fallback.

**Net:** CodeMode hasn't actually worked since Wave 53g. It's been silently downgrading on every IDE-orchestrated session.

This wave applies Wave 53g's file-targeting fix to `codemodeManager`. Bounded scope, established pattern.

---

## Goal

Make `codemodeManager.enableCodeMode()` succeed when called with `['ouroboros']` (the current routing-matrix call site). After this wave, IDE-orchestrated sessions actually route through `__codemode_proxy.execute_code` instead of falling back to direct-inject.

External sessions (terminal `claude`) still bypass CodeMode entirely — that's Wave 53l's job.

---

## Scope

### In-scope (Phase A)

- `src/main/codemode/codemodeManager.ts`:
  - Replace `getGlobalSettingsPath()` and `getProjectSettingsPath()` with helpers that return the files Claude Code CLI actually reads:
    - **Global:** `~/.claude.json` (read/write `mcpServers` block at top level — same pattern as Wave 53g's auto-inject editing of `~/.claude.json`).
    - **Project:** `<projectRoot>/.mcp.json` (read/write `mcpServers` block — same pattern as Wave 53g's `.mcp.json` writing).
  - The "disable original servers" logic currently moves servers from `mcpServers` → `disabledMcpServers`. Translate that pattern:
    - **Global (in `~/.claude.json`):** keep using a `disabledMcpServers` key at top level. (Verify Claude Code CLI tolerates this — if it strips unknown keys, use a private namespace like `_codemodeManagedServers` instead.)
    - **Project (in `.mcp.json`):** if Claude Code's `enabledMcpjsonServers` / `disabledMcpjsonServers` keys are the right surface, use them. Otherwise, lean on direct removal from `.mcp.json` and rely on the user's `~/.claude.json` for restoration data (still TBD — open question below).
  - Atomic write throughout (`.tmp` + rename), tolerant of missing/invalid JSON — copy the patterns from `internalMcpAutoInject.ts` post-Wave-53g.
  - Preserve the existing `enableCodeMode([serverNames])` / `disableCodeMode()` API surface — only the underlying file targets change.

### In-scope (Phase B — smoke)

- After IDE restart, IDE-orchestrated session smoke:
  - IDE log shows `[codemode] enable succeeded` (or absence of the `enable failed; falling back` warning).
  - User's `~/.claude.json` shows `mcpServers.__codemode_proxy` registered, `mcpServers.ouroboros` moved to `disabledMcpServers` (or whichever key we settle on).
  - Fresh chat-panel session: agent's tool-use line says **`Called __codemode_proxy`** (with `execute_code` underneath), NOT `Called ouroboros`.
  - The graph query (`Use trace_call_path …`) still works end-to-end.

### Out-of-scope

- External sessions accessing CodeMode (Wave 53l).
- Multiplexing servers other than ouroboros (CodeMode currently scopes to the explicit `serverNames` list passed by the routing matrix; this wave doesn't change that).
- Any change to `proxyServer.ts` or `mcpClient.ts` — they're consumers of the config the manager writes; they should work unchanged once the file-target fix lands.

---

## Locked decisions (no Phase 0 — start at Phase A)

1. **Disable semantic.** Restoration data lives in a sibling file `~/.claude/codemode-managed.json` (NOT a private key in `~/.claude.json`). Rationale: opaque sibling file gives us write isolation from Claude Code's own schema and avoids fragility against future top-level key collisions. The proxied server's entry is removed from `~/.claude.json mcpServers` entirely while CodeMode is active; the sibling file holds the original config blob keyed by server name for restoration.
2. **Project scope.** `.mcp.json` keeps the canonical entry untouched. To "disable" the original at project scope, toggle `~/.claude.json projects.<root>.disabledMcpjsonServers` to include the server name. `__codemode_proxy` is added at user scope (`~/.claude.json mcpServers`), so it's reachable from any project.
3. **Migration of stale `.claude/settings.json mcpServers` entries.** Phase A clears any entries the manager itself wrote previously (detect by name match against `_codemodeManagedServers` if it existed, or by the `__codemode_proxy` marker). Other entries are left alone — Claude Code CLI ignores that file. Document in ADR.
4. **Idempotency policy.** `enableCodeMode` only manages servers it owns (tracked in the sibling file). User-added entries to `~/.claude.json mcpServers` while CodeMode is active are left in place; on next IDE startup, they're picked up and moved to managed-backup. User edits to the sibling file directly are not supported (it's machine-managed state).
5. **Atomic write.** `.tmp` + rename throughout, mirroring the patterns established in `internalMcpAutoInject.ts` post-Wave-53g. Last-write-wins on contention with concurrent `claude mcp` commands; serialization is out of scope for v1.

### Quick verification before Phase A starts

- Confirm Claude Code CLI tolerates the absence of a server in `mcpServers` when a sibling restoration file exists alongside (it should — there's no documented dependency). Single 30-second smoke: rename a server out of `mcpServers`, run `claude mcp list`, confirm it just doesn't appear.

---

## Phases

| Phase | Goal | Subagent | Acceptance |
|---|---|---|---|
| A | Fix file-target in `codemodeManager` per locked decisions above. **Rewrite** `codemode/` test fixtures (mocks currently target `.claude/settings.json` paths and JSON shapes — this is a fixture rewrite, not an assertion-path tweak). Add sibling-file (`~/.claude/codemode-managed.json`) read/write helpers with atomic-write + missing/invalid JSON tolerance. | `sonnet-implementer` (cross-file: codemodeManager.ts + tests + sibling-file helpers + any consumer that reads CodeMode state). | All `codemode/` tests pass. Lint + typecheck clean. Smoke verifies the `enable failed; falling back` warning is gone. |
| B | Post-restart smoke. | Orchestrator + user. | IDE log shows successful enable. `~/.claude.json` shows expected state. Fresh chat-panel session shows `Called __codemode_proxy`, not `Called ouroboros`. |
| **B′** | **(Discovered during Phase B smoke.)** `scopedMcpConfig.readGlobalMcpServers` was reading `~/.claude/settings.json` — the same pre-53g wrong file. Under `--strict-mcp-config` (always on for our spawns), the temp config is the sole MCP source; with the wrong-file read, `userServers` was always `{}` and `__codemode_proxy` never made it into the temp config. Fix: read `~/.claude.json mcpServers` instead. With CodeMode enabled, `__codemode_proxy` is naturally there (Decision 1) and passes through. See ADR Decision 6. | Orchestrator. | scopedMcpConfig + codemode tests pass (79 total). New regression test pins `__codemode_proxy` passthrough under route-through-codemode. Re-smoke: temp config logged as `servers: ['__codemode_proxy']` (was `[]`). |
| **B″** | **(Re-smoke against v2.1.122 after B′ landed proved the contract still leaked.)** Claude Code v2.1.122 ignores `--strict-mcp-config` for `.mcp.json` discovery — agent successfully called `mcp__ouroboros__trace_call_path`, `mcp__ouroboros__query_graph`, etc. despite the temp config containing only `__codemode_proxy`. The Decision-2 toggle (`disabledMcpjsonServers` flip) was also non-functional on Windows. **Pivoted Decision 2 → Decision 8: destructive write to `.mcp.json`.** CodeMode now removes proxied entries from `<root>/.mcp.json` during enable and restores them verbatim on disable. Restoration file schema bumped to v2 to carry full configs. Self-healing crash recovery added: `enableCodeMode` checks for stale restoration file at start and applies it before proceeding. See ADR Decision 8. | Orchestrator. | scopedMcpConfig + codemode tests pass (99 total). Restoration-file schema is v2. Re-smoke: agent's tool calls show `mcp__codemode_proxy__execute_code` only — no ouroboros direct calls reachable. `.mcp.json` mid-session has no `ouroboros` entry; post-disable verbatim restore. |
| **B‴** | **(Re-smoke after B″ confirmed Claude Code spawned the proxy, but it never surfaced tools.)** Two latent bugs the leak had been masking: (a) `proxyServer.js` was registered with `path.join(__dirname, 'proxyServer.js')` but `__dirname` resolved to `out/main/chunks/` (where the calling code is bundled) while the file is at `out/main/proxyServer.js` — fixed with sibling-then-parent `existsSync` resolver. (b) HTTP-only upstreams (sentry, context7) hung the stdio-only mcpClient for 30s each — fixed by filtering `isStdioCapable()` at `claudeCodeMode.resolveProxiedServerNames`. HTTP servers stay directly registered. | Orchestrator. | 100 tests passing. Re-smoke: proxy spawned, but agent still saw no tools — exposed the next bug. |
| **B⁗** | **(Diagnostic log + re-smoke caught it.)** `mcpClient.ts` and `proxyServer.ts` used LSP-style Content-Length framing on the wire, but MCP stdio transport is NDJSON. Every real MCP server's response was being silently dropped, leading to 30s `initialize` timeouts on all 4 upstreams. Fixed: `encodeMessage` writes `JSON.stringify(msg) + '\n'`, `parseMessages` splits on `\n` with CRLF tolerance and partial-tail buffering. Added 9 regression tests for NDJSON parser. Re-smoke: 3 of 4 upstreams connected (github, stripe, ouroboros); codebase-memory-mcp.exe stalled on tools/list. | Orchestrator. | 82 tests. Proxy log shows `connected: <name> (N tools)` for healthy upstreams. |
| **B⁗.5** | **(Same smoke showed the proxy reported "ready" 2ms after Claude Code disconnected at the 30s safety timeout.)** `Promise.allSettled` blocked the proxy's "ready" signal on the slowest upstream's failure path. Added `STARTUP_DEADLINE_MS = 15_000` per-upstream race in `proxyServer.connectServerEntry`, plus per-connection real-time logging (`connected: name (N tools, Nms)`). Slow upstreams skipped, healthy ones report instantly, proxy comes up well within Claude Code's 30s window. | Orchestrator. | Proxy log shows real-time connection progress. |
| **D** | **(Live smoke proved CodeMode end-to-end working: agent successfully called `mcp__codemode_proxy__execute_code`, then `Object.keys(servers)`, `Object.keys(servers.ouroboros)`, `servers.ouroboros.search_graph`, `servers.ouroboros.query_graph`. Per user directive: stop point-fixing the hand-roll, do the proper SDK adoption.)** Replaced `mcpClient.ts` hand-roll with `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport`. Replaced `proxyServer.ts` hand-rolled message handling with `Server` + `StdioServerTransport` and SDK request handlers. Mirrors Wave 53j precedent (`internalMcpStdioTransport.ts`). 280-line hand-rolled mcpClient → 120 lines. NDJSON parser tests retired (SDK owns wire); replaced with SDK-mocked initialize/listTools/callTool delegation tests. New `proxyServer.test.ts` covers `buildExecuteCodeTool`, `buildToolDispatchMap`, `formatExecutionResult`, `formatExecutionFailure`, plus entry-point guard. See ADR Decision 9. | sonnet-implementer. | 113 tests passing across codemode + scopedMcpConfig + claudeCodeMode. Lint + typecheck clean. Build green. CodeMode end-to-end verified via live smoke. |
| C | Wrap-up: result brief, version bump, commit. | Orchestrator. | All gates clean, tagged v2.7.12. |

---

## Risks

| Risk | Mitigation |
|---|---|
| The "disable original servers" semantic doesn't have a clean Claude-Code-CLI equivalent | Keep them ENABLED alongside `__codemode_proxy` (the "coexist" option from earlier discussion). Loses context savings but no destructive change. Decide in Phase A based on Open Question 1. |
| `proxyServer.ts` requires upstream MCP server configs in a specific shape that doesn't match what's in `~/.claude.json` directly | Read upstream configs from the file we're managing, transform if needed. Same data, different file. Should be a config-loader change, not a wire-format one. |
| Tests in `codemodeManager.ts.test.ts` (and integration test) hard-code `.claude/settings.json` paths | Update assertion paths; pattern matches what 53g and 53j tests did. |
| User has CodeMode disabled (`codemode.enabled: false`) — wave does nothing for them | Correct behavior; this wave only matters when CodeMode is enabled. Document in ADR. |

---

## Acceptance criteria (wave-level)

- [ ] `codemodeManager` writes `__codemode_proxy` to `~/.claude.json mcpServers` (global) and toggles `~/.claude.json projects.<root>.disabledMcpjsonServers` for project scope. Restoration data lives in `~/.claude/codemode-managed.json`.
- [ ] All five locked decisions (above) reflected in the ADR (`roadmap/decisions/wave-53k.md`).
- [ ] All `codemode/` tests pass after fixture rewrite.
- [ ] IDE-orchestrated session smoke confirms `__codemode_proxy` engagement (not `ouroboros` direct-inject).
- [ ] No regressions in Wave 53h adoption smoke (graph tools still work end-to-end, just routed through CodeMode).

---

## Out-of-wave follow-ups

- **Wave 53l** — extend CodeMode multiplexing to ALL user MCP servers + make it discoverable for external sessions. Larger architectural wave.
- **Soak period before flipping schema defaults to true.** This wave only fixes file targeting; the schema defaults (`codemode.enabled: false` etc.) stay false. After 53k smoke + 1-2 weeks of usage, can flip globally if no regressions.
- **`disabledMcpServers` standardization.** If Open Question 1 lands on a custom key (`_codemodeManagedServers`), document it for any future reader.