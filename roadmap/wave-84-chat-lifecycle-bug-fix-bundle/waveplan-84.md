# Wave 84 — Chat Lifecycle Bug-Fix Bundle

## Status

**CLOSED 2026-05-11** · v2.16.0 tag **HELD** (do not release until chat-orchestration overhaul lands) · drafted 2026-05-08 · Phase 0 complete 2026-05-10 · closure decision 2026-05-11.

### Why closed here, not at full plan completion

The wave's bug-by-bug framing didn't fit the actual problem shape. Across Phases A, B, D, F:

- Each fix surfaced 1-2 adjacent issues not in the original brief.
- Hypotheses were wrong twice in Phase A, completely wrong in Phase B, and disproven in Phase D.
- New follow-ups filed mid-wave outnumber the wave's original six bugs.

The pattern is consistent with **state-architecture leakage**, not six independent bugs. A separate discovery initiative (`roadmap/follow-ups/2026-05-11-chat-state-architecture-overhaul.md`) replaces the remaining work.

### What shipped

| Bug | Status | Commit |
|---|---|---|
| 1 (rules disappear) | **FIXED** | `092c9e98` + `821435c1` |
| 2 (Full Review pane empty) | **NOT REPRODUCIBLE** (dropped Phase 0) | likely fixed by Wave 82.1 / Wave 85 |
| 3 (streaming freeze) | **DEFERRED** — hypothesis disproven; corrected repro recipe documented | follow-up: `2026-05-11-chat-streaming-render-freeze-hypothesis-disproven.md` |
| 4 (subagent 500) | **DEFERRED** — not reproducible on demand, auto-forked to diagnostician at Phase 0 | follow-up: pending Phase E diagnostic (~1 week of passive instrumentation) |
| 5 (queue auto-send draft) | **FIXED** (Phase F, code only — not smoked) | `f87559be` |
| 6 (heat-map) | **FIXED** | `a2f09251` + `61977bed` |

### Wave artifacts to inherit

The instrumentation from Phases A, B, and D is **retained in the codebase** as a deliberate exception to Phase Z's normal "remove investigation logs" step. Reason: the chat-orchestration overhaul initiative (next) will need this same instrumentation to do its discovery work. Phase Z's retain-vs-remove decision is deferred to after the overhaul plan lands.

Phase 0 result-brief: `phase-0-results.md` (sibling). Net scope post-repro was: 4 fixes (A, B, D, F) + 1 diagnostic artifact (E). Phase C dropped — bug 2 not reproducible on current `master`.

## Context — why this wave exists

Six chat-related bugs filed across 2026-05-06 and 2026-05-07 share a single thematic shape: **post-start chat lifecycle state-management**. State transitions on session start, project switch, and agent completion all surface bugs. The bugs are individually small but collectively undermine four AHEAD verdicts that the just-completed gap analysis identifies as Ouroboros's distinctive strengths (transparency popover, per-rule disable, memory inline preview, file-tree heat-map).

The strategic finding from `roadmap/foundation/agent-chat-best-practices/00-summary.md` (lines 22-23): *"Ouroboros is feature-complete at the architectural level but carries quality debt as PARTIAL bugs. Fixing the existing bugs is higher ROI than building new features — the AHEAD count would grow from 11 to 17+ if four already-filed bugs were closed, without writing a single line of new feature code."*

