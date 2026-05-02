# Wave 53j — Stdio Bridge SDK Rewrite + CodeMode Enable
## Implementation Plan

**Status:** ✅ COMPLETED — 2026-04-28 · Released as v2.7.11 · Result: `roadmap/auto-briefs/wave-53j-result.md` · Phase C smoke PENDING user post-restart
**Version target:** v2.7.11 (patch — bridge fix + per-user opt-in to CodeMode; no schema-default change)
**Dependencies:** Wave 53i (v2.7.10) shipped the SDK-backed SSE server. This wave rewrites the stdio bridge to match.

---

## Why this wave exists

Two questions surfaced post-Wave-53i:

1. **Are agents enforced or heavily suggested to use graphing?** Suggested via `~/.claude/rules/graph-tool-routing.md`, not enforced. Wave 54 smoke #4 confirmed agents follow the rule when tools are available.
2. **Why isn't CodeMode being used over MCP?** Two reasons stack:
   - `codemode.enabled: false` (Wave 51 default; never flipped).
   - The Wave 51 stdio bridge POSTed to `/message` without sessionId, which broke after Wave 53h made sessionId required. CodeMode's routing matrix requires `transport: "stdio"`, which routes through the (broken) bridge — flipping the flag without fixing the bridge would have exposed the regression.

This wave fixes the bridge correctness AND opts this user in to CodeMode for testing. Schema defaults stay conservative (false) until a real soak period validates the new transport path.

---

## Scope

### In-scope (Phase A)

- Rewrite `src/main/internalMcp/internalMcpStdioTransport.ts` using the SDK on both sides:
  - `Client` + `SSEClientTransport` connect to the IDE's `/sse`. SDK handles endpoint event + sessionId routing automatically.
  - `Server` + `StdioServerTransport` receive stdio JSON-RPC from Claude Code. `setRequestHandler(ListToolsRequestSchema, ...)` and `setRequestHandler(CallToolRequestSchema, ...)` delegate to the Client side via `client.listTools()` / `client.callTool()`.
- Gate `main()` behind `isScriptEntry()` so vitest can import the module without auto-spawning the proxy.
- Replace `internalMcpStdioTransport.test.ts` (was testing hand-rolled JSON-RPC framing) with 10 SDK-shape tests targeting the boundaries we own (parsePort, createProxyServer).
- Remove orphaned barrel re-exports (`dispatchStdioMessage`, `runStdioTransport` — symbols deleted with the hand-rolled implementation).

### In-scope (Phase B — user-only opt-in)

- Edit the user's persisted config at `C:\Users\coles\AppData\Roaming\ouroboros\config.json`:
  - `internalMcp.transport: "sse"` → `"stdio"` (Claude Code spawns the bridge subprocess instead of opening SSE directly)
  - `codemode.enabled: false` → `true`
  - `codemode.routeInternalMcp: false` → `true`
- **Schema defaults unchanged.** Wave 51's comment says "default false; flipped on after a soak." We just shipped the bridge fix tonight — that's exactly the moment to NOT also flip global defaults. Other users (and fresh installs) stay on the conservative SSE path until soak data accumulates.

### Out-of-scope

- Migrating to Streamable HTTP transport. Claude Code's MCP client supports both SSE and Streamable HTTP; the SDK's SSEClientTransport handles SSE correctly. Streamable HTTP migration is a future wave if/when SDK drops SSE.
- Hook-based enforcement of graph-tool routing (the answer to question 1). Premature — let real usage data accumulate first; passive measurement (re-run corpus analyzer in a few weeks) before adding enforcement.
- Flipping schema defaults globally. Conservative: this user opts in explicitly, no broad-impact change.

---

## Phase tally

| Phase | Files | Tests | Commit |
|---|---|---|---|
| A — SDK-based bridge + tests | 3 (`+164 / -476`) | 49/49 internalMcp pass; 10 new bridge cases (replaced 12 hand-rolled framing cases) | `52ead7e` |
| B — User config opt-in | 1 (user's config.json, outside repo) | n/a | (filesystem edit; no commit needed — schema defaults unchanged) |
| C — Wrap-up | This brief, ADR, plan flip, version bump | — | (this commit) |

---

## Phase D — Smoke (PENDING USER post-restart)

After IDE restart, the new behavior is:

- `.mcp.json` shape changes from `{type: "sse", url: ".../sse"}` to `{type: "stdio", command: "node", args: [stdioPath, port]}` (because `internalMcp.transport` is now stdio).
- Each Claude Code session spawns the bridge subprocess. Bridge connects to IDE's SSE server. CodeMode routing now engages — `__codemode_proxy` handles the tool surface.

### Smoke checklist

1. **Filesystem (orchestrator):**
   - `.mcp.json` shape = `{type: "stdio", command, args}` (NOT `type: "sse"`).
   - `claude mcp get ouroboros` reports the server, status connected.
2. **Fresh Claude Code session (user):**
   - Same prompt as Wave 54 smoke #4: *"Use trace_call_path to find callers of injectIntoProjectSettings"*. Should produce same agent UX (or better — fewer tool schemas, more concise context).
   - **What's different:** the bridge subprocess spawns. Look for it in Task Manager (`node.exe` parent of the Claude Code process). Performance should be comparable to direct SSE; if noticeably slower, that's a real cost the user can weigh.

### If smoke fails

Most likely failure modes:
- **Bridge spawn fails.** Check stderr (Claude Code logs the bridge's stderr). If "ENOENT", `internalMcpStdioTransport.js` isn't where the path expects — likely an electron-vite build entry issue.
- **Bridge starts but can't connect to SSE.** Stderr would show SDK connection error. The bridge expects `internalMcp` server on the same port the IDE registered via `setInternalMcpPort()`.
- **CodeMode not engaged.** Check `.mcp.json` — if `ouroboros` is still there with `type: "stdio"`, routing decided `direct-inject` (CodeMode bypassed). Re-check config: all three flags must be true AND transport must be stdio.

### Rollback

If anything breaks, revert via electron-store:

```bash
python -c "import json; p=r'C:\\Users\\coles\\AppData\\Roaming\\ouroboros\\config.json'; \
d=json.load(open(p,'r',encoding='utf-8')); \
d['internalMcp']={'transport':'sse'}; d['codemode']={'enabled':False,'routeInternalMcp':False}; \
json.dump(d, open(p,'w',encoding='utf-8'), indent=2)"
```

Then restart IDE.

---

## Acceptance criteria

- [x] Stdio bridge rewritten using SDK; 49/49 internalMcp tests pass.
- [x] User's config opted in to stdio transport + CodeMode.
- [x] Schema defaults unchanged.
- [ ] Phase D smoke confirms bridge spawn + CodeMode routing in fresh Claude Code session.
- [ ] If smoke passes: Wave 54 smoke run still works (no regression). If smoke fails: rollback path documented above.

---

## Out-of-wave follow-ups

- **Soak period for CodeMode**, then flip schema defaults globally. Probably a week of usage; if no regressions surface, ship as a follow-up wave.
- **Streamable HTTP transport migration** — if/when SDK drops SSE.
- **Hook-based graph-tool enforcement** — if passive measurement (Wave 53c re-run in a few weeks) shows agents still default to Grep too often.
- **Graph-tool adoption corpus re-analysis** — re-run with prefix-aware tool naming (`mcp__<server>__<tool>`); still pending from Wave 53g/53h.