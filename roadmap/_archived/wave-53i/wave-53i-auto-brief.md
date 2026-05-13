# Wave 53i Result — Replace Hand-Rolled MCP Server With Official SDK

**Status:** ✅ COMPLETED — 2026-04-28 (code shipped; Phase B smoke pending user post-restart)
**Version:** v2.7.10 (patch — internal refactor)
**Plan:** `roadmap/wave-53i-plan.md`
**ADR:** `roadmap/decisions/wave-53i.md`

---

## What shipped

`src/main/internalMcp/internalMcpServer.ts` rewritten on top of `@modelcontextprotocol/sdk@^1.29.0`. The hand-rolled SSE/JSON-RPC dispatch is gone; the SDK's `Server` + `SSEServerTransport` classes handle the wire format end-to-end.

### Why this wave

Six waves of MCP-spec compat fixes (53d/53e/53f/53g/53h) for our hand-rolled server. Each fix matched what the SDK already does. Wave 53h's fix was essentially a partial reproduction of `SSEServerTransport`. The cure for "we keep matching the SDK by hand" is "use the SDK directly." This wave operationalizes the lesson Wave 53h memorialized: *for Claude-Code-targeted MCP server work, treat the SDK source as canonical, not the spec text.*

### What changed

- **`@modelcontextprotocol/sdk@^1.29.0`** added as a runtime dependency.
- **`internalMcpServer.ts` rewritten:**
  - SDK's `Server` hosts our request handlers via `setRequestHandler(ListToolsRequestSchema, ...)` and `setRequestHandler(CallToolRequestSchema, ...)`. (`McpServer.registerTool` requires Zod; our existing tools use JSON Schema, so the lower-level `Server` is the right entry point.)
  - SDK's `SSEServerTransport('/message', res)` writes the SSE handshake. `server.connect(transport)` calls `transport.start()`, which produces the canonical endpoint event with sessionId. We track `Map<sessionId, {transport, server}>` for routing POSTs.
  - Node `http.createServer` scaffolding preserved — port allocation, listen, stop lifecycle unchanged. `InternalMcpServerHandle` contract preserved.
  - Removed: hand-rolled JSON-RPC parser/dispatcher (~120 lines), Wave 53h's `pushResponseToSse` / `extractSessionId` helpers (now SDK-internal), Wave 53f's hand-rolled endpoint event write.
- **Tool registry adapter:** `getActiveTools()` / `findTool()` registry is unchanged. Two `setRequestHandler` calls wire it to the SDK at the boundary. The two-tier fallback (graph-healthy → 14 tools, degraded → 6 fallback tools) remains in `getActiveTools()`.
- **`internalMcpServerSse.contract.test.ts` retired.** It asserted the exact SSE first-message wire format produced by the SDK — fragile (SDK could legitimately change format in a non-breaking minor) and tests upstream code. Replaced with `internalMcpServer.test.ts` (5 cases) that smokes our routing layer — port allocation, /sse content-type + endpoint marker, sessionId guards on POST, /health payload.
- **`internalMcpAutoInject.ts` unchanged.** Auto-inject output (`{type: "sse", url: ".../sse"}`) is what the SDK transport accepts; no change needed.
- **Wave 51 stdio bridge unchanged.** It forwards stdio JSON-RPC frames to `/message` — same endpoint the SDK transport now accepts.

### Wire format produced by the SDK (verified by Phase A test)

```
event: endpoint
data: /message?sessionId=<UUID>
```

Phase A's test asserts the line-level marker (`event: endpoint`) but NOT the exact format — that's the SDK's responsibility now and may evolve in non-breaking minors.

## Phase tally

| Phase | Files | Tests | Commit |
|---|---|---|---|
| A — SDK adoption + retire hand-rolled SSE | 5 (`+465 / -326`) | 51/51 internalMcp pass; 5 new + retired 3 SSE-contract = net 2 added | `5345b97` |
| B — Smoke (post-restart, user-driven) | n/a | n/a | (pending) |
| C — Wrap-up | This brief, ADR, plan flip, version bump | — | (this commit) |

