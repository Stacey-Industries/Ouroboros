# Wave 51 — Architectural Decisions

CodeMode ⇄ internalMcp Integration. Backfilled retrospectively after Wave 53a introduced the ADR convention.

## Decision 1: transport bridge — stdio in internalMcp vs SSE in CodeMode

**Context:** CodeMode's MCP client is stdio-only; internalMcp serves SSE. The two highest-leverage MCP optimization mechanisms can't talk to each other. Two options to fix it.

**Options considered:**
- *Industry standard (stdio everywhere):* convert internalMcp to also speak stdio. Spec-clean MCP-over-stdio.
- *Custom (SSE in CodeMode):* add SSE support to CodeMode's `mcpClient.ts`. internalMcp unchanged.

**Pick:** stdio in internalMcp — industry standard.

**Rationale:** Verified during paper-spike: internalMcp's SSE has zero non-Claude-Code consumers (no `EventSource` anywhere in renderer or external clients). Modifying internalMcp's transport has near-zero blast radius. Modifying CodeMode's stdio client would touch the production-tested path every IDE spawn depends on. LOC was within noise (~410 vs ~450); blast radius drove the call.

**Consequences:** internalMcp gains a stdio subprocess that forwards JSON-RPC to its existing HTTP `/message` endpoint. SSE remains for backward compat. CodeMode's stdio client untouched.

---

## Decision 2: paper spike vs real spike for the transport call

**Context:** Original plan called for implementing both options in throwaway worktrees, measuring time-to-first-tool-call, and picking. Heavy.

**Pick:** Paper spike — read both files, sketch each option's diff, estimate LOC + risk, decide. No code written in Phase A.

**Rationale:** The relevant signal (complexity, blast radius, test surface) is visible from careful code reading. Building two real implementations of MCP transport for a single decision is wasted work. Modern engineering practice for "which of these two well-understood approaches" decisions is paper analysis; real spikes are for novel territory.

**Consequences:** Faster decision, no throwaway code waste. The paper spike doc (`roadmap/wave-51-decision.md`) is itself the deliverable that informed Phase B.

---

## Decision 3: per-spawn routing policy as pure module

**Context:** The decision matrix (direct-inject / route-through-codemode / omit) needs to be testable in isolation and consumed by `scopedMcpConfig.ts`.

**Pick:** Pure decision module (`internalMcpRoutingPolicy.ts`) — takes inputs, returns decision. No I/O, no side effects.

**Rationale:** Industry standard for policy-as-code: pure functions are unit-testable across the matrix without mocking. Consumers handle the side effects (file writes, codemode acquire/release).

**Consequences:** 95-line decision module, 217-line test covering full matrix. Easy to extend when new routing dimensions surface.

---

## Decision 4: `route-through-codemode` requires `transport === 'stdio'`

**Context:** CodeMode's `mcpClient.ts` is stdio-only by Phase A's decision. If `routeInternalMcp` is true but transport is SSE, the proxy would throw on the SSE URL.

**Pick:** Add a guard. `route-through-codemode` requires `transport === 'stdio'`. Otherwise fall through to `direct-inject`.

**Rationale:** Defensive consistency. The guard prevents a configuration combination that would fail at runtime. Documented in the policy module's header comment so future refactors don't lose it.

**Consequences:** Constraint on user config: `codemode.routeInternalMcp=true` + `internalMcp.transport=sse` silently downgrades. Documented; user has clear guidance on which combinations work.

---

## Decision 5: telemetry deferred (no in-session soak)

**Context:** Original plan baked in "1 week with flag off, 1 week with flag on" inside the wave. That can't fit in one orchestration session.

**Pick:** Ship telemetry + flag + rollup script. Defer the actual soak/flip decision to user-driven follow-up.

**Rationale:** Industry standard for measurement-driven flag flips: ship the measurement, let it run in real time, decide later. Forcing a literal week-long delay inside a wave is process theater.

**Consequences:** Wave closes with the data infrastructure in place but no flag-flip recommendation. Documented in `roadmap/session-handoff.md` as a post-wave follow-up.
