# Wave 53h — Architecture Decision Record

**Status:** Decisions 1–4 resolved at Phase A close; Decision 5 (Wave 54 verdict) finalizes when Phase B's adoption smoke produces an observation.

This wave fixes two specific gaps in our hand-rolled MCP server's compatibility with the official SDK's SSE client. Decisions are tactical; the larger architectural question (replace hand-rolled with SDK) is captured as a follow-up.

---

## Decision 1: Add `type` field to `.mcp.json` entries

**Context:** Claude Code's `.mcp.json` schema validator requires every server entry to declare a `type` (`sse`, `http`, or `stdio`). Without it, the entry is silently rejected with "Does not adhere to MCP server configuration schema" — appears as "Failed to parse" in `claude mcp list`.

**Pick:** Always include `type` in the auto-inject's output. URL entries → `type: "sse"`. Stdio entries → `type: "stdio"`.

**Rationale:** This is purely a schema requirement; no behavior change implied by setting it. Our existing user environment confirms every working server has a `type` field (sentry: `type: "http"`, github/stripe: `type: "stdio"`, codebase-memory-mcp: `type: "stdio"`). The auto-inject's shape now matches the canonical pattern.

**Consequences:** First IDE startup post-53h overwrites `.mcp.json` with the new shape. Existing entries (if user-managed) are preserved; only `ouroboros` is touched.

---

## Decision 2: SSE endpoint URL uses sessionId query param matching the SDK reference

**Context:** The MCP 2024-11-05 spec says the SSE first message must be `event: endpoint\ndata: <POST_URI>\n\n` but doesn't strictly require a sessionId. The official `@modelcontextprotocol/sdk` `SSEServerTransport.start()` includes `?sessionId=<UUID>` in the URL because the SDK *client* uses sessionId to associate POST messages with the SSE stream and route responses back. Wave 53f shipped a spec-compliant endpoint event but missed the sessionId.

**Pick:** Generate `randomUUID()` per SSE connection, include `?sessionId=<uuid>` in the endpoint URL, track active connections in a module-level `Map<sessionId, ServerResponse>`.

**Rationale:** Match the SDK reference exactly. Spec compliance is necessary but not sufficient when the de facto reference implementation requires a stricter contract; the SDK *is* the reference. Cleanup on close prevents the map from leaking memory.

**Consequences:** SSE connections are now stateful (server tracks sessionId → ServerResponse). The map is cleaned on `req.on('close')`. If the server crashes mid-flight, the map clears with the process — no persistent state leak. If a client drops without sending close, Node's HTTP layer eventually emits 'close' anyway.

---

## Decision 3: Dual-write JSON-RPC response (SSE event AND POST body)

**Context:** SDK clients read JSON-RPC responses from the SSE stream via `event: message`. Our existing curl-based smokes (and any non-SDK callers) read the response from the POST body. Three options: (A) SSE only — pure SDK behavior, breaks curl smokes; (B) body only — current behavior, breaks SDK clients; (C) dual-write — push via SSE if a matching connection exists, also return in body.

**Pick:** C — dual-write.

**Rationale:** SDK clients ignore the POST body (they look at the SSE stream); loose clients ignore the SSE event (they look at the body). Dual-write costs nothing functionally and maximises compat. The deviation from the strict SDK pattern (POST returns `200 + body` instead of `202 Accepted` empty) is minor — status code 200 is a successful response, the spec doesn't strictly require 202.

**Consequences:** If a future client refuses to talk to a server that returns body content on POST, we'd switch to 202 + empty body. For now, dual-write is the lower-risk choice. The Phase B smoke validates this.

---

## Decision 4: Keep hand-rolled implementation for now; track SDK migration as follow-up

**Context:** Across 53d / 53e / 53f / 53g / 53h we've fixed five distinct bugs in our hand-rolled MCP server, each surfaced by a smoke against the SDK client. The pattern is: every fix matches what the SDK does, just done by hand. The natural endpoint is "use the SDK and stop hand-rolling."

**Pick:** Keep hand-rolled for 53h. Track SDK replacement as an out-of-wave follow-up.

**Rationale:** 53h's tactical patch is ~94 lines of net change with full test coverage. Replacing with `@modelcontextprotocol/sdk SSEServerTransport` would be a ~200-line refactor plus a new dependency, and would still need the same Phase B smoke to validate. If 53h's smoke passes, we have working tools and a clear follow-up; if 53h fails, we know exactly what wire-format detail is wrong and the SDK migration is then justified by evidence rather than speculation.

**Consequences:** The internalMcpServer.ts handler stays in our codebase, drifts from SDK changes over time. A future MCP spec evolution (Streamable HTTP graduating to required, etc.) could break us again. Replacement wave is filed; we'd take it on if 53h's smoke shows lingering wire-format issues, or proactively if we hit a third spec-compat issue.

---

## Decision 5 (PENDING SMOKE): Wave 54 verdict

**Context:** Same as Waves 53e/53f/53g — the wave's plan said Phase B would deliver the Wave 54 verdict based on an adoption observation in a fresh Claude Code session post-fix.

**Status:** PENDING. Phase B's smoke runs from a fresh Claude Code session post-restart. Outcome resolves Wave 53d's Decision 9 as Greenlit / Redesigned / Retired. The decision belongs in Wave 53d's ADR; this is the fifth wave to defer to it.