## Gates

| Gate | Result |
|---|---|
| `npm run lint` (touched files) | ✅ 0 errors |
| `npx tsc --noEmit -p tsconfig.node.json` | ✅ clean |
| Phase A scoped tests | ✅ 51/51 across all 6 internalMcp test files |
| Full vitest suite | Skipped per user direction; pre-push hook validates |

## Manual smoke (Phase B — pending user post-restart)

After IDE restart:

### Part 1 — orchestrator-runnable (curl)

1. `.mcp.json` unchanged: `{type: "sse", url: "http://127.0.0.1:PORT/sse"}`.
2. `claude mcp get ouroboros` reports `Status: ✓ Connected`.
3. `curl -sS -N http://127.0.0.1:PORT/sse` first chunk includes `event: endpoint`, `data: /message?sessionId=<UUID>`.
4. POSTing a `tools/list` JSON-RPC to `/message?sessionId=...` returns the 14 tools (or 6 fallback) — same content as Wave 53h smoke.

### Part 2 — fresh Claude Code session (user)

Same prompt as Wave 54 smoke #4: *"Use trace_call_path to find callers of injectIntoProjectSettings"*. Should produce the same agent UX (call the tool, return real graph data). If anything regresses — connection refused, schema-validation rejection, agent doesn't see the tools — Phase A introduced a regression; iterate.

## Why we keep SSE instead of migrating to Streamable HTTP

The SDK supports both `SSEServerTransport` (legacy 2024-11-05) and `StreamableHTTPServerTransport` (newer single-endpoint). Claude Code's client tries Streamable HTTP first, falls back to SSE. We could've migrated and saved a wave's worth of legacy maintenance — but:

- Wave 53h's smoke verified SSE working end-to-end; migrating now changes the URL, type field, auto-inject output, and Wave 51 stdio adapter's forwarding endpoint — broader scope without a "this fixes a problem we have today" justification.
- SSE is marked `@deprecated` in the SDK source but still shipped. We'd take a Streamable HTTP migration if the SDK drops SSE in a future major.

Filed as out-of-wave: Streamable HTTP migration when warranted.

## Subagent observations

Orchestrator-direct (no subagent dispatch). Two `PostToolUse` hooks fired during execution:
- `post_write_test_required` blocked once on rewrite of `internalMcpServer.ts` (treated as new file because Write replaced contents). Resolved by writing co-located test.
- `post_edit_eslint` blocked once on import-sort autofix. Resolved by autofix.

Both hook fires were correct — they enforced co-location and clean lint state before push.

## Known limitations

- **Tool registration uses lower-level `Server`, not `McpServer.registerTool`.** Trade-off: `registerTool` requires Zod schemas, our existing tools use JSON Schema objects (4+ files of definitions in `mcpToolHandlerDefs.ts` and `mcpToolHandlerHelpers.ts`). Migrating to Zod would be a larger refactor; the boundary adapter we use is canonical SDK usage.
- **Wave 53f's hand-rolled SSE behavior is the bar to match.** If the SDK's transport differs in any way that confuses Claude Code's client, Phase B surfaces it. The SDK is the canonical reference, so any divergence is more likely a bug in our wrapper than an SDK issue.
- **Adoption verification still pending** Phase B Part 2.

## Out-of-wave follow-ups

- **Streamable HTTP transport migration** — if/when SDK drops SSE.
- **Zod-based tool registration** — if/when we want the SDK's higher-level `registerTool` API. Not blocking; current adapter pattern works.
- **`@modelcontextprotocol/sdk` security audit** — `npm install` reported 32 vulnerabilities (transitive express deps). Review before next major release. Most are dev-only; surface that in a separate audit pass.
- **Wave 53c corpus re-analysis** with prefix-aware tool names (`mcp__<server>__<tool>`) — still pending.

## Memory update

Added Wave 53i note to `~/.claude/projects/C--Web-App-Agent-IDE/memory/project_graph_tool_adoption_gap.md`.