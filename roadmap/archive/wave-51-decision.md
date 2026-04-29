# Wave 51 — Transport Decision

Authored 2026-04-27 as Phase A of Wave 51. No code written this phase — this is a paper spike grounded in a full read of both subsystems.

## Background

CodeMode's MCP client (`src/main/codemode/mcpClient.ts`) is stdio-only: when an upstream `McpServerConfig` carries a `url` field, `getCommand()` literally throws `new Error('SSE transport not yet implemented')` at `mcpClient.ts:107`. internalMcp publishes itself as `{mcpServers: {ouroboros: {url: 'http://127.0.0.1:<port>/sse'}}}` (`internalMcpAutoInject.ts:96`), so CodeMode's proxy cannot connect to it even when both subsystems are running. This gap is documented as the long-standing gotcha at `src/main/codemode/CLAUDE.md:62` ("SSE transport not implemented — `McpServerConfig.url` is parsed but never used"). Wave 51 closes that gap; Phase A picks which side moves.

## Option 1 — SSE transport in CodeMode's mcpClient

### Sketch

CodeMode's `connectUpstream()` today is a single linear function that spawns a child process, attaches stdout/stderr, and returns an `UpstreamServer` whose `callTool` and `dispose` close over the child's stdin and pending-request map (`mcpClient.ts:262-282`). To accept SSE, the file must split into two transport branches sharing the JSON-RPC plumbing.

Pseudocode-level diff:

- **Add a transport switch in `connectUpstream(name, config)`** — if `config.url` is set, take the SSE path; otherwise keep the current stdio path. The shared layer is the `pending: Map<number, PendingRequest>` request bookkeeping, `makeRequest` / `makeNotification` builders, and `initializeUpstream` / `listTools` (which only depend on a `SendRequest` callback). All of that is already transport-agnostic — good news for refactor cost.
- **Remove the throw at `mcpClient.ts:107`** and turn `getCommand` into a discriminator that the caller uses to branch.
- **New module `mcpClientSse.ts`** (or an inlined `connectUpstreamSse` helper to avoid extending `mcpClient.ts` past the 300-line ESLint cap — currently 282 lines, headroom is thin) that:
  - Issues `GET <url>` with `Accept: text/event-stream`. Parses the response stream as SSE frames (`data:` lines, blank-line terminators, drop `:` heartbeats).
  - The current internalMcp SSE shape (`internalMcpServer.ts:44-67`) does NOT advertise a separate POST endpoint via the `endpoint` event — it just streams `notifications/initialized` and heartbeats. The protocol it implements is closer to "SSE-as-keepalive + sibling POST `/message`" than the spec's strict `endpoint` handshake. The CodeMode SSE client would therefore need to **derive the POST URL from the SSE URL** (replace `/sse` with `/message`) or read it from the proxy config — a small protocol shortcut that has to be encoded explicitly.
  - For each outgoing JSON-RPC request: `fetch(POST_URL, { method: 'POST', body: JSON.stringify(rpc) })`. internalMcp answers POSTs with the JSON-RPC response inline in the HTTP body (`internalMcpServer.ts:165-173`), so we resolve `pending.get(id)` from the POST response — we do NOT need to correlate via SSE event-stream IDs. This is a deviation from spec-compliant MCP-over-SSE (which expects responses to come back over the SSE channel) but matches what internalMcp actually serves today.
  - For incoming `notifications/initialized` and heartbeats from SSE: parse and ignore (or log).
  - Lifecycle: `dispose()` aborts the SSE `Response.body` reader and rejects pending POSTs.
- **No change to `proxyServer.ts`.** It already calls `connectUpstream(name, serverConfig)` in `connectServerEntry()` (`proxyServer.ts:222-228`); the discriminator lives below it.
- **Type-generation path is identical** — `tools/list` returns the same shape over both transports, so `typeGenerator.ts` requires zero changes.

A spec-compliant SSE client (handshake `endpoint` event, POST/SSE response correlation, reconnection with `Last-Event-ID`) is a much larger surface. The shortcut above is justified because internalMcp is the only known SSE consumer in this codebase (see "SSE-elsewhere check" below) — but it does mean **the SSE client is internalMcp-shaped, not generically MCP-SSE-shaped**. If a third-party MCP server ever needs to be reached via SSE through CodeMode, this client will likely need a second pass.

### LOC estimate

