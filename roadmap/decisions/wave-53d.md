# Wave 53d — Architecture Decision Record

**Status:** Decisions 1–8 resolved at wave close. Decision 9 (Wave 54 verdict) deferred to user-driven post-restart smoke; finalized when the user appends adoption observations to `roadmap/wave-53d-live-test.md`.

This wave fixes wiring on existing infrastructure rather than introducing new architecture. Most decisions will be tactical (which lifecycle hook owns the auto-inject, when to re-run it). The big-shape decision is a Wave 54 status pivot at Phase E based on Phase D's live-test observations.

---

## Decision 1: Wave-numbering as `53d` rather than reopening Wave 54

**Context:** Wave 53c found the corpus analysis was right but the verdict was wrong because of the 0% adoption gap (ADR Decision 11 in `wave-53c.md`). Two naming options for the fix wave: number it as Wave 54's Phase 0, or as a new wave 53d.

**Pick:** `53d`.

**Rationale:** Wave 54's plan is about TS semantic operations / tsserver embedding. The adoption fix is unrelated to tsserver; it touches `internalMcp` lifecycle. Folding it into Wave 54 would mix concerns and dilute that wave's focus. `53d` continues the lineage convention from 53/53a/53b/53c (telemetry + corpus + adoption — all measurement-and-wiring work) cleanly.

**Consequences:** Wave 54 stays in `roadmap/wave-54-plan.md` with status BLOCKED on this wave's outcome. After Phase E, Wave 54 transitions to one of three states (Greenlit / Redesigned / Retired) and that's the natural next decision point.

---

## Decision 2: Phase B is read-only diagnosis, Phase C is the fix — split intentional

**Context:** Could fold diagnosis + fix into one phase. Or split. Per `~/.claude/rules/debug-before-fix.md`, the project's standing rule is "after a fix doesn't work on the first attempt, STOP proposing code changes and add debug logging instead." Even before a first attempt, the spirit applies: code-reading diagnosis often produces wrong fixes for lifecycle bugs.

**Pick:** Split. Phase B is read-only investigation by `sonnet-diagnostician`; Phase C is the implementer working from B's root-cause document.

**Rationale:** Lifecycle bugs (especially "this thing got removed when something else closed") are the canonical case where code-reading is unreliable. The diagnostician is allowed to honestly surface "needs runtime instrumentation" rather than guess; the implementer's brief comes from a grounded document, not a hypothesis.

**Consequences:** Phase C's exact files-modified list cannot be specified in this plan up front — it depends on Phase B's output. The plan's Phase C section is a placeholder and will be filled in once the diagnostic lands. Risk: Phase B reveals the issue is in Claude Code (the consumer) not the IDE — in which case Phase C reframes as "instrument or work around upstream behavior."

---

## Decision 3: Phase A keeps the rule and adds fallback awareness, rather than rewriting it

**Context:** The earlier diagnostic claim ("the rule's tool names don't match reality") was wrong on closer inspection. The rule's names match the graph-healthy tool surface in `mcpToolHandlers.ts`. The fallback surface in `internalMcpToolsGraph.ts` has different names, but that's a degraded state.

**Pick:** Keep the rule's existing healthy-graph names; add a section that documents the degraded-fallback names and the condition that activates them.

**Rationale:** The original rule is correct for the path that should be active 99%+ of the time. Rewriting would lose institutional knowledge encoded in the routing table. Adding fallback awareness is a strict superset: agents in healthy-graph contexts continue using the canonical names; agents in degraded contexts know what they have.

**Consequences:** The rule grows by ~10–15 lines. If the IDE later unifies the two tool surfaces (one canonical name set regardless of graph health), the fallback section retires. Tracking that unification is out-of-wave; if it happens, a future wave updates the rule.

---

## Decision 4: External terminal scope = "IDE running, terminal external" only (Flavor A)

**Context:** "External terminal access" can mean two things — (A) terminal Claude Code session in the project dir, IDE running in the background; (B) fully standalone, IDE off, terminal still has graph tools.

**Pick:** Flavor A only this wave. Flavor B is documented as out-of-wave.

