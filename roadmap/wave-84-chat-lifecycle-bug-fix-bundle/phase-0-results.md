---
status: COMPLETED
created: 2026-05-10
updated: 2026-05-10
phase: 0
---

# Phase 0 — ADR + repro pre-flight results

Phase 0 ran 2026-05-10 in a live dev IDE session against the shipped `master` code. The ADR was transcribed first; the six bugs were then live-reproduced one at a time with console capture.

## Repro results

| Bug | Outcome | Detail |
|---|---|---|
| 1 — context-preview rules disappear | CLEAN REPRO | Popover showed 18 user rules / 5 project rules before sending; both dropped to 0 / 0 once the agent reply began streaming. Symptom matches the gap-analysis hypothesis (`useActiveSessionRulesAndSkills` doesn't re-fire on session-id change). Phase A proceeds with instrument-first as planned. |
| 2 — Full Review artifact pane empty | NOT REPRODUCIBLE | Tested in all three projects (Agent IDE / Contractor App / Gamify). Pane opens with diff content rendered in every case. Cole confirmed the original report was against the built `.exe`; something between then and current `master` closed it (candidate fix waves: 82.1, 85 — `git blame` at Phase Z to credit). Phase C drops from the wave. The layout, however, is visibly broken — see new follow-ups (`2026-05-10-diff-review-two-column-layout-unworkable.md`, `2026-05-10-diff-review-toolbar-cramped.md`). |
| 3 — chat streaming freezes on project switch | INCONCLUSIVE THIS SESSION; HISTORICALLY CONFIRMED | Multi-window test was occluded by subagent-dispatch behavior (subagent work renders inside the tool-use card, not as parent-stream deltas, so the streaming-visibility signal was hidden). Cole's historical observation is unambiguous: switching away from a window left the chat panel silent until focus return, at which point the full content flashed in — classic rAF-throttle-flush signature. Phase D proceeds with instrument-first; instrumentation will confirm or rule out the rAF hypothesis cleanly. |
| 4 — subagent dispatch 500 | NOT REPRODUCIBLE ON DEMAND | Two test dispatches both succeeded. Cole's observations: bug is intermittent, fires more under multi-project IDE load (3+ active chats), never fires from CLI (3-5 concurrent CLI sessions tested clean). True repro recipe is **long multi-tool chains** (~15+ varied calls reading/writing different files), not bulk-batch operations. Decision 3 auto-fork TRIGGERS — Phase E switches from sonnet-implementer to sonnet-diagnostician; the actual fix defers to a follow-up wave. |
| 5 — queue auto-send / draft repopulation | PARTIAL REPRO | **Defect A (no auto-send): DID NOT REPRODUCE.** Auto-send works correctly — the queued message fired as soon as the agent's first turn completed. Original follow-up's "auto-send is not implemented at all" hypothesis is contradicted by runtime evidence. **Defect B (composer repopulation): REPRODUCED, but on the AUTO-SEND path, not (only) on force-send.** After auto-send fired, the composer textarea was populated with the same content that was just sent. Phase F scope reduces: drop the "add `useEffect` drain" task; focus on "find why the queue→send transition writes the sent content back to the draft, remove that side effect, regardless of whether trigger is auto or force." |
| 6 — file-tree heat-map | REPRODUCED | Agent edits a file; the `M` (modified) indicator appears in the file tree (separate filesystem-watcher signal, working correctly), but no colored heat-map ring renders, and toggling the heat-map setting has no effect either way. The toggle-has-no-effect observation narrows Phase B's instrumentation focus to the event→state pipeline (the heat data never reaches the row component); the render path is downstream of the failure. Phase B proceeds with instrument-first as planned — hard requirement, two prior code-reading fixes failed. |

## Decision 3 — auto-fork outcome

Per the wave plan's locked Decision 3 (2026-05-10): default dispatch is sonnet-implementer; Phase 0's pre-flight live-confirms repro; auto-fork to sonnet-diagnostician if not reproducible.

**Phase 0 outcome: bug 4 not reproducible on demand → auto-fork TRIGGERED.** Phase E is now sonnet-diagnostician. Phase E's deliverable is `phase-e-diagnostic.md` with passive-instrumentation results, hypothesis ranking, and sample logs. The actual fix defers to a follow-up wave once samples accumulate.

## Wave 84 net scope after Phase 0

| Phase | Status after Phase 0 |
|---|---|
| 0 — ADR + repro pre-flight | **COMPLETE** |
| A — context-preview rules disappear | Proceed as planned (instrument-first) |
| B — file-tree heat-map | Proceed as planned (instrument-first, hard requirement) |
| C — Full Review pane empty | **DROPPED** (bug not reproducible) |
| D — chat streaming freeze | Proceed as planned (instrument-first) |
| E — subagent dispatch 500 | **FORKED to sonnet-diagnostician**; fix defers |
| F — queue draft repopulation | Proceed with **reduced scope** (drop auto-send drain; fix draft side-effect only) |
| Z — wave wrap | Unchanged |

The wave now ships 4 fixes (A, B, D, F) + 1 diagnostic artifact (E). Target tag remains `v2.16.0` — the scope is still substantial and the bugs closed are flagship-feature fixes.

## Phase E — additional hypotheses to incorporate from Phase 0 observations

Phase E's diagnostician brief should include the wave plan's original three hypotheses (payload-shape, system-prompt collision, tool-list size) plus these from Phase 0:

- **H4 — concurrent-session server-side pushback.** Cole confirmed CLI is clean with 3-5 concurrent sessions; IDE 500s correlate with multi-project IDE load. Worth investigating whether the IDE spawns a separate Claude Code child per chat (multiplying concurrent inflight API requests from the same OAuth account beyond what CLI usage produces).
- **H5 — subagent-spawn architecture.** Open question: does each IDE chat's headless Claude Code child spawn additional sub-processes per subagent dispatch, or share one? Code question for `claudeCodeSubagentHandler.ts`.

Phase E's brief should include a **research step** against current Anthropic API documentation: concurrent-request limits per OAuth account, undocumented soft limits, the surfacing pattern for 500-vs-429 under throttling. Use ctx7 + WebSearch.

The repro recipe Phase E's instrumentation should be tuned to capture: **long multi-tool chains** (~15+ varied calls) under multi-project IDE load, not bulk-batch operations.

## Phase F — revised fix shape after Phase 0

Original Phase F plan:
1. Add `forceSendQueuedMessage(id)` action.
2. Add `useEffect` drain trigger for auto-send.
3. Rewire force-send button.

Revised Phase F plan after Phase 0:
1. **Investigate where auto-send is currently wired.** It works, so the wiring exists somewhere — the gap-analysis grep missed it. The implementer should find it before changing anything (otherwise risks double-wiring).
2. **Find why the queue→send transition writes sent content to the composer draft.** Likely the `editQueuedMessage` side-effect (`setDraft(item.content)` at `useAgentChatWorkspace.queue.ts:56-65`) is being called from the auto-send path too, not just the manual edit path.
3. **Remove the draft side-effect from the send paths** (both auto and manual). The send paths should call `deleteQueuedMessage` (or equivalent) WITHOUT touching `setDraft`. The `editQueuedMessage` rename to `promoteQueuedMessageToDraft` (noted in gap analysis line 1009 as out-of-scope) becomes more attractive but stays out of scope.
4. **Add regression tests covering both auto-send and force-send paths**; both must leave the composer empty.

## New follow-ups filed during Phase 0

- `roadmap/follow-ups/2026-05-10-diff-review-two-column-layout-unworkable.md` (medium)
- `roadmap/follow-ups/2026-05-10-diff-review-toolbar-cramped.md` (low-medium; bundle with the layout follow-up)
- `roadmap/follow-ups/2026-05-10-context-injection-missing-non-agent-ide-projects.md` (medium-high; flagship-feature regression for Contractor App and Gamify)

## Observations for the auto-brief (not bugs, not in Wave 84)

- **Chat-agent dispatch judgment diverges across projects.** Agent IDE's sonnet agent answered a "list 100 TS files" prompt inline with 2 search calls and a dump; Contractor App and Gamify dispatched to `haiku-explorer` for the same shape (probably the right move). Candidate motivation for a future "dispatch-discipline" tuning pass.
- **Auto-send works** — the gap analysis was wrong on this point. Worth correcting in the matrix when the auto-brief recomputes verdicts.

## Repro environment

- IDE running from `npm run dev` on `master` (`91471273 fix(wave-85): pre-push tsconfig.web/node strictness errors`).
- Three projects loaded: Agent IDE, Contractor App, Gamify.
- DevTools open; console output captured for bugs 5, 1, 2, 6, 4, 3.

## Next action

Dispatch Phase A (sonnet-implementer) per the updated waveplan. Acceptance gate to Phase B: live-IDE smoke verifies User + Project rules visible in popover both before and after chat start; regression test for hook re-subscription added; lint+typecheck clean.