The six bugs in scope:
1. `roadmap/follow-ups/2026-05-07-context-preview-rules-disappear-after-chat-start.md` — User and Project rules vanish from the context preview popover above the composer once a chat starts. Hides 4 AHEAD axes (#19, #20, #33, #35).
2. `roadmap/follow-ups/2026-05-07-full-review-artifact-pane-empty.md` — Clicking "Full Review" opens the artifact pane but renders nothing. Hides #42.
3. `roadmap/follow-ups/2026-05-07-chat-streaming-freezes-on-project-switch.md` — Multi-window chat: streaming UI freezes when window loses focus. Strongest hypothesis: rAF throttle on hidden documents. Hides #47.
4. `roadmap/follow-ups/2026-05-07-subagent-dispatch-fails-inside-ide-chat.md` — Agent tool dispatch errors with "API Error: Internal server error" (500) inside the IDE chat; works fine in the terminal CLI. Hides #28.
5. `roadmap/follow-ups/2026-05-07-queued-message-no-autosend-and-text-reappears.md` — Queue auto-send is not implemented; force-send leaves text in the composer because `editQueuedMessage` calls `setDraft` as a side-effect.
6. `roadmap/follow-ups/2026-05-06-file-heat-map-still-broken.md` — File-tree heat-map after agent edits doesn't render colored borders; two prior code-reading fixes failed; instrumentation now mandatory per `~/.claude/rules/debug-before-fix.md`. Hides #37, #40 — both of which are field-wide rare per the matrix.

All six are status `OPEN`, no active wave assigned. Per the gap-analysis numeric prediction at `04-ouroboros-gap-analysis.md` lines 1184-1190, closing them drops PARTIAL count from 9 to 3 and grows AHEAD from 11 to 17.

The wave deliberately excludes Cypher engine quality work (split into Wave 84a as a smaller follow-up) and the mention-types cluster (#8, #9, #10, #12, #38) which is sized for a separate follow-up wave per the gap analysis.

## Goal

Six chat lifecycle bugs are closed end-to-end, each verified at a Cole-observable surface in a live IDE session. The PARTIAL count in the 64-axis coverage matrix drops from 9 to 3; the AHEAD count grows from 11 to 17. Each follow-up file is updated to status `RESOLVED` with the commit SHA cited; the gap analysis's per-axis verdict cells are recomputed.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/wave-84-decisions.md`.

1. **Bug-fix wave shape, not refactor.** Each phase fixes one bug minimally; no bundled adjacent refactors. The PARTIAL → AHEAD/MATCHES verdict transitions are the wave's success metric, not "improve the chat code."
2. **Instrument-before-fix is mandatory** for bugs 1, 2, 3, and 6. Per `~/.claude/rules/debug-before-fix.md`, two of these (heat-map, full-review) have already burned code-reading guesses. The first commit of each affected phase is `[trace:*] log.info` instrumentation; the user runs the IDE; the runtime log output gets shared back; only then does the fix commit land.
3. **Bug 4 (subagent 500) Phase E implementer choice — LOCKED 2026-05-10.** Default dispatch is `sonnet-implementer` with captured error text + log instrumentation in one phase. Phase 0's pre-flight live-confirms repro; if the bug fires on demand, Phase E proceeds as planned. If Phase 0 cannot reproduce after a reasonable repro window, Phase E auto-forks to `sonnet-diagnostician` for a passive-instrumentation phase, with the actual fix deferred to a follow-up wave. Phase 0's result-brief records which path was taken.
4. **Bug 5 (queue) fix shape is determined; no diagnostic phase.** Per the gap analysis lines 991-1009: add `forceSendQueuedMessage(id)` action that calls `deleteQueuedMessage` (NOT `editQueuedMessage`) + `sendMessage`; add a `useEffect` drain trigger in `useAgentChatWorkspace.ts`; rewire force-send button to the new action. Haiku-implementer-friendly.
5. **Per-phase commits, single push at wave wrap** per the user-memory entry on push policy. Phase commits accumulate locally; one push at Phase Z after `/review` PASS.
6. **No mention-types or system-prompt-visibility work in this wave.** The mention-types cluster (#8, #9, #10, #12, #38) and system prompt visibility (#21) are sized for follow-up waves per the gap analysis. Resist Tier-3 scope creep per the development pipeline.

## Scope

**In scope:**

- Fix bug 1 — context preview rules-disappear (`useActiveSessionRulesAndSkills*`, `useFilesystemDisabledRuleIds*`, `ContextPreview.popover.tsx`).
- Fix bug 2 — Full Review artifact pane empty (`ChangeSummaryBar.tsx`, `ChatWorkbenchArtifactPane.tsx`, `WorkbenchRightPane.tsx`, `AgentChatDiffReview.tsx`, `useDiffReview.ts`).
- Fix bug 3 — chat streaming freezes on project switch (`useRafBatchedChunks.ts`, `useAgentChatStreaming.ts`).
- Fix bug 4 — subagent dispatch 500 in IDE chat (`claudeCodeSubagentHandler.ts`, `scopedMcpConfig.ts`, `chatOrchestrationBridge*`).
- Fix bug 5 — queued message no autosend + force-send leaves draft (`useAgentChatWorkspace.queue.ts`, `agentChatWorkspaceActions.ts`, `useAgentChatWorkspace.ts`, `AgentChatConversation.tsx`).
- Fix bug 6 — file-tree heat-map (`useFileHeatMap.ts`, `FileTree.tsx`, file-tree row component).
- Per-bug regression test (vitest) where the test seam exists.
- Update each follow-up file to `status: RESOLVED` with commit SHA when each fix lands.
- Recompute the verdict cells in `04-ouroboros-gap-analysis.md` to reflect the predicted PARTIAL → AHEAD/MATCHES transitions; update the numeric verdict-distribution table.
- Wave wrap: full lint, typecheck, scoped vitest on touched paths, full vitest at push-time, `/review` mechanical gap-check, signed manual-smoke-gate (UI-bearing wave).

**Out of scope:**

- Cypher engine quality (deferred to Wave 84a — `MATCH (p:Project)-[...]->(child)` hop fix).
- Mention-types cluster (#8 `@url`, #9 `@web`, #10 `@thread`, #12 `@diff`/`@commit`, #38 file-tree "open in chat") — sized for the next wave per the gap analysis at lines 1115-1121.
- System prompt visibility (#21) — separate scoping decision; Cole's call.
- Per-hunk accept/reject in diff review (#43) — medium-high effort, separate wave (selective `git apply` integration).
- Refactor of `AgentChatConversation.tsx` 1000+ line file — known tech debt in `AgentChat/CLAUDE.md:75`; address separately.
- Renaming `editQueuedMessage` to `promoteQueuedMessageToDraft` — naming improvement noted in gap analysis line 1009 but outside the fix scope.
- Markdown preview in composer (#5) — field-wide absent; closes no competitive gap per gap analysis line 60.

## Phases

| Phase | Topic | Implementer | Notes |
|---|---|---|---|
| 0 | ADR + bug repro pre-flight | orchestrator | **COMPLETE 2026-05-10.** See `phase-0-results.md`. Bug 2 not reproducible (Phase C dropped). Bug 4 not reproducible on demand (Decision 3 auto-fork triggered — Phase E now diagnostician). Bug 5 partial (auto-send works; Phase F scope reduced). Bugs 1, 3, 6 confirmed (or historically confirmed with strong signal). Three new follow-ups filed: diff-review layout (×2), context-injection missing for non-Agent-IDE projects. |
| A | Fix bug 1 — context preview rules-disappear | sonnet-implementer | **COMPLETE 2026-05-11.** Three rounds of instrumentation needed (waveplan's initial hypothesis was wrong twice). Root cause: `dispatchToRenderer` in `src/main/hooks.ts` had a compound OR-gate `getChatLaunchesInFlight() > 0 \|\| shouldSuppress(...)` that dropped `instructions_loaded` events from the chat's own headless subprocess during the chat-launch window. Fix in commit `821435c1` exempts `instructions_loaded` from both halves via new `shouldSuppressDispatch` predicate. Commits: `76899759` (instrumentation r1), `092c9e98` (partial fix r2 — defense-in-depth on the synthetic-session half), `a2a27870` (instrumentation r3), `821435c1` (the actual fix). Acceptance criterion met: rules visible pre-send (18, via `no-session` branch reading `listRuleFiles`) and post-send (19, via `session-found` branch reading `loadedRules` — CLAUDE.md included). Two follow-ups filed during the work: `2026-05-11-context-preview-pre-send-missing-claude-md.md` (18-vs-19 inconsistency) and `2026-05-11-context-preview-rules-evicted-after-time.md` (session record evicted after extended activity — distinct from Phase A's first-reply scope). `[trace:*]` instrumentation left in place; Phase Z decides retain-vs-remove. |
| B | Fix bug 6 — file-tree heat-map | sonnet-implementer | **COMPLETE 2026-05-11.** Root cause inverted from waveplan hypothesis: the heat-map renderer pipeline was fully functional. The bug was UX — the `HeatMapToggle` defaulted to `useState(false)` and wasn't persisted, so users (including Cole) never enabled it and never saw the borders. Two prior code-reading fixes targeted phantom renderer-pipeline issues that didn't exist. Fix in commit `a2f09251` (migrate `heatMapEnabled` into `fileTreeStore` Zustand + persist, default true, add `toggleHeatMap` action) plus hotfix `61977bed` (restore `useState` import the fix accidentally removed). Acceptance criterion met: colored border renders within 1s of agent edit; fades per existing animation. Post-reload reset accepted as expected behavior (heat-map is recent-activity indicator). Commits: `636f30bf` (instrumentation), `a2f09251` (fix), `61977bed` (hotfix). `[heat-map]` instrumentation logs left in place; Phase Z decides retain-vs-remove. ORIGINAL BRIEF FOLLOWS: INSTRUMENT FIRST — two prior code-reading fixes failed. First commit: `log.info('[heat-map] tool event', { toolName, toolInput, sessionId })` at the PostToolUse event reception in `useFileHeatMap.ts`; `log.info('[heat-map] extracted path', { rawPath, normalized, projectRoot })` at the path-extraction site; `log.info('[heat-map] row lookup', { lookupKey, found, rowCount })` at the file-tree row mapping site. User runs IDE with an agent edit, shares logs. Suspect surfaces: tool-name shape (legacy `Edit` vs new `edit_file`), path normalization (relative vs absolute), row lookup-key collision. Second commit (after evidence): targeted fix to whichever stage is dropping the path. Add regression test if testable in jsdom (event-flow may require integration test). |
| ~~C~~ | ~~Fix bug 2 — Full Review artifact pane empty~~ | **DROPPED post-Phase 0** | Bug 2 not reproducible on current `master` (tested 2026-05-10 in all three projects). Likely incidentally fixed by Wave 82.1 or Wave 85; `git blame` at Phase Z to credit. Follow-up file `2026-05-07-full-review-artifact-pane-empty.md` marked RESOLVED at Phase Z with the credited commit SHA. Two adjacent layout issues surfaced during repro and filed as separate follow-ups (`2026-05-10-diff-review-two-column-layout-unworkable.md`, `2026-05-10-diff-review-toolbar-cramped.md`) — out of Wave 84 scope. |
| D | Fix bug 3 — chat streaming freezes on project switch | **DEFERRED post-instrumentation 2026-05-11** | Phase D's rAF-throttle hypothesis is disproven. Phase D's two-window repro recipe is also wrong — the actual bug repros in single-window multi-chat-tab scenarios. `documentHidden: false` for every chunk in the captured repro. Renderer is rendering everything it receives; the "freeze" symptom Cole observed was caused by upstream not emitting chunks for 101 seconds (only 5 emits across a 145s turn). Phase D instrumentation (commit `ff90c523`) is retained; structured follow-up filed at `2026-05-11-chat-streaming-render-freeze-hypothesis-disproven.md` with corrected repro recipe + suggested investigation directions. Original brief preserved below for the next wave.<br><br>ORIGINAL BRIEF: Hypothesis from follow-up: rAF throttle on background/unfocused windows. Instrument both ends. Main side: `log.info('[trace:stream] emit', { windowId, threadId, chunkId, ts })` at `chatOrchestrationBridge*` send site. Renderer side: `log.info('[trace:stream] received', { threadId, chunkId, ts, documentHidden: document.hidden })` at `useAgentChatStreaming` listener; `log.info('[trace:stream] flush', { queuedCount, sinceLastFlushMs })` inside `useRafBatchedChunks` flush callback. User reproduces with two-window test (focus A, focus B, focus A, leave both 30s). Compare emit-vs-flush timestamps. If hypothesis confirmed: implement `setTimeout(0)` fallback flush when `document.hidden === true` OR threshold-based synchronous flush above N (e.g. 30) queued chunks. Per `AgentChat/CLAUDE.md`: `complete`/`error` chunks already flush synchronously — this fix is for `delta` chunks only. Add unit test for `useRafBatchedChunks` hidden-document fallback; assert focused-window behavior unchanged. |
| E | Diagnose bug 4 — subagent dispatch 500 | **sonnet-diagnostician** (Phase 0 auto-fork triggered — bug not reproducible on demand) | Hypotheses to test, ranked by Phase 0 evidence: **H4 (concurrent-session server pushback)** — CLI clean with 3-5 sessions; IDE 500s under multi-project load — strongest after Phase 0. **H5 (subagent-spawn architecture)** — does each IDE chat's headless Claude Code child spawn a sub-process per subagent dispatch, or share one? Code question for `claudeCodeSubagentHandler.ts`. H1-H3 (payload-shape, system-prompt collision, tool-list size) remain candidates from the original plan. **Research step required** before instrumentation: ctx7 + WebSearch against Anthropic API docs for concurrent-request limits per OAuth account, undocumented soft limits, 500-vs-429 surfacing pattern. **Instrumentation:** `log.info('[trace:subagent] spawn', { argv, env: filteredKeys, cwd, mcpServersCount, systemPromptLen, toolsCount, concurrentSpawnsInflight, ts })` at `claudeCodeSubagentHandler.ts` spawn site. Tune to capture **long multi-tool chains** (~15+ varied calls) under multi-project IDE load — that's the true Phase 0 repro recipe. **Deliverable:** `phase-e-diagnostic.md` with research findings, hypothesis ranking after sample collection, sample logs, and a recommended next-wave fix path. **Actual fix defers to a follow-up wave** once samples accumulate (estimate: 1 week of normal IDE use). |
| F | Fix bug 5 — queue draft repopulation | sonnet-implementer | **CODE LANDED 2026-05-11; SMOKE DEFERRED.** Fix in commit `f87559be`: introduces `useSendWithContent` hook that wraps `sendComposerMessage` with a `draft` override, bypassing the `setDraft` side-effect that was repopulating the composer. Both auto-send and force-send paths inherit the fix (force-send drains via the same path). Manual edit-queued-message path preserved per its existing contract. 5 new regression tests, 931/931 AgentChat suite passes. Was about to smoke when Cole observed enough compounding symptoms across the wave (heat-map fade-in-out jank, agent action without chat message) to conclude that bug-by-bug framing isn't working. Wave closed; Phase F smoke deferred to the chat-orchestration overhaul initiative. ORIGINAL BRIEF: **Scope reduced post-Phase 0.** Auto-send is NOT broken — Phase 0 confirmed it works. The defect is the draft side-effect on the queue→send transition: after auto-send (and likely also force-send) fires, the composer textarea is populated with the content that was just sent. (1) **Find where auto-send is currently wired.** Gap-analysis grep missed it; implementer should locate the actual drain effect before changing anything to avoid double-wiring. (2) **Identify why the queue→send transition writes the sent content to the composer draft.** Likely the `editQueuedMessage` side-effect at `useAgentChatWorkspace.queue.ts:56-65` (`setDraft(item.content)`) is being called from the auto-send path, not just the manual edit path. (3) **Remove the draft side-effect from send paths** (both auto and force). The send paths should call `deleteQueuedMessage` (or equivalent) WITHOUT touching `setDraft`. Refactor only the side-effect; do NOT bundle the `editQueuedMessage` rename (out of scope per Locked decisions). (4) Add regression tests in `useAgentChatWorkspace.queue.test.ts` covering BOTH auto-send and force-send paths leaving the composer empty; in-progress user draft preserved during auto-drain. **Upgraded from haiku-implementer to sonnet-implementer** because step (1) is investigative (locate a wiring the gap-analysis missed) — judgment call beyond haiku's safe-spec contract. |
| Z | Wave wrap | orchestrator | Run full `npm run lint`, full `npm run typecheck`, scoped vitest on `src/renderer/components/AgentChat/`, `src/main/agentChat/`, `src/renderer/hooks/`, full vitest at push-time. `/review` mechanical gap-check; address all FLAGs. Manual smoke gate (UI-bearing wave per `~/.claude/rules/manual-smoke-gate.md` — touches renderer chat surface): six smoke probes per the Verification table. Update each of the six follow-up files: `status: OPEN` → `status: RESOLVED` with commit SHA. Recompute verdict cells in `04-ouroboros-gap-analysis.md` (PARTIAL → AHEAD/MATCHES per predictions); update the numeric verdict-distribution table. Update `00-summary.md` headline-finding section if numbers diverge from the prediction. Author `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/wave-84-auto-brief.md`. Commit Phase Z's deliverables, push the accumulated wave commits, tag v2.16.0, update CHANGELOG.md. |

### Phase ordering

```
Phase 0 (ADR + repro pre-flight) ✅ COMPLETE
    ↓
Phase A (rules disappear)        ─┐
Phase B (heat-map)               ─┤  Renderer-only bugs.
Phase D (streaming freeze)       ─┘  Serial execution recommended;
                                     parallel risks instrumentation interference between bugs.
    ↓                                (Phase C dropped — bug 2 not reproducible.)
Phase E (subagent 500 — diagnostic) ←  sonnet-diagnostician; deliverable is phase-e-diagnostic.md,
    ↓                                  not a fix. Can run in parallel with A/B/D if needed since
                                       the diagnostic surface (main-process subagent handler) is
                                       disjoint from renderer instrumentation.
Phase F (queue draft side-effect) ←  Scope-reduced; can follow A/B/D (renderer surface, but
    ↓                                  the queue fix is non-investigative once auto-send wiring
                                       is located).
Phase Z (wrap)
```

Phases A, B, D are renderer-only and disjoint at the file level; serial is recommended for the same reasons as the original plan. Phase E (diagnostician) and Phase F can run in parallel with the renderer phases since their surfaces don't overlap. Phase Z waits for all to land.

## Risks

| Risk | Mitigation |
|---|---|
| Bug 6 (heat-map) fails for the third time despite instrumentation. | Phase B's acceptance criterion REQUIRES log evidence shared back to orchestrator before any code change. If the third attempt fails, escalate to a focused sonnet-diagnostician phase with deeper instrumentation (full event-bus trace from PreToolUse → tool execution → PostToolUse → IPC → renderer hook → file-tree row class application). The fix_cycle_detector hook will block edits after three consecutive failed verifications — non-negotiable per `~/.claude/rules/debug-before-fix.md`. |
| Bug 4 (subagent 500) has no clean repro on demand. | Phase 0's repro pre-flight checks this. If not reproducible, Phase E shifts to passive-instrumentation: land instrumentation in `claudeCodeSubagentHandler.ts` that writes a structured log on every subagent spawn; collect data over a week of normal use; reschedule the fix to a later wave when sufficient samples are gathered. Document the deferral in the auto-brief. Wave 84 still ships with the other five bugs closed. |
| rAF batcher fix introduces synchronous-flush jank on focused windows. | Phase D's threshold-based fallback only fires when queue exceeds N chunks (e.g. 30) OR `document.hidden === true`. Focused windows with normal chunk rates (3-16 per frame) continue using rAF batching at frame rate. Add unit test asserting focused-window behavior is unchanged before fix lands. |
| Context-preview rules-disappear fix introduces a different state-loss bug. | Phase A's regression test covers BOTH directions: (1) rules visible before chat start, (2) rules visible after chat start. Live IDE smoke verifies both states. If the fix breaks (1), the test fails; if it breaks (2), the smoke fails. |
| Queue auto-send drains during user composing (race with manual send). | Phase F's `useEffect` watches `thread.status === 'idle'` AND `queuedMessages.length > 0`. The status transitions to idle only after the agent's turn fully completes; user-composer state is independent. `forceSendQueuedMessage` calls `sendMessage(item.content)` directly (bypassing setDraft), so an in-progress user draft is not clobbered. Test: simulate "agent completes → queue drains → user is mid-typing" and assert draft is preserved. |
| Subagent dispatch fix is cosmetic — error 500 reproduces under different code path. | Phase E's acceptance criterion requires THREE successful dispatches of `sonnet-implementer` from a fresh IDE chat across at least TWO different prompts. Single-success is not enough. If the third attempt 500s, Phase E re-instruments and re-investigates rather than declaring done. |
| Multiple bugs share a root cause (post-start lifecycle state); fixing one fixes others. | This is the gap-analysis hypothesis at line 814. Phase A's instrumentation may surface it. If so, the orchestrator may collapse Phases A+C+D into a single state-machine fix; document the collapse decision in the auto-brief. The wave's scope tolerates this collapse — the metric is the verdict transitions, not the phase count. |
| Phase B's instrumentation captures the root cause but the fix is bigger than expected (e.g. requires a new IPC contract or a tool-name normalization layer). | Phase B's brief includes a re-scope escalation path: if the fix requires changes outside `useFileHeatMap.ts`, `FileTree.tsx`, and the row component, halt and surface to orchestrator. Heat-map is the only field-wide-rare feature in the wave (#40 unique-in-class); shipping a partial fix is preferable to over-scoping the wave. |
| Manual smoke for six bugs requires extensive Cole time. | Phase Z's smoke checklist groups by surface: rules popover (1), artifact pane (1), streaming behavior across project switch (2 — bugs 3+6), composer queue (1), subagent dispatch (1) = ~5 distinct repro flows × 2-3 minutes each = ~15-20 minutes total smoke time. |
| `/review` mechanical gap-check FLAGs the instrumentation logs as scope creep. | Investigation-specific logs (the `[trace:*]` ones) are removed before Phase Z per `~/.claude/rules/debug-before-fix.md` "Style" section. Baseline structural logs (those that would help future debugging) stay. The auto-brief documents which logs were removed vs retained. |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
|---|---|---|---|
| 0 | n/a | n/a | ADR + repro pre-flight; no code changes |
| A | Yes — `useActiveSessionRulesAndSkills` re-subscription on session-id change; `ContextPreview.popover` rendering with rules visible across before/after chat-start states | Optional — full popover-open + send-message + popover-reopen flow if testable in jsdom | Existing `ContextPreview.popover.test.tsx` is the seam — extend it |
| B | Yes — `useFileHeatMap` extraction logic for both legacy (`Edit`, `Write`) and MCP-style (`edit_file`, `write_file`) tool names; `FileTree` row lookup-key normalization | Optional — full PostToolUse event-flow if testable; live IDE smoke is load-bearing | `useFileHeatMap.test.ts` should exist or be created. Heat-map needs real PostToolUse events from a running agent — the live smoke is the primary verification. |
| C | Yes — `AgentChatDiffReview` renders with diff data; `useDiffReview` lifecycle states; listener for `agent-ide:open-diff-review` CustomEvent | Yes — `dispatchDiffReview` from `ChangeSummaryBar` triggers pane render with content (jsdom can verify the listener fires + the component renders) | Live IDE smoke verifies the full visual chain through Electron's BrowserWindow plumbing |
| D | Yes — `useRafBatchedChunks` fallback flush when `document.hidden=true`; threshold-based flush when queue exceeds N; focused-window behavior unchanged | n/a (timing-sensitive; jsdom's rAF doesn't faithfully reproduce throttle) | Live IDE smoke is required — two-window test |
| E | Yes — `claudeCodeSubagentHandler` builds spawn argv with expected shape; `scopedMcpConfig` filters MCP servers per scope (if test seam exists) | Optional — stream-json error-frame handling if test seam exists | Live IDE smoke is the load-bearing verification — three successful sub-agent dispatches across two prompts |
| F | Yes — `forceSendQueuedMessage` action calls `deleteQueuedMessage` not `editQueuedMessage`; `useEffect` drain triggers on `thread.status === 'idle'` with non-empty queue; in-progress user draft preserved during auto-drain | Yes — full queue lifecycle: addToQueue → agent completes → auto-drain → composer empty | Existing `useAgentChatWorkspace.queue.ts` is the seam — extend tests |
| Z | n/a | Full vitest at push-time; full lint; full typecheck; `/review` mechanical | Wave wrap; tests are not the deliverable here, the wave's deliverable is the bugs being closed at user-observable surfaces |

## Acceptance criteria

- [ ] ADR file `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/wave-84-decisions.md` exists with the six locked decisions transcribed from Locked decisions above.
- [ ] Phase 0's result-brief stub includes a repro-confirmation checklist for each of the six bugs (live in fresh dev session) with screenshots / logs / error text attached where the follow-up briefs are missing them.
- [ ] Phase 0 records Decision 3's resolution (sonnet-implementer vs sonnet-diagnostician for Phase E) based on bug 4's reproducibility status.
- [ ] Bug 1 (rules-disappear): in a live IDE chat in the chat-only shell, the User rules and Project rules tabs in the context preview popover above the composer show their entries both BEFORE the first message is sent AND after the first agent reply has started streaming. Verified by live observation.
- [ ] Bug 1: regression test in `useActiveSessionRulesAndSkills.test.ts` (or equivalent test for the affected hook) covers the session-id-change re-subscription path.
- [ ] Bug 6 (heat-map): in a live IDE session, after the agent edits at least one file via Edit or Write, the file-tree row for that file renders a visible colored border (the heat-map ring) within 1 second of the agent's edit completing. The color fades over time per the existing animation. Verified by live observation.
- [ ] Bug 6: instrumentation logs from the failed-attempt repros are retained in the auto-brief, showing where prior code-reading guesses missed.
- [ ] Bug 2 (artifact pane): in a live IDE chat with the agent having completed file edits, clicking "Full Review" opens the artifact pane on the right AND renders the diff content (per-file list with each modified file as an expandable row, syntax-highlighted diff lines, per-file accept/reject buttons). The pane is NOT empty.
- [ ] Bug 2: regression test in `ChatWorkbenchArtifactPane.test.tsx` covers the listener-to-render path.
- [ ] Bug 3 (streaming freeze): in a live IDE session with two project windows and active streaming in both, switching focus between Window A and Window B over 30 seconds does NOT pause the streaming render in the unfocused window. Window A's chat panel shows new tokens / tool calls / blocks that arrived while Window A was unfocused. No long catch-up flash on focus-return.
- [ ] Bug 3: regression test in `useRafBatchedChunks.test.ts` covers the hidden-document fallback flush AND asserts focused-window behavior is unchanged.
- [ ] Bug 4 (subagent 500): in a live IDE chat, dispatching `sonnet-implementer` via the Agent tool succeeds at least three times across at least two different prompts. The "API Error: Internal server error" message does NOT reproduce. The parent agent's turn does NOT stop mid-stream.
- [ ] Bug 4: instrumentation logs (or `phase-e-diagnostic.md` if forked to diagnostician) retained in the auto-brief showing the root cause and the fix's evidence basis.
- [ ] Bug 5 (queue auto-send): in a live IDE chat, queuing a message during agent work AND waiting for completion causes the queued message to auto-send; the composer is empty after the auto-send; the chat shows the queued content as a new user message and the agent starts a new turn on it.
- [ ] Bug 5 (force-send draft): manually force-sending a queued message clears the composer; the message text does NOT reappear in the textarea.
- [ ] Bug 5: unit tests in `useAgentChatWorkspace.queue.test.ts` cover the auto-drain effect, the `forceSendQueuedMessage` action's draft-clear contract, and the in-progress-user-draft preservation case.
- [ ] Each follow-up file in `roadmap/follow-ups/2026-05-0*-*.md` covered by this wave is updated to `status: RESOLVED` with the commit SHA cited.
- [ ] `04-ouroboros-gap-analysis.md`'s per-axis verdict cells are recomputed: PARTIAL → AHEAD or PARTIAL → MATCHES transitions per the gap-analysis predictions reflected in the affected axes (#19, #20, #28, #33, #35, #37, #40, #42, #47).
- [ ] `04-ouroboros-gap-analysis.md`'s numeric verdict-distribution table at lines 1170-1178 is recomputed (target: PARTIAL = 3, AHEAD = 17, MATCHES adjusted accordingly).
- [ ] `00-summary.md`'s headline-finding section is updated if final numbers diverge from the predicted PARTIAL=3 / AHEAD=17.
- [ ] Full `npm run lint` clean.
- [ ] Full `npm run typecheck` clean.
- [ ] Scoped vitest on touched paths clean; full vitest at push-time clean.
- [ ] `/review` mechanical gap-check returns PASS or all FLAGs addressed.
- [ ] Manual smoke checklist signed in `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/wave-84-auto-brief.md`.
- [ ] `v2.16.0` tag pushed to origin; CHANGELOG.md entry added.

## Verification

### Per-phase experiential observation

The data-shape probes below confirm the JSON / file-on-disk populates correctly. They do NOT confirm the user observes anything different — that's what this table is for. Each row anchors a phase to a concrete user-facing surface and the full path from change site to observation. See `~/.claude/notes/wave-process.md` "Site 2" for the rule.

| Phase | Observation point | Path to it | What "working" looks like there |
|---|---|---|---|
| 0 | Internal — no observation point | n/a | Phase 0 produces an ADR file and a repro-confirmation checklist that subsequent phases consume. No user-facing surface. |
| A | Cole opens the context preview popover above the composer in the chat-only shell, BOTH before sending the first message AND after the first agent reply has begun streaming, in a live IDE session | popover trigger click → `ContextPreview.popover.tsx` open handler → `useContextPreview` model assembly → `useActiveSessionRulesAndSkills(claudeSessionId, projectRoot)` hook → main-process subscription to `rulesAndSkills:changed` → main re-emits on session-id change → renderer hook re-fires with new session ID → model rebuilds with non-empty rules array → popover re-renders with rules tabs populated | Popover renders the User rules tab and Project rules tab with their respective entries listed (rule name + path + token count + checkbox). The list is non-empty in BOTH the pre-chat-start and post-chat-start states; nothing disappears when the session starts. Cole sees the same rules he sees in `~/.claude/rules/` and `<project>/.claude/rules/` in both states. |
| B | Cole watches the file tree's rows in a live IDE session, immediately after the agent finishes editing a file via Edit or Write | Agent completes an Edit/Write tool call → PostToolUse hook event arrives at named-pipe server → main-process emits `chatOrchestration:fileTouched` IPC event → renderer's `useFileHeatMap` listener receives event → extracts file path from tool input → normalizes path → maps to file-tree row's lookup key → row component receives `isHot=true` prop → row renders with colored-border CSS class | The rows for files the agent just edited render with a visible colored border (the heat-map ring) within 1 second of the edit completing. The color fades over the next several seconds per the existing fade animation. Other files in the tree are unaffected. Cole sees the visual indicator without needing to click or refresh. |
| ~~C~~ | **DROPPED** post-Phase 0 — bug 2 not reproducible on current `master` | n/a | Phase C removed. Two new follow-ups filed for layout issues observed during repro (`2026-05-10-diff-review-two-column-layout-unworkable.md`, `2026-05-10-diff-review-toolbar-cramped.md`). |
| D | Cole has two IDE windows open with active chat streaming in both, switches focus from window A to window B and back over 30 seconds, in a live multi-window session | Window A's main-process emit → IPC `agentChat:streamChunk` arrives at Window A's renderer → `useAgentChatStreaming` accumulates delta → `useRafBatchedChunks` queues delta → `document.hidden === true` detection fires → fallback flush via `setTimeout(0)` (or threshold-trigger when queue > 30) → `setStateMap` fires → React re-renders Window A's chat panel even while unfocused → Cole switches back to Window A and observes content advanced during the focus-elsewhere period | Window A's chat panel shows new tokens / tool calls / blocks that arrived while Window A was unfocused. The streaming indicator advanced. The persisted message render that catches up after completion is no longer the only thing the user sees post-switch — the LIVE render kept up. No long catch-up flash on focus-return. |
| E | **Diagnostic phase post-Phase 0 auto-fork.** Cole reviews `phase-e-diagnostic.md` produced from a week of passive instrumentation under normal IDE use | sonnet-diagnostician researches Anthropic API concurrent-request behavior (ctx7 + WebSearch) → instruments `claudeCodeSubagentHandler.ts` spawn site with structured logs capturing argv / env / mcpServersCount / systemPromptLen / toolsCount / concurrentSpawnsInflight / ts → orchestrator deploys the instrumented build to Cole's normal IDE work for ~1 week → diagnostician analyzes accumulated logs against ranked hypotheses (H4 concurrent-session pushback strongest, H5 spawn architecture, H1-H3 from original plan) → authors `phase-e-diagnostic.md` with hypothesis ranking + sample logs + recommended next-wave fix path | `phase-e-diagnostic.md` exists in the wave folder. The doc names the most-likely root cause backed by sample logs, with hypothesis weights informed by ≥5 captured 500-events from normal use. Cole reads it and can decide whether the recommended fix is worth a follow-up wave or stays deferred. The actual fix is NOT in this wave's surface — Phase E's deliverable is the diagnosis, not the patch. |
| F | Cole queues a message in the composer while the agent is working, then waits for the agent to finish, in a live IDE chat session | User submits message during `thread.status !== 'idle'` → `addToQueue` adds item → queued-message UI renders the queued item above the composer → agent finishes → `thread.status` transitions to `'idle'` → `useEffect` in `useAgentChatWorkspace.ts` watches the transition → fires `forceSendQueuedMessage(queuedMessages[0].id)` → `deleteQueuedMessage` removes from queue (no setDraft) → `sendMessage(item.content)` sends content directly → composer remains empty | The queued message auto-sends as soon as the agent finishes its turn. The chat shows the queued content as a new user message and the agent starts a new turn on it. The composer textarea is empty during and after the auto-send (no draft repopulation). When Cole instead force-sends manually, the same empty-composer behavior holds. |
| Z | Internal — no observation point | n/a | Wave-wrap meta phase: full lint, typecheck, vitest, `/review`, manual-smoke checklist sign. The user-observable phases (A-F) carry the experiential observations. Phase Z's deliverable is the wave shipping cleanly to main with the verdict-distribution updated. |

### Data-shape probes

```bash
# After each fix lands, verify the regression test exists and passes
npx vitest run src/renderer/components/AgentChat/ContextPreview.popover.test.tsx
npx vitest run src/renderer/components/AgentChat/AgentChatDiffReview.test.tsx
npx vitest run src/renderer/components/AgentChat/useRafBatchedChunks.test.ts
npx vitest run src/renderer/components/AgentChat/useAgentChatWorkspace.queue.test.ts
npx vitest run src/renderer/hooks/useFileHeatMap.test.ts

# Confirm follow-up files are marked RESOLVED with commit SHA
grep -l "status: RESOLVED" roadmap/follow-ups/2026-05-0*-*.md | wc -l   # expect 6

# Confirm gap analysis verdict updates (rough sanity check on direction)
grep -c "PARTIAL" roadmap/foundation/agent-chat-best-practices/04-ouroboros-gap-analysis.md   # expect ~3 (down from 9)
grep -c "AHEAD" roadmap/foundation/agent-chat-best-practices/04-ouroboros-gap-analysis.md     # expect ~17 (up from 11)

# Confirm CHANGELOG entry added
grep -A 5 "v2.16.0" CHANGELOG.md   # expect non-empty section with this wave's bullets
```

## Files the next agent should read first

1. `roadmap/foundation/agent-chat-best-practices/00-summary.md` — executive summary; this wave's strategic framing and the bug-fix-wave punch list it derives.
2. `roadmap/foundation/agent-chat-best-practices/04-ouroboros-gap-analysis.md` — the verdict-by-axis source of truth; each bug fix targets specific axes named here, and the "Effort vs. impact matrix" at lines 686-704 is the priority basis.
3. `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/wave-84-decisions.md` — ADR scaffold; Phase 0 fills it from the Locked decisions section above.
4. `roadmap/follow-ups/2026-05-07-context-preview-rules-disappear-after-chat-start.md` — bug 1 detailed brief.
5. `roadmap/follow-ups/2026-05-07-full-review-artifact-pane-empty.md` — bug 2 detailed brief; investigation plan with four log statements.
6. `roadmap/follow-ups/2026-05-07-chat-streaming-freezes-on-project-switch.md` — bug 3 detailed brief; rAF throttle hypothesis.
7. `roadmap/follow-ups/2026-05-07-subagent-dispatch-fails-inside-ide-chat.md` — bug 4 detailed brief; OAuth ruled out, hypothesis space narrowed to payload-shape / system-prompt collision / tool-list size.
8. `roadmap/follow-ups/2026-05-07-queued-message-no-autosend-and-text-reappears.md` — bug 5 detailed brief; fix shape pre-determined.
9. `roadmap/follow-ups/2026-05-06-file-heat-map-still-broken.md` — bug 6 detailed brief; instrument-first is non-negotiable per this brief's investigation plan.
10. `~/.claude/rules/debug-before-fix.md` — non-negotiable for bugs 1, 2, 3, 6 — instrumentation precedes the next code change. Hook-level enforcement at `~/.claude/hooks/fix_cycle_detector.mjs` will block edits after three consecutive failed verifications.
11. `~/.claude/rules/multi-process-debugging.md` — relevant for bugs 3 and 4 (multi-channel event flow, IPC + named-pipe + stream-json).
12. `src/renderer/components/AgentChat/CLAUDE.md` — chat surface map; lists every chat file with its role.
13. `src/main/agentChat/CLAUDE.md` — chat orchestration map (if it exists; otherwise `src/main/CLAUDE.md`).
14. `roadmap/wave-83-electron-renderer-browser-mcp-wiring/waveplan-83.md` — exemplar of recent wave-plan shape and dispatch-checklist quality.
15. `~/.claude/rules/agent-catalog.md` — Haiku tool constraints for Phase F (haiku-implementer has no Bash; orchestrator runs gates and commits).

## Note to the implementer

This wave is six independent bug fixes anchored to a strategic gap analysis that says "fixing the bugs already filed grows AHEAD verdicts from 11 to 17 without writing a single line of new feature code." The discipline is to fix each bug minimally and resist the temptation to refactor adjacent code. Tier-3 scope creep (per the development pipeline at `~/.claude/rules/development-pipeline.md`) is especially tempting in chat code because the surface is dense with adjacent issues — surface anything noticed-but-unrelated as a follow-up and keep moving. The mention-types cluster (#8, #9, #10, #12, #38) is the natural next wave; do not pull it forward. The same goes for system prompt visibility (#21), per-hunk accept/reject (#43), and the `AgentChatConversation.tsx` line-count refactor.

The single most likely failure mode is shipping a "fix" for one of the instrumentation-required bugs (1, 2, 3, 6) without actually instrumenting first. Per `~/.claude/rules/debug-before-fix.md` and the user-memory entry on debug-before-fix, two of these (heat-map, full-review) have already burned code-reading guesses; the rule fires hard. Each phase's first commit MUST be the instrumentation; the runtime evidence MUST be observed via Cole running the IDE and sharing logs back; only then does the fix commit land. The `fix_cycle_detector` hook will block edits after three consecutive failed verifications — this is not the wave to test that limit. The instrumentation logs that are investigation-specific must be removed before Phase Z; baseline structural logs that aid future debugging stay (per `debug-before-fix.md` "Style" section).

The second most likely failure mode is bug 4 (subagent 500) being non-reproducible on demand. Phase 0 checks this; if the bug doesn't repro cleanly, Phase E forks to a passive-instrumentation strategy that collects samples over time rather than risking a wild-guess fix. Don't ship a fix that wasn't validated against a real failure trace. Wave 84 still ships with the other five bugs closed even if Phase E defers.

Per existing repo policy (memory entries): subagents skip full `npm test` (~280s exceeds patience); the orchestrator runs scoped vitest on touched paths after each phase commit, full vitest at push-time. Push policy is per-wave, not per-phase — accumulate phase commits locally and push once at Phase Z wrap after `/review` PASS. Phase F (haiku-implementer) cannot run Bash tools — orchestrator runs gates and commits per `~/.claude/rules/agent-catalog.md` "Haiku tool constraints" section.

Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

## Orchestrator dispatch checklist

1. **Verify ADR scaffold exists.** Confirm `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/wave-84-decisions.md` exists with the six locked decisions transcribed from the Locked decisions section above. If empty, populate it before dispatching Phase A. Decision 3 is **already locked** (2026-05-10): default dispatch is sonnet-implementer; Phase 0's repro pre-flight (step 2 below) determines whether the auto-fork to sonnet-diagnostician fires. No user lock pending.
2. **Phase 0 dispatch (orchestrator-only).** Reproduce each of the six bugs in a fresh dev session. Capture screenshots / logs / error text where the follow-up briefs are missing them. Output: repro-confirmation checklist appended to the result-brief stub at `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/wave-84-auto-brief.md`. If any bug is no-longer-reproducible, halt and re-evaluate the wave's scope with Cole before dispatching Phase A.
3. **Phase A dispatch (sonnet-implementer).** Brief covers: instrument-first discipline (first commit is logs, not the fix), suspect surfaces (`useActiveSessionRulesAndSkills*`, `useFilesystemDisabledRuleIds*`, `ContextPreview.popover.tsx`), the four AHEAD axes (#19, #20, #33, #35) the fix unhides. Acceptance gate to advance to Phase B: live-IDE smoke verifies User+Project rules visible in popover before AND after chat start; regression test for hook re-subscription added; lint+typecheck clean.
4. **Orchestrator diff review of Phase A.** Verify the fix is targeted (no incidental rewrites of nearby code), the regression test covers both pre- and post-chat-start states, instrumentation either retained at info-level for future debugging OR cleanly removed if investigation-specific (per the structural-vs-investigation logging rule).
5. **Phase B dispatch (sonnet-implementer).** Brief covers: HARD instrument-first requirement (two prior code-reading attempts failed; this is the third), three log statements from the follow-up's investigation plan, suspect surfaces (`useFileHeatMap.ts`, `FileTree.tsx`, the row component applying colored-border class), heat-map's unique-in-class status (#40 has no field competition). Acceptance gate to advance to Phase C: live-IDE smoke verifies colored border renders within 1 second of agent edit; instrumentation logs retained in auto-brief showing the root cause; regression test added if jsdom-testable; lint+typecheck clean.
6. **Orchestrator diff review of Phase B.** Verify the instrumentation evidence is in the auto-brief; the fix matches what the evidence indicated; no scope creep into adjacent file-tree code.
7. **Phase C dispatch (sonnet-implementer).** Brief covers: instrument-first via the four log statements in the follow-up's investigation plan, suspect surfaces (`ChangeSummaryBar.tsx:140-144` dispatch site, `ChatWorkbenchArtifactPane.tsx` listener, `WorkbenchRightPane.tsx` content slot, `AgentChatDiffReview.tsx` body, `useDiffReview.ts` lifecycle). Acceptance gate to advance to Phase D: live-IDE smoke verifies pane renders diff content after Full Review click; regression test for listener-to-render path; lint+typecheck clean.
8. **Orchestrator diff review of Phase C.**
9. **Phase D dispatch (sonnet-implementer).** Brief covers: rAF throttle hypothesis from follow-up, instrument both ends (main-side emit log + renderer-side received/flush logs), fix candidates (setTimeout fallback when `document.hidden === true` OR threshold-based sync flush above N queued chunks, applied to delta chunks only — `complete`/`error` already flush synchronously per `AgentChat/CLAUDE.md`), focused-window-no-regression invariant. Acceptance gate to advance to Phase E: two-window live-IDE smoke verifies streaming continues in unfocused window over 30 seconds; regression test for `useRafBatchedChunks` hidden-document fallback; focused-window unit test asserts unchanged behavior; lint+typecheck clean.
10. **Orchestrator diff review of Phase D.**
11. **Phase E dispatch (sonnet-implementer per Decision 3 default OR sonnet-diagnostician if Phase 0 found bug non-reproducible).** If implementer: brief covers payload-shape / system-prompt-collision / tool-list-size hypotheses (OAuth ruled out — 3 sessions concurrent), instrument-first at `claudeCodeSubagentHandler.ts` spawn site, IDE-vs-terminal spawn-args comparison, full stream-json error-frame capture on next repro. If diagnostician: brief covers the same instrumentation but the deliverable is `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/phase-e-diagnostic.md` with hypothesis ranking + sample logs; the fix lands in a follow-up Phase E2 sonnet-implementer dispatch. Acceptance gate to advance to Phase F: live-IDE smoke verifies sonnet-implementer dispatch succeeds 3× across 2 prompts; instrumentation evidence retained in auto-brief; regression test if test seam exists; lint+typecheck clean.
12. **Orchestrator diff review of Phase E (and E2 if forked).**
13. **Phase F dispatch (haiku-implementer).** Brief includes the explicit Haiku tool-constraint reminder per `~/.claude/rules/agent-catalog.md`: "Your tools are Read, Edit, Write. You CANNOT run Bash, npm, git, or any verification commands. After writing/editing, report DONE — gates pending. The orchestrator will run gates and commit." Brief covers: the determined fix shape (`forceSendQueuedMessage` action, drain `useEffect`, button-wiring fix), the `editQueuedMessage` semantic-confusion source of the bug, no setDraft side-effect on send paths. Acceptance gate to advance to Phase Z: live-IDE smoke verifies queue auto-drains on agent completion AND force-send leaves composer empty; unit tests cover auto-drain + draft-clear + user-draft-preservation; orchestrator runs lint+typecheck clean.
14. **Orchestrator diff review of Phase F.**
15. **Phase Z (orchestrator).** Run full `npm run lint`, full `npm run typecheck`, scoped vitest on `src/renderer/components/AgentChat/`, `src/main/agentChat/`, `src/renderer/hooks/`, full vitest at push-time (per `~/.claude/rules/test-scope.md` "When to run the full suite"). `/review` mechanical gap-check; address all FLAGs. Manual smoke checklist (UI-bearing wave per `~/.claude/rules/manual-smoke-gate.md` — touches renderer chat surface): six smoke probes per the Verification table, each tied to a Cole-observable surface. Update each follow-up file's status from OPEN to RESOLVED with commit SHA cited. Recompute verdict cells in `04-ouroboros-gap-analysis.md` (PARTIAL → AHEAD or PARTIAL → MATCHES per per-axis predictions); recompute the numeric verdict-distribution table at lines 1170-1178 (target: PARTIAL=3, AHEAD=17). If final numbers diverge from prediction, update `00-summary.md`'s headline-finding section with actuals. Author `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/wave-84-auto-brief.md` summarizing each phase's outcome, instrumentation evidence retained, and verdict transitions. Commit Phase Z's deliverables, push the accumulated wave commits, tag v2.16.0, update CHANGELOG.md.