**Rationale:** Flavor A is what `internalMcpStdioTransport.ts` (Wave 51) already enables. The wave's job is to make it actually work, not to extract a new server. Flavor B requires moving the codebase graph + MCP server out of `src/main/` into a standalone Node process — wave-sized refactor. Demand is unproven; testing the fix in Flavor A will reveal whether Flavor B is actually wanted.

**Consequences:** External-terminal users without the IDE running get nothing this wave. If Phase D shows Flavor A works well and the user wants always-on access, a Flavor B wave is sketched in Out-of-wave Follow-ups.

---

## Decision 5: Live test in Phase D is qualitative, not metric-driven

**Context:** Wave 53c's verdict was metric-driven (T1/T2/T3 thresholds) and the metrics were misread. Phase D could either (a) wait for new corpus accumulation post-fix and run the analyzer again, or (b) qualitatively observe a few sessions and make a judgment call.

**Pick:** Qualitative this wave. Real measurement waits for accumulated post-fix sessions.

**Rationale:** A new corpus run requires weeks of accumulated sessions to be statistically meaningful. Holding the wave open that long would be a deferral pattern that 53c specifically tried to break. Qualitative observation in Phase D answers the most important question — "do the tools reach the agent at all, and does it use them when they're available?" — quickly and honestly. The follow-up adoption-telemetry signal (out-of-wave) gives durable measurement without blocking this wave.

**Consequences:** Phase D's report is judgment + observation, not a number. Wave 54's verdict at Phase E is therefore also a judgment call. If a future wave wants stronger evidence before greenlighting, it can wait for the telemetry signal to mature; this wave doesn't try to settle the question forever.

---

## Decision 6: Root cause — `stopInternalMcp` calls `removeFromProjectSettings` unconditionally on shutdown

**Context:** Phase B (`roadmap/wave-53d-diagnostic.md`, commit `edfd6e0`) traced all call sites of `injectIntoProjectSettings` and `removeFromProjectSettings`. The latter has exactly one call site at `src/main/main.ts:130` inside `stopInternalMcp()`, which is invoked from the `window-all-closed` handler at `main.ts:299`. Every clean IDE shutdown wipes the `mcpServers.ouroboros` entry from `.claude/settings.json`. The startup auto-inject correctly upserts on every launch, so stale entries between launches are not a problem — the next launch overwrites with the current port.

**Pick:** Confirm Hypothesis 1 from the plan: cleanup-on-shutdown is over-aggressive. All four other hypotheses refuted by code reading + live runtime checks (electron-store value `internalMcpEnabled: true` confirmed at `C:\Users\coles\AppData\Roaming\ouroboros\config.json:1306`).

**Rationale:** The diagnostician had specific evidence with file:line citations for each call site. No multi-window race (one MCP server per process), no port-collision (port: 0 always finds a free port), no flag-disabled state. The single load-bearing call is the unconditional cleanup.

**Consequences:** Phase C's scope is small and surgical — remove the call. The `removeFromProjectSettings` function itself remains exported and tested; it has legitimate uses (manual cleanup, future UI toggle) — it just must not be wired into shutdown.

---

## Decision 7: Phase C fix shape — remove the call, document why, add a contract test

**Context:** Two ways to add the regression test (Option 1 — unit test on `stopInternalMcp` requires exporting it from `main.ts`; Option 2 — contract test on `internalMcpAutoInject` documents the invariant).

**Pick:** Option 2.

**Rationale:** `stopInternalMcp` is a private function in `main.ts` — exporting it would either add a test-only export (slight surface pollution) or extract a new module (touches more files than warranted by a one-line bug fix). The contract test on `injectIntoProjectSettings` + `removeFromProjectSettings` directly documents the invariant a future reader needs to honor: "remove must not be called on shutdown — here's why" — and will catch any regression where someone re-adds the call (since the test asserts both correct and destructive states explicitly).

**Consequences:** The new test file `src/main/internalMcp/internalMcpShutdownContract.test.ts` (93 lines, 3 cases) is the regression seam. Reviewers diffing future shutdown changes see the contract test break and understand why before merging. The trade-off accepted: the test does not directly prove `stopInternalMcp` doesn't call remove — it proves what would happen if remove were called. A future reviewer with a stale memory could in principle re-add the call and the test would still pass. Mitigation: the explanatory comment in `stopInternalMcp` itself points at this wave and the rationale, which is the strongest signal at the actual call site.

