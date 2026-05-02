# Wave 53f — MCP SSE Handshake Spec Compliance
## Implementation Plan

**Status:** ✅ COMPLETED — 2026-04-28 · Released as v2.7.7 · Result: `roadmap/auto-briefs/wave-53f-result.md` · Phase B Part 2 (adoption smoke) PENDING user post-restart
**Version target:** v2.7.7 (patch — server-side SSE handshake bug fix; no new feature surface)
**Feature flags:** None.
**Dependencies:**
- Wave 53e ✅ shipped at v2.7.6 (graph-context wiring)
- Wave 54 adoption smoke (2026-04-28) — surfaced this bug

**References:**
- `roadmap/wave-53d-live-test.md` — Wave 54 adoption smoke section with the fresh-session observation
- `roadmap/decisions/wave-53e.md` — Decision 6 (Wave 54 blocker pivot)
- `src/main/internalMcp/internalMcpServer.ts:44-67` — the broken `handleSse` function
- MCP 2024-11-05 HTTP+SSE transport spec (per Wave 53f research)

---

## Why this wave exists

The Wave 54 adoption smoke (post-v2.7.6) showed the server-side wiring works (curl-driven JSON-RPC against `/message` returns real tool results) but **fresh Claude Code sessions don't register `mcp__ouroboros__*` tools** in their tool list. Investigation pinned two MCP-spec violations in the SSE handler at `src/main/internalMcp/internalMcpServer.ts:44-67`:

1. **Wrong-direction notification.** Line 52–53 writes `data: {"jsonrpc":"2.0","method":"notifications/initialized"}\n\n` immediately on SSE connection. Per the MCP spec, `notifications/initialized` is a **client → server** notification sent by the client *after* receiving the `initialize` response. The server sending it the wrong way is a protocol violation.

2. **Missing endpoint event.** The 2024-11-05 HTTP+SSE transport (which the server advertises via `protocolVersion: '2024-11-05'`) requires the first SSE message to be `event: endpoint\ndata: <postUrl>\n\n` — that's how the client discovers where to POST messages. The handler skips this entirely.

Curl works because curl uses POST `/message` directly, bypassing the SSE handshake. Claude Code's MCP client follows the SSE handshake, doesn't get the endpoint event, gets a malformed wrong-direction notification, and refuses to register tools.

---

## Goal

Fix the SSE handler so a fresh Claude Code session in this project's directory registers the 14 graph-aware tools and shows them as `mcp__ouroboros__*` in its tool list. Once tools register, the Wave 54 adoption smoke can actually evaluate adoption.

---

## Scope

### In-scope

- Phase A: Fix the SSE handler (`handleSse` in `internalMcpServer.ts`). Two changes: remove the wrong-direction notification, add the endpoint event. Add a contract test asserting the SSE response shape.
- Phase B: Re-run the adoption smoke from a fresh Claude Code session, confirm `mcp__ouroboros__*` tools are now visible.
- Phase C: Wrap-up — result brief, ADR, version bump, push. If smoke passes, finalize Wave 54's verdict in Wave 53d's Decision 9.

### Out-of-scope

- Migration to the newer Streamable HTTP transport (2025-03-26 / 2025-11-25). The server advertises `2024-11-05` and we keep it there for now. Migrating is its own wave if/when the spec or Claude Code requires it.
- Per-spawn `--mcp-config` injection path. Same `internalMcpServer.ts` serves both paths (file-injection writes the URL into settings.json; stdio path forwards to the same server). The fix repairs both call sites.
- Any handler changes beyond the SSE surface. The existing `handleRpc` / `tools/list` / `tools/call` path works correctly per Wave 53e's smoke.

---

## Phase A — Fix + contract test

**Goal:** Make the SSE handler spec-compliant for the 2024-11-05 transport.

### Files modified

| File | Change |
|---|---|
| `src/main/internalMcp/internalMcpServer.ts` | In `handleSse` (lines 44–67): replace the `data: {"jsonrpc":"2.0","method":"notifications/initialized"}\n\n` write with `event: endpoint\ndata: /message\n\n`. Add an explanatory comment citing the MCP 2024-11-05 transport spec and Wave 53f. Heartbeat and close handling stay unchanged. |

### New test file

