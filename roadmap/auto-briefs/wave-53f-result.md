# Wave 53f Result — MCP SSE Handshake Spec Compliance

**Status:** ✅ COMPLETED — 2026-04-28
**Version:** v2.7.7 (patch — server-side SSE handshake fix; no new feature surface)
**Plan:** `roadmap/wave-53f-plan.md`
**ADR:** `roadmap/decisions/wave-53f.md`
**Smoke artifact:** `roadmap/wave-53d-live-test.md` (continuing the cumulative live-test doc; "Wave 54 adoption smoke run #2" section appended once Phase B observation lands)

---

## What shipped

A surgical fix to two MCP-spec violations in the SSE handler at `src/main/internalMcp/internalMcpServer.ts:44-67` that prevented Claude Code sessions from registering the `mcp__ouroboros__*` tools.

### The two bugs

1. **Wrong-direction notification.** The handler wrote `data: {"jsonrpc":"2.0","method":"notifications/initialized"}\n\n` to the SSE stream immediately on connection. Per the MCP spec (2024-11-05 and every later version), `notifications/initialized` is a **client → server** notification — the client sends it after receiving the `initialize` response. The server emitting it the wrong way caused strict clients (Claude Code's MCP implementation) to drop the connection.

2. **Missing endpoint event.** The 2024-11-05 HTTP+SSE transport (which the server advertises via `protocolVersion: '2024-11-05'` in its `initialize` response) requires the first SSE message to be `event: endpoint\ndata: <postUrl>\n\n`. The handler skipped this entirely, so the client had no way to discover where to POST messages.

### The fix

Replaced the wrong-direction notification line with the correct endpoint event using a relative URL (`/message`). Heartbeat and connection-close handling stay unchanged. Added an explanatory comment at the call site citing the spec and Wave 53f.

### Contract test

`src/main/internalMcp/internalMcpServerSse.contract.test.ts` (113 lines, 3 cases). Spawns a real server on a random port via `startInternalMcpServer`, opens a GET request to `/sse`, reads the first chunk, asserts:

- The chunk **contains** `event: endpoint\ndata: /message\n\n`.
- The chunk does **NOT** contain `notifications/initialized`.
- The response sets `Content-Type: text/event-stream`.

If a future change reverses either spec compliance, the relevant assertion fails loudly and points directly at the regression class.

## Why curl worked but Claude Code didn't

The Wave 53e smoke verified tool functionality via curl POST to `/message`. Curl bypassed the SSE handshake entirely — it didn't open the SSE stream, didn't read the (malformed) first message, and just hit the JSON-RPC endpoint directly. That worked because the JSON-RPC endpoint itself was correctly implemented; only the SSE handshake was broken.

Claude Code's MCP client (and any spec-compliant client) opens the SSE stream first, expects the endpoint event, and either waits for it or drops the connection when receiving an unexpected `notifications/initialized` payload. That's why a "server" that responded correctly to direct JSON-RPC could still appear "broken" to a real client.

## Phase tally

| Phase | Files | Lines | Tests | Commit |
|---|---|---|---|---|
| A — SSE fix + contract test | 2 | +123 / -2 | 3/3 + 29 existing | `aee75dc` |
| B — Adoption smoke (post-restart) | n/a | n/a | n/a | (this commit covers wrap-up; smoke runs separately) |
| C — Wrap-up | This brief, ADR, plan flip, version bump | — | — | (this commit) |

## Gates

| Gate | Result |
|---|---|
| `npm run lint` (touched files) | ✅ 0 errors |
| `npx tsc --noEmit -p tsconfig.node.json` | ✅ clean |
| Phase A scoped tests | ✅ 3/3 contract + 29/29 existing internalMcp/ |
| Full vitest suite | Skipped per user direction; pre-push hook validates |

## Manual smoke (Phase B — pending user)

The fix lands in the IDE main process, so it requires a rebuild + restart to take effect. Two-part smoke checklist:

### Part 1 — orchestrator-runnable post-restart (curl-based)

After IDE restart, the orchestrator can verify the SSE handshake itself:

1. Read `.claude/settings.json` for the new port.
2. `timeout 3 curl -sS -N http://127.0.0.1:<port>/sse` → first chunk must contain `event: endpoint\ndata: /message`, must NOT contain `notifications/initialized`.

If Part 1 fails, Phase A had a regression and Phase B doesn't proceed.

### Part 2 — user-runnable in a fresh Claude Code session

Same shape as Wave 53d/53e Phase D smoke:

1. Open a fresh Claude Code session in the IDE chat panel or external terminal in `C:\Web App\Agent IDE`.
2. Ask a graph-shaped question (e.g., "Use `trace_call_path` to find callers of `injectIntoProjectSettings`").
3. Observe whether `mcp__ouroboros__*` tools are visible AND whether the agent picks the right one.
4. Append observation to `roadmap/wave-53d-live-test.md` under "Wave 54 adoption smoke run #2".
5. Finalize Wave 53d's Decision 9 (Greenlit / Redesigned / Retired) based on the observation.

The smoke from Wave 54's earlier run already confirmed the **agent-behavior layer** is sound (correct fallback, self-aware reporting). Phase B Part 2's job is to confirm the **server↔client handshake** now succeeds and the agent reaches for the appropriate tool.

## Subagent observations

Orchestrator-direct (no subagent dispatch). Per `notes/wave-process.md` "Sub-threshold changes (single-file edits, small bug fixes) go direct" — the fix was 5 lines plus a contract test, well under the threshold for subagent overhead.

## Known limitations

- **Adoption verification still pending** Phase B Part 2. Wave 54's verdict is the only open thread.
- **Stale `vi.mock('electron')` surface in the contract test** — covers `getPath`, `isPackaged`, `getAppPath`. If a future change adds a new transitive electron call from `internalMcpServer`'s import graph, the test would fail with `Cannot read properties of undefined (reading '<newMethod>')` and the mock would need extending. Acceptable: explicit failure mode, easy fix.
- **No migration to Streamable HTTP** (newer MCP transport). Out of wave per ADR Decision 1. Only revisit if Phase B reveals 2024-11-05 isn't enough.

## Out-of-wave follow-ups

- **Wave 54 verdict finalization** — happens when the user records Phase B Part 2's observation.
- **Streamable HTTP migration** — only if needed.
- **CLAUDE.md "SSE client tracking / broadcasts tool-result events"** — the doc claims this exists but the current handler doesn't implement it. Either the doc is stale or the feature was removed at some point. Worth investigating as a small follow-up before relying on the claim.
- **`list_projects` stale-stat refresh** — still pending from Wave 53e.
- **Version-drift cleanup** — still pending.

## Memory update

Updated `~/.claude/projects/C--Web-App-Agent-IDE/memory/project_graph_tool_adoption_gap.md`: Wave 53f shipped the SSE handshake fix; Wave 54 verdict pending adoption smoke run #2.