| Surface | Impl | Tests | Total |
|---|---|---|---|
| `mcpClient.ts` (replace throw, add transport switch, extract shared bits) | ~30 | — | ~30 |
| `mcpClientSse.ts` (new — SSE reader, POST sender, lifecycle) | ~170 | — | ~170 |
| `mcpClientSse.test.ts` | — | ~180 | ~180 |
| `mcpClient.test.ts` (cover the discriminator, ensure stdio path untouched) | — | ~30 | ~30 |
| **Total** | ~200 | ~210 | **~410** |

### Risk surface

- **The existing stdio path is the dominant consumer of CodeMode** (every `~/.claude.json` MCP server is stdio today). Any refactor of `connectUpstream` must preserve the exact stdio behavior — handshake order, content-length framing, kill semantics. The split-into-two-transports refactor touches the file holding all CodeMode's known-good production code. Regression blast radius is **CodeMode-wide**.
- **Protocol shortcut.** We'd ship a non-spec MCP-over-SSE client (no `endpoint` event, response over POST instead of SSE). It works against internalMcp because internalMcp also takes the same shortcut. Future divergence (e.g. someone makes internalMcp spec-strict, or a real third-party SSE MCP server is added) breaks this client silently.
- **Connection lifecycle complexity.** The `fetch` SSE reader needs `AbortController` plumbing into `dispose()` to avoid leaked sockets when CodeMode is disabled mid-session. Less ergonomic than `child.kill()`.
- **`proxyServer.ts` line budget.** `proxyServer.ts` is 313 lines today — already over the 300-line ESLint limit (presumably exempt or grandfathered). Even though Option 1 doesn't modify it, it interacts with internalMcp via stdio in the same hot path.
- **No effect on internalMcp.** That's the upside: internalMcp keeps working unchanged for any future consumer.

### Test surface

- **Unit (easy):** Spin up a fake HTTP server in-process that mimics `internalMcpServer.ts` (SSE GET + POST `/message`), drive `connectUpstream` against it, assert tool list + tool call roundtrip + initialize handshake. Vitest can handle this with `http.createServer`.
- **Unit (hard):** Reconnection. If the SSE stream drops mid-session, what does CodeMode do? The current internalMcp SSE only carries heartbeats, so dropping it shouldn't lose state — but our test must cover that decision explicitly or it becomes a future surprise.
- **Integration:** End-to-end CodeMode → SSE → internalMcp → graph tool. Real but feasible: the proxy is a Node script, internalMcp runs in the test process, and `proxyServer.ts` reads its config from a file path.
- **No mock-the-stdio-spawn problem** — the existing stdio test (if any) keeps working because its code path is unchanged.

## Option 2 — stdio transport in internalMcp

### Sketch

internalMcp today is a single HTTP server: `startInternalMcpServer({ workspaceRoot, port })` listens on `127.0.0.1:<port>` and dispatches `GET /sse`, `POST /message`, `GET /health` (`internalMcpServer.ts:182-211`). The tool list comes from `getActiveTools()` (`internalMcpTools.ts:51`) which is **a pure function of the in-process graph state** — it reads `getGraphController()`, which only exists in the Electron main process.

This last point is the load-bearing constraint for Option 2. `getActiveTools()` cannot be served from a fresh `node` subprocess that doesn't have the codebase graph loaded. A stdio transport for internalMcp therefore has two viable shapes:

**Shape A — in-process stdio bridge (rejected).** Have internalMcp speak stdio over the main process's `process.stdin`/`process.stdout`. Impossible: those streams belong to Electron and must not be hijacked. Also, Claude Code spawns the MCP server itself; it does not pipe to the Electron parent.

**Shape B — subprocess wrapper that proxies into main (chosen for sketch).** Add a small standalone `internalMcpStdioTransport.ts` that is **launched by Claude Code as a child process** (the same way `proxyServer.ts` is launched). It speaks stdio JSON-RPC outward, and forwards every `tools/list` and `tools/call` to the Electron main process via a localhost loopback (HTTP, named pipe, or domain socket). The main process serves those requests using the same `dispatchRpcMethod` already in `internalMcpServer.ts`.

Pseudocode-level diff for Shape B:

- **`internalMcpAutoInject.ts`** — branch the injected entry by `transport`:
  - `'sse'` → `{url: 'http://127.0.0.1:<port>/sse'}` (today)
  - `'stdio'` → `{command: 'node', args: [<absPathToStdioTransport>, '--port', '<port>']}`
  - The stdio binary still needs the main-process port to call back through (because the graph lives in main). So Option 2 doesn't actually remove the HTTP server — it adds a stdio wrapper on top of it.
