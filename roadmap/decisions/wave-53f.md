# Wave 53f — Architecture Decision Record

**Status:** Decisions 1–4 resolved at Phase A close; Decision 5 (Wave 54 verdict) finalizes when Phase B's adoption smoke produces an observation.

This wave fixes spec-compliance violations in existing MCP transport code rather than introducing new architecture. Decisions are tactical.

---

## Decision 1: Stay on protocolVersion 2024-11-05 — do not migrate to Streamable HTTP

**Context:** The MCP spec evolved past 2024-11-05 (the version the server currently advertises). Newer versions introduce a unified `/mcp` endpoint with different handshake semantics ("Streamable HTTP" / 2025-03-26 / 2025-11-25 depending on which iteration). One option: migrate now and fix the SSE bug at the same time. Another: keep 2024-11-05 and just fix the spec violations within it.

**Pick:** Stay on 2024-11-05.

**Rationale:** Migrating transports is wave-sized — touches the server, both transport adapters (`internalMcpAutoInject.ts` writes the URL into settings.json, Wave 51's stdio bridge forwards to the same path), and the auto-inject's URL format. The current bug is a 5-line fix within the existing transport. Shipping the smaller fix unblocks adoption testing; if the smoke later shows clients require a newer transport, that's its own wave with its own scope.

**Consequences:** If a future Claude Code release drops 2024-11-05 support, this fix only buys time. The migration would be a Wave 53g (or 54-prerequisite) at that point. For now, the smaller fix is correct.

---

## Decision 2: Endpoint URL uses relative path (`/message`) not absolute

**Context:** The endpoint event tells the client where to POST messages. Format options: relative (`/message`) or absolute (`http://127.0.0.1:<port>/message`).

**Pick:** Relative.

**Rationale:** The MCP 2024-11-05 spec example uses relative paths, and clients are expected to resolve relative URLs against the SSE connection's base. Absolute URLs add risk (the server would need to read `req.headers.host`, handle missing/spoofed headers, and embed the port — extra failure modes). Relative is simpler and matches the spec example.

**Consequences:** If a client requires absolute URLs, Phase B's smoke surfaces it (the client opens the SSE connection, gets `data: /message`, doesn't know how to construct the POST URL, drops). Iteration would build the absolute URL from `req.headers.host`. Easy fallback if needed.

---

## Decision 3: Contract test spawns a real server, not mocks the HTTP layer

**Context:** Two ways to assert the SSE response shape: (A) spawn a real server on a random port, GET /sse, read the chunk; (B) construct a mock `IncomingMessage`/`ServerResponse` pair and call `handleSse` directly.

**Pick:** A — real server.

**Rationale:** `handleSse` is private (not exported). Exporting it for testability would expand the module's public surface. A real-server test exercises the full path the actual client sees — same writeHead, same response shape, same timing. The cost is ~3 seconds of test setup for the bind. Acceptable since it runs in scoped mode, not on every keystroke.

**Consequences:** The test depends on `startInternalMcpServer` working end-to-end, which means it transitively imports `chatOrchestrationBridge.ts` → `threadStore.ts` → Electron's `app.getPath()`. A `vi.mock('electron', ...)` stub at the top of the test file covers this. If a future refactor changes the import graph and the stub's surface needs to grow, the test will break with an explicit error pointing at the missing field — fixable in seconds.

---

## Decision 4: Keep the heartbeat unchanged

**Context:** Phase A could have also restructured the heartbeat or added more SSE features (server-initiated notifications for tool-list changes, etc.). The CLAUDE.md mentions broadcasting tool-result events to all SSE clients — but the current code doesn't actually do that.

**Pick:** Don't expand scope. Heartbeat stays. Tool-list-change notifications are a separate feature.

**Rationale:** This wave fixes a regression-class bug (SSE handshake non-compliance). Adding new SSE features in the same wave bundles unrelated work and risks introducing new bugs. The CLAUDE.md's "broadcasts tool-result events" claim is either stale or refers to a feature that isn't currently implemented; that's a follow-up to investigate, not a 53f deliverable.

**Consequences:** If a future wave adds tool-list-changed notifications (legitimate MCP feature for live tool updates), it'll touch this same handler. The existing SSE client tracking (mentioned in CLAUDE.md but not visible in the current code) would need to be implemented. Out-of-wave for 53f.

---

## Decision 5 (PENDING SMOKE): Wave 54 verdict

**Context:** The wave's plan said Phase B would deliver the Wave 54 verdict (Greenlit / Redesigned / Retired) based on an adoption observation in a fresh Claude Code session post-fix.

**Status:** PENDING. Phase B's smoke runs from a fresh Claude Code session post-restart. When the user records the observation in `roadmap/wave-53d-live-test.md` (the cumulative live-test artifact), Decision 9 of Wave 53d's ADR finalizes Wave 54 as one of:

- **Greenlit:** Tools register AND the agent reaches for them on graph-shaped queries with useful results. Wave 54 (TS semantic operations) ships per its plan.
- **Redesigned:** Tools register but the agent rarely picks them despite the routing rule. Wave 54's exposure path needs work (better descriptions, surface visibility) before any new tools ship.
- **Retired:** Tools register and the agent ignores them entirely. Wave 54's value proposition collapses; close the wave.

The decision belongs in Wave 53d's ADR (where it was originally deferred), not duplicated here.