---

## Decision 8: Phase D is intentionally partial — verification deferred to user-driven post-restart smoke

**Context:** Phase D's plan included "restart the IDE" as step 1, followed by live verification and workflow tests. Restarting the IDE ends the orchestrating Claude Code session. So Phase D in the same orchestration session is structurally limited to "capture pre-restart state" and "document the manual checklist."

**Pick:** Phase D delivers the partial-Phase-D doc (`roadmap/wave-53d-live-test.md`) with two halves: pre-restart evidence (settings.json clean, no listening port, no electron process — confirms the bug is observable) and a post-restart manual checklist for the user. Live workflow observations get appended by the user after the next IDE launch.

**Rationale:** Forcing the live verification into the orchestration session would either (a) require a different orchestration model (dispatch-and-wait through an IDE relaunch, which is not how Claude Code subagent dispatch works) or (b) require running in a fresh post-restart session (which loses orchestration context and would need a re-handoff). Option (b) is what naturally happens when the user runs the post-restart smoke; the wave's wrap-up makes this explicit rather than hiding the gap.

**Consequences:** Wave 53d's wrap-up ships with Phase D documented as partial. The Wave 54 verdict (Decision 9 below) cannot be finalized in this wave — it depends on adoption observations the user will record post-restart. The plan calls this out as the "qualitative not metric-driven" deliverable per Decision 5.

---

## Decision 9: Wave 54 stays PAUSED — second runtime bug surfaced by the smoke

**Context:** The orchestrator ran the post-restart smoke (2026-04-28, immediately after v2.7.5 shipped). Server is reachable, auto-inject lifecycle is fixed, 14 graph tools are registered and enumerable via JSON-RPC. **But every tool fails at runtime** with `"Cannot read properties of undefined (reading '<methodName>')"` — the handler closures captured a broken `GraphToolContext` at tool-registration time. Likely cause: a startup-order race where the internalMcp server registers tools before the graph controller has finished initializing, or `getGraphToolContext()` returns a partially-initialized stub that's truthy enough to choose the graph-tools path but missing its inner service references.

**Pick:** Wave 54 stays **PAUSED**. Wave 54's adoption gating cannot be evaluated while the existing graph tools return errors on every call.

**Rationale:** The corpus's 0% adoption finding now has a clearer explanation than "agent ignores tools." Agents that received tools (via either file-injection or per-spawn `--mcp-config`) got errors back from every call. After enough error returns the agent learns to default to Grep/Read. Wave 53d closed the lifecycle hole — Wave 54 cannot run until the runtime hole is closed too.

This is *not* a third "two paths" finding from Phase B re-emerging — it's a third issue layer. Phase B identified the auto-inject lifecycle (file-injection path) as broken. Phase B also flagged that the per-spawn `--mcp-config` path was "intact." This smoke shows that even the intact-by-existence path was returning broken tools. The runtime context wiring is broken regardless of which injection path delivered the tools.

**Consequences:**

- A new wave (Wave 53e — graph-context runtime wiring) is the prerequisite to Wave 54. Scope: diagnose why `GraphToolContext` is incomplete at registration time, fix it (likely either delay tool registration until graph is ready, or capture context lazily per-call rather than at closure formation, or have `getGraphToolContext()` strictly return null until the graph is fully initialized so the fallback path is correctly chosen).
- Wave 54's plan stays in `roadmap/wave-54-plan.md` with status BLOCKED. Blocker now reads: **Wave 53e graph-context runtime wiring fix.**
- The "tools registered but errors at call time" pattern is exactly the kind of bug that `~/.claude/rules/debug-before-fix.md` was written for — instrumenting `getActiveTools()` and `createGraphMcpTools(context)` to log when each is called and what `context` contains will pin down the race / partial-init.
- The smoke artifact (`roadmap/wave-53d-live-test.md`) is the durable evidence — JSON-RPC outputs preserved with exact error messages so Wave 53e's diagnostician can reproduce without re-running the smoke.

**Decision 9 finalized:** Wave 54 = PAUSED on Wave 53e. Wave 53e to be opened next.