- **New file `internalMcpStdioTransport.ts`** (~130-160 lines):
  - Read `process.argv` for the main-process loopback port.
  - Open stdio with content-length framing (mirror of `mcpClient.ts`'s `parseMessages` / `encodeMessage`).
  - For each inbound JSON-RPC request, `fetch http://127.0.0.1:<port>/message` and pipe the response back to stdout.
  - Handle `initialize` locally (no need to round-trip).
  - Lifecycle: exit when stdin closes.
- **`internalMcpServer.ts`** — unchanged (still serves `/message` for the stdio wrapper to call).
- **`internalMcpTypes.ts`** — add `transport?: 'sse' | 'stdio'` to `InternalMcpServerOptions`.
- **`main.ts:95-117`** — read `internalMcp.transport` config, pass to `injectIntoProjectSettings`. The HTTP server is started either way (stdio wrapper needs it).
- **`typeGenerator.ts`** — unchanged. CodeMode's existing stdio client connects to the new stdio wrapper; no schema sourcing changes needed.

**Build artifact concern.** `internalMcpStdioTransport.ts` must be built as a standalone Node script (like `proxyServer.ts`) so Claude Code can run it directly. That requires an electron-vite entry plus a path resolver in `internalMcpAutoInject.ts` to find the built file. Non-trivial wiring, but `proxyServer.ts` already proves the pattern.

**Honest accounting.** Option 2 is a stdio adapter in front of the existing SSE server, not a true second transport. The graph still lives in main; the wrapper just translates stdio frames to localhost HTTP. The user-facing benefit is that CodeMode's existing stdio client connects without modification.

### LOC estimate

| Surface | Impl | Tests | Total |
|---|---|---|---|
| `internalMcpStdioTransport.ts` (new — stdio loop, HTTP forwarder, framing) | ~150 | — | ~150 |
| `internalMcpStdioTransport.test.ts` | — | ~180 | ~180 |
| `internalMcpAutoInject.ts` (transport branch) | ~50 | — | ~50 |
| `internalMcpAutoInject.test.ts` (delta) | — | ~40 | ~40 |
| `internalMcpTypes.ts` | ~5 | — | ~5 |
| `main.ts` (config plumbing) | ~15 | — | ~15 |
| Build wiring (electron.vite.config.ts entry for stdio binary) | ~10 | — | ~10 |
| `mcpClient.ts` | 0 | 0 | 0 |
| **Total** | ~230 | ~220 | **~450** |

### Risk surface

- **Existing SSE path stays.** Option 2 doesn't remove SSE — it adds stdio in front of it. Both transports have to be exercised in CI to prevent silent rot. Slight ongoing maintenance cost.
- **Two protocol hops per call.** stdio frame → HTTP request → in-process tool handler → HTTP response → stdio frame. Latency goes up vs direct SSE (which is one HTTP request). Probably ≤5ms on loopback, but worth measuring in Phase D.
- **Build complexity.** A new electron-vite entry for the stdio binary, plus a runtime path lookup in `internalMcpAutoInject.ts` (mirror of `codemodeManager.ts:156` `proxyServerPath` pattern). Wave 51 must not ship a binary that can't be located at runtime in production builds — a recurring failure mode for the CodeMode subsystem.
- **Subprocess lifecycle.** Claude Code spawns and kills the stdio wrapper. The wrapper holds an open HTTP connection to main. On Claude Code exit (SIGTERM → wrapper SIGTERM → wrapper closes HTTP request), the main-process HTTP handler must drain cleanly. internalMcp's HTTP handler today doesn't track outstanding requests for shutdown — minor exposure during Electron quit.
- **Tool-list parity.** SSE and stdio both call into the same `getActiveTools()`, so parity is structural — good. No drift risk.
- **CodeMode's stdio client is the production-hardened path.** Option 2 keeps it untouched. Zero blast radius on CodeMode.

### Test surface

- **Unit (easy):** Drive `internalMcpStdioTransport.ts` with mock stdin/stdout buffers and a fake main-process HTTP server. Assert request/response framing, initialize handling, error propagation.
- **Unit (medium):** Lifecycle — kill the wrapper mid-request, verify no hanging promises in main.
- **Integration:** Spawn the real wrapper as a child process in a test, connect via the existing `mcpClient.ts` stdio path, exercise `tools/call` end-to-end. Mirrors how Phase B's CodeMode integration test will run anyway.
- **Build test:** Verify the stdio binary is emitted by `npm run build` and located at the expected path. This is a recurring class of bug for the CodeMode subsystem; a smoke test is cheap insurance.

## Comparison

| Criterion | Option 1 (SSE in CodeMode) | Option 2 (stdio in internalMcp) |
|---|---|---|
| LOC (impl) | ~200 | ~230 |
| LOC (tests) | ~210 | ~220 |
| Blast radius on existing path | **CodeMode-wide** — stdio client refactored | **Zero on CodeMode** — internalMcp gains a wrapper |
| Test difficulty | Medium (in-process HTTP server) | Medium (subprocess lifecycle) |
| Crash recovery clarity | Mixed — SSE reconnect semantics undefined for current internalMcp | Clear — Claude Code already manages stdio child lifecycle |
| Future use cases | Adds a non-spec SSE client; future-third-party SSE MCP support is shaky | Establishes a stdio adapter pattern; future internalMcp consumers (in-IDE, future CodeMode v2) reuse it |
| Spec compliance | Cuts corners (no `endpoint` event, POST-response instead of SSE-response correlation) | Spec-clean MCP stdio + internal HTTP loopback |
| Build complexity | Zero new build entries | One new electron-vite entry |
| Latency impact | None (single HTTP request) | One extra hop (stdio → HTTP loopback); ≤5ms on localhost |

## SSE-elsewhere check

**Verified: internalMcp's SSE has zero consumers other than the Claude Code spawn.**

Method: grepped `src/` for `getInternalMcpUrl`, `internalMcpUrl`, `/sse`, `EventSource`, and `text/event-stream`.

- The only consumer of `getInternalMcpUrl()` is `src/main/orchestration/providers/scopedMcpConfig.ts:142`, which writes the URL into the spawn's per-task `.claude/settings.json`. That is the Claude Code spawn path.
- `text/event-stream` only appears in two places that **serve** SSE (`internalMcpServer.ts:46`, `mcpHost/mcpHostMain.ts:116`) — no client-side consumer.
- `EventSource` does not appear in `src/`. No browser, web-mode, or renderer code subscribes to internalMcp's SSE stream.
- `McpServerForm.tsx` mentions `/sse` only as a placeholder string in a user-facing form for adding *external* MCP servers — not a consumer of internalMcp.

**Implication:** if Option 2 wins, the SSE server can stay as a quietly-deprecated path or even be removed in a follow-up wave with no external impact. Both transports do not need to coexist for compatibility reasons; coexistence in Wave 51 is purely a "don't break yourself mid-refactor" choice.

## Decision

**Pick: Option 2 — stdio transport in internalMcp.**

### Rationale

1. **Blast radius asymmetry.** CodeMode's stdio client is the production-tested code path that every existing IDE spawn already depends on (in the small population of users who have CodeMode-style configs). internalMcp's SSE path is consumed by exactly one caller — the Claude Code spawn we are trying to redirect. Option 2 modifies the side with zero downstream consumers; Option 1 modifies the side with the most consumers. When the criteria are otherwise close, modify the side with less to lose.
2. **Spec cleanliness.** Option 1 ships a non-spec MCP-over-SSE client (no `endpoint` event, POST-response inline). It works only because internalMcp also cuts the same corner. Option 2 keeps both endpoints spec-clean (CodeMode stays standard MCP stdio; internalMcp stays standard MCP-over-HTTP-with-SSE).
3. **LOC + risk parity.** ~410 vs ~450 — within noise. Test surface is comparable. The differentiator is not size; it's *which file gets touched*.
4. **Future-proofing.** Option 2 establishes a stdio adapter pattern (`<server> + stdio wrapper subprocess`) that can extend to future in-IDE MCP servers without re-litigating the transport question. Option 1 builds an SSE client tailored to internalMcp's quirks that a future third-party SSE MCP server would expose.
5. **Plan tiebreaker.** Even at parity, the plan's tiebreaker rule explicitly defaults to Option 2 ("stdio in internalMcp — keeps CodeMode simple and matches the MCP ecosystem's stdio-first norm"). The rationale above is independent, but the tiebreaker confirms direction.

### Implementation outline for Phase B

Phase B reads this section first.

- **New file `src/main/internalMcp/internalMcpStdioTransport.ts`** (~150 lines)
  - `process.argv[2]` carries the main-process loopback port (passed in from `internalMcpAutoInject` via `args`).
  - Implement content-length framing (lift `parseMessages` / `encodeMessage` from `mcpClient.ts:46-99` — refactor into a shared util in `src/main/internalMcp/mcpFraming.ts` or duplicate, given that codemode's `mcpClient.ts` is sandboxed and shouldn't grow imports).
  - Handle `initialize` locally (no main-process round-trip needed; the response is static).
  - Forward `tools/list` and `tools/call` to `http://127.0.0.1:<port>/message` via `fetch`. Pipe the JSON response back as a stdio frame.
  - Log to stderr only (stdout is the wire).
  - Exit on stdin close.
- **Build wiring**
  - Add an electron-vite entry that emits `internalMcpStdioTransport.js` next to `proxyServer.js` so the runtime path lookup is symmetrical.
  - Mirror `codemodeManager.ts:156`'s `path.join(__dirname, 'proxyServer.js')` pattern for the runtime path resolution.
- **`src/main/internalMcp/internalMcpAutoInject.ts`** (~+50 lines)
  - Accept a `transport: 'sse' | 'stdio'` argument.
  - Branch the injected `mcpServers.ouroboros` entry shape: `{url: ...}` for sse, `{command: 'node', args: [<binPath>, String(serverPort)]}` for stdio.
  - Keep `removeFromProjectSettings` symmetrical — the cleanup deletes by key (`'ouroboros'`), so it works for both shapes without change.
- **`src/main/internalMcp/internalMcpTypes.ts`** (~+5 lines)
  - Add `transport?: 'sse' | 'stdio'` to `InternalMcpServerOptions`.
- **`src/main/main.ts:95-117`**
  - Read `getConfigValue('internalMcpTransport')` (or `internalMcp.transport`, depending on the config-schema namespace Phase B picks).
  - Default to `'sse'` initially (preserves current behavior). The flag flip to `'stdio'` is a Phase D / post-wave decision.
  - Pass through to `injectIntoProjectSettings`.
- **Config schema**
  - Add `internalMcp.transport` (or `internalMcpTransport`, matching the existing flat-key pattern at `internalMcpEnabled`) to `configSchemaTail.ts` or wherever internalMcp's keys live. Default `'sse'`.
- **CodeMode launch wiring (the other half of Phase B)**
  - Add `codemode.enabled` (default `false`) and `codemode.routeInternalMcp` (default `false`) to the config schema.
  - In `src/main/orchestration/providers/claudeCodeLaunch.ts`, read `codemode.enabled` and call `enableCodeMode(serverNames, scope, projectRoot)` from `codemodeManager.ts` before the spawn. Disable on exit.
  - The `serverNames` argument should include `'ouroboros'` when `internalMcp.transport === 'stdio'` AND `codemode.routeInternalMcp === true`. (Phase C formalizes this in a routing policy module; Phase B can hard-code it for the wiring smoke test.)

### Anything flagged but not changed

- **`proxyServer.ts` is 313 lines** — already over the 300-line ESLint cap. Either grandfathered or has a per-file disable I didn't grep for. Worth checking before Phase B grows it further.
- **`internalMcpServer.ts:217` and `internalMcpAutoInject.ts:78`** carry stale `@deprecated UNWIRED` JSDoc notices, even though `internalMcp/CLAUDE.md:8` explicitly says "Wired and active." `main.ts:113` confirms the wiring. Phase E should drop these notices when it touches CLAUDE.mds.
- **MCP-over-SSE protocol shortcut in internalMcp.** `internalMcpServer.ts` doesn't emit the spec's `endpoint` event on connection; it just streams `notifications/initialized` and heartbeats. This is fine for the current single in-house consumer but would surprise a spec-strict third-party MCP client. Out of Wave 51 scope but worth a comment in `internalMcp/CLAUDE.md`.
- **`mcpHost/mcpHostMain.ts` is a parallel SSE server** controlled by the `useMcpHost` config flag (`main.ts:102`). It implements the same SSE shape as `internalMcpServer.ts`. If Option 2 ships, the stdio transport must work for *both* HTTP servers (or the routing must be aware of which one is active). Phase B should pick a single path and confirm `useMcpHost` is treated consistently.