| File | Purpose |
|---|---|
| `src/main/internalMcp/internalMcpServerSse.contract.test.ts` | Spawns the real server on a random port via `startInternalMcpServer`, opens an HTTP GET to `/sse`, reads the first chunk, asserts it begins with `event: endpoint\ndata: /message\n\n`. Asserts the chunk does **not** contain `notifications/initialized`. Stops the server. Catches any future regression where someone restores the wrong-direction notification or removes the endpoint event. |

### Acceptance

- [ ] `handleSse` writes the endpoint event first; no `notifications/initialized`.
- [ ] Contract test passes — first SSE chunk has the expected shape.
- [ ] Existing `internalMcp/` tests still pass (29 cases pre-fix).
- [ ] Lint clean on touched files.
- [ ] `npx tsc --noEmit -p tsconfig.node.json` clean.
- [ ] Commit: `fix(wave-53f): Phase A — SSE handler sends endpoint event, drops wrong-direction notification`

---

## Phase B — Adoption smoke (post-restart)

Same shape as Wave 53e Phase B. After the fix lands and the IDE restarts, the orchestrator (or user) runs the smoke from a fresh Claude Code session.

### Acceptance

- [ ] A fresh Claude Code session shows `mcp__ouroboros__*` tools (or at least `mcp__ouroboros__search_graph` / `mcp__ouroboros__trace_call_path`) in its tool list.
- [ ] When asked a graph-shaped question, the agent reaches for the appropriate tool (rather than defaulting to Grep).
- [ ] The tool returns a useful response.
- [ ] Observation appended to `roadmap/wave-53d-live-test.md` under a new "Wave 54 adoption smoke run #2" section.
- [ ] Wave 54's verdict (Greenlit / Redesigned / Retired) finalized in Wave 53d's ADR Decision 9 based on the observation.

---

## Phase C — Wrap-up

- Full vitest suite skipped per user direction; pre-push hook validates.
- `npm run lint` — zero errors.
- Both typechecks — clean.
- Result brief at `roadmap/auto-briefs/wave-53f-result.md`.
- ADR finalize at `roadmap/decisions/wave-53f.md`.
- Plan status flip on this file.
- `roadmap/wave-54-plan.md` blocker line — update or close depending on Phase B verdict.
- Memory pointer update (`project_graph_tool_adoption_gap.md`).
- Version bump v2.7.6 → v2.7.7.
- Release commit + tag + push + GH release.

---

## Subagent execution model

Single-file fix + single test file → orchestrator-direct, no subagent overhead. Per `notes/wave-process.md`: "Sub-threshold changes (single-file edits, small bug fixes) go direct."

---

## Risks

| Risk | Mitigation |
|---|---|
| Claude Code's MCP client uses a newer Streamable HTTP transport and ignores 2024-11-05 entirely | Phase B reveals it — tools still don't register despite the spec-compliant SSE handshake. Then a follow-up wave migrates the server to Streamable HTTP. Out-of-wave for 53f. |
| Endpoint URL format `/message` is wrong (some clients want absolute URL) | If Phase B fails this way, switch to absolute URL built from `req.headers.host`. Easy iteration. |
| Phase B reveals tools register but agent doesn't use them | That's the qualitative adoption observation Wave 54 was supposed to capture. Document, finalize Decision 9 as Redesigned (better tool descriptions / surface visibility) rather than Retired. |
| Per-spawn `--mcp-config` path needs its own fix | Same server serves both paths; this fix benefits both. Smoke from external terminal in Phase B verifies. |

---

## Acceptance criteria (wave-level)

- [ ] SSE handler writes spec-compliant first message.
- [ ] Wrong-direction notification removed.
- [ ] Contract test prevents regression.
- [ ] Phase B confirms tools register in fresh Claude Code sessions OR documents next-layer issue honestly.
- [ ] Wave 54 verdict resolved (Greenlit / Redesigned / Retired) in `wave-53d.md` Decision 9.
- [ ] No regressions in existing `internalMcp/` tests.

---

## Out-of-wave follow-ups

- **Streamable HTTP transport migration** — only if Phase B reveals 2024-11-05 isn't enough.
- **`list_projects` stale-stat refresh** — still pending from Wave 53e.
- **Version-drift cleanup** — still pending.