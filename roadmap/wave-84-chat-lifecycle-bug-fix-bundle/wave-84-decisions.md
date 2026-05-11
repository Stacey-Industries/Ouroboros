# Wave 84 — Architecture Decision Record

Wave: Chat Lifecycle Bug-Fix Bundle
Status: LOCKED (transcribed from `waveplan-84.md` Locked decisions section during Phase 0, 2026-05-10)

---

## Decision 1: Bug-fix wave shape, not refactor

**Context:** Six chat-related follow-ups (five filed 2026-05-07, one filed 2026-05-06) share a thematic shape — post-start chat lifecycle state-management — but each has an independent surface and an independent fix. The wave could be framed as either (a) six minimal bug fixes or (b) a broader refactor of the chat-lifecycle state management code with the bugs as motivating examples.

**Pick:** Six minimal bug fixes; no bundled adjacent refactors.

**Rationale:** The wave's success metric is the verdict transitions in the 64-axis coverage matrix (PARTIAL → AHEAD/MATCHES), not "improve the chat code." The gap analysis at `roadmap/foundation/agent-chat-best-practices/00-summary.md` explicitly frames the ROI as bug closure, not refactor. A refactor wave would also expand risk surface beyond what manual smoke can verify in one Cole-time window.

**Consequences:** Each phase fixes one bug minimally. Adjacent code that "could be tidier" is left alone. The `AgentChatConversation.tsx` 1000+ line refactor, the `editQueuedMessage` rename, and other naming/structure improvements move to follow-up waves.

---

## Decision 2: Instrument-before-fix is mandatory for bugs 1, 2, 3, and 6

**Context:** Per `~/.claude/rules/debug-before-fix.md`, after a fix doesn't work on the first attempt, the next move is instrumentation, not another guess. Two of the wave's bugs (heat-map #6 and full-review #2) have already burned code-reading guesses; one (rules-disappear #1) has a strong hypothesis but no runtime evidence; one (streaming-freeze #3) has a strong hypothesis (rAF throttle on hidden documents) that needs evidence to confirm. Bug 5 has a fix shape already determined from gap analysis. Bug 4 is a 500 from the API — instrumentation is needed to capture request shape.

**Pick:** Bugs 1, 2, 3, 6 — first commit in their phase is `[trace:*] log.info` instrumentation; Cole runs the IDE; runtime log output gets shared back; only THEN does the fix commit land. Bug 5 skips instrumentation (fix shape is determined). Bug 4 follows the same instrument-first pattern but at the orchestration layer.

**Rationale:** Heat-map has already failed twice on code-reading. The `fix_cycle_detector` hook blocks edits after three consecutive failed verifications — pushing a third code-reading attempt would trip the circuit breaker. The discipline isn't optional.

**Consequences:** Each affected phase has two commits minimum (instrument + fix). Investigation-specific logs are removed at Phase Z per `debug-before-fix.md`'s Style section; baseline structural logs that aid future debugging stay. The auto-brief documents what was removed vs retained.

---

## Decision 3: Phase E implementer choice — default sonnet-implementer with auto-fork

**Context:** Bug 4 (subagent dispatch 500) is the most uncertain bug in the wave. The error text is captured (`API Error: Internal server error` mid-dispatch from IDE; works fine from terminal CLI), but reproducibility on demand is unknown. If reproducible, a single sonnet-implementer phase that captures the request shape, identifies the IDE-vs-terminal payload delta, and fixes the offending injection is the right shape. If not reproducible, the implementer would be coding from hypothesis without evidence — the failure mode this wave's rules explicitly fire against.

**Pick:** Default dispatch is `sonnet-implementer`. Phase 0's pre-flight live-confirms repro. If the bug fires on demand during Phase 0, Phase E proceeds as planned. If Phase 0 cannot reproduce after a reasonable repro window, Phase E auto-forks to `sonnet-diagnostician` for a passive-instrumentation phase, with the actual fix deferred to a follow-up wave. Phase 0's result-brief records which path was taken.

**Rationale:** Locked 2026-05-10 by Cole. The auto-fork preserves the wave's ship-five-bugs-even-if-bug-4-defers fallback without burning a fix attempt on hypothesis alone.

**Consequences:** Phase 0's repro pre-flight directly determines Phase E's implementer. If the fork fires, Wave 84 still ships v2.16.0 with five bugs closed and a `phase-e-diagnostic.md` artifact; Phase E's actual fix moves to a later wave once samples accumulate.

**Phase 0 outcome (2026-05-10):** Bug 4 **NOT reproducible on demand** — two test dispatches both succeeded. Cole's observations narrow the hypothesis space: CLI is clean with 3-5 concurrent sessions; IDE 500s correlate with multi-project IDE load; true repro recipe is long multi-tool chains (~15+ varied calls), not bulk-batch operations. **Auto-fork TRIGGERED — Phase E is now sonnet-diagnostician.** Two new hypotheses added beyond the original three: **H4** concurrent-session server-side pushback (strongest after Phase 0); **H5** subagent-spawn architecture (does each IDE chat's headless Claude Code child spawn a sub-process per subagent dispatch, or share one?). Phase E brief includes a research step against Anthropic API docs for concurrent-request limits before instrumentation. The wave still ships with four fixes (A, B, D, F) + the diagnostic artifact; the actual fix for bug 4 defers to a follow-up wave.

---

## Decision 4: Bug 5 (queue) fix shape is determined; no diagnostic phase

**Context:** The queued-message follow-up names a specific code-level smoking gun: `editQueuedMessage` at `useAgentChatWorkspace.queue.ts:56-65` calls `setDraft(item.content)` as a side-effect of removing the queued item, which causes the force-send path to repopulate the composer when "send" and "edit" share a call site. The gap analysis at lines 991-1009 spells out the fix shape: add a `forceSendQueuedMessage(id)` action that calls `deleteQueuedMessage` (NOT `editQueuedMessage`) + `sendMessage`; add a `useEffect` drain trigger.

**Pick:** Skip instrument-first. Implement the determined fix shape directly via haiku-implementer.

**Rationale:** The bug's mechanism is already understood from code reading. Instrumenting first would be ceremony without payoff — the fix shape would not change based on what the logs say. Haiku-implementer is the right tier because the work is mechanical (add an action, add a useEffect, rewire a button handler) with a tight contract.

**Consequences:** Phase F is the only phase without `[trace:*]` logging. Phase F's regression tests are the verification (no live observation gates Phase F; the smoke at Phase Z confirms).

---

## Decision 5: Per-phase commits, single push at wave wrap

**Context:** Per the user-memory push policy: subagents commit per phase locally; parent reviews aggregate diff and pushes once the wave is complete. Pushing per-phase risks shipping partial wave state if a later phase blocks or pivots.

**Pick:** Phase commits accumulate locally. One push at Phase Z after `/review` PASS and manual smoke signoff.

**Rationale:** Standard wave hygiene per the development pipeline. Avoids partial-wave releases.

**Consequences:** The orchestrator must not push between phases. Tag and CHANGELOG happen at Phase Z, not per-phase. If Phase E forks to diagnostician, the wave still ships at Phase Z with the diagnostician's artifact in place of the fix.

---

## Decision 6: No mention-types or system-prompt-visibility work in this wave

**Context:** The 64-axis gap analysis flags two adjacent clusters: mention-types (#8 `@url`, #9 `@web`, #10 `@thread`, #12 `@diff`/`@commit`, #38 file-tree "open in chat") and system-prompt-visibility (#21). Both share surface area with the chat code this wave touches; the temptation to bundle them is real, especially mid-phase when an implementer notices "while we're here..."

**Pick:** Hard out-of-scope. Mention-types is sized for a separate follow-up wave per the gap analysis at lines 1115-1121. System-prompt-visibility is a separate scoping decision pending Cole's call.

**Rationale:** Tier-3 scope creep is the single most common failure mode of bug-fix bundle waves. The wave's metric is the verdict transitions, not "improve the chat code." Bundling adjacent work expands the manual smoke surface beyond one Cole-time window.

**Consequences:** If an implementer surfaces a clean fix opportunity for a mention-type bug mid-phase, the orchestrator files it as a follow-up (per the development pipeline Tier-3 path) and keeps the planned scope intact.

---
