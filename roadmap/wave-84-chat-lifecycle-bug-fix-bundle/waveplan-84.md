# Wave 84 — Chat Lifecycle Bug-Fix Bundle

## Status

DRAFT · target v2.16.0 · drafted 2026-05-08.

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
| 0 | ADR + bug repro pre-flight | orchestrator | Author `wave-84-decisions.md` from Locked decisions section. Reproduce each of the six bugs in a fresh dev session — capture screenshots / logs / error text where the follow-up briefs are missing them (bug 4's error text is captured; bugs 1-3, 5, 6 need fresh confirmation). If any bug is no-longer-reproducible, surface and re-evaluate scope with Cole before dispatching Phase A. Decide Decision 3 based on bug-4 reproducibility. Output: ADR file + repro-confirmation checklist as a result-brief stub. |
| A | Fix bug 1 — context preview rules-disappear | sonnet-implementer | INSTRUMENT FIRST per `~/.claude/rules/debug-before-fix.md`. First commit: `log.info('[trace:ctx-preview] model items', { phase: 'before-send' \| 'after-send', sessionId, claudeSessionId, projectRoot, userRules, projectRules })` at popover open in `ContextPreview.popover.tsx`; same line at `useActiveSessionRulesAndSkills` subscription callback. User runs IDE, captures logs across pre/post chat-start states, shares back. Suspect from gap analysis line 1133: `useActiveSessionRulesAndSkills(claudeSessionId, projectRoot)` returns empty after chat starts because the hook's `rulesAndSkills:changed` subscription doesn't re-fire with the new session ID. Second commit (after evidence): re-subscribe on `claudeSessionId` change. Add unit test for the hook's re-subscription path covering both pre- and post-session-id-change states. |
| B | Fix bug 6 — file-tree heat-map | sonnet-implementer | INSTRUMENT FIRST — two prior code-reading fixes failed. First commit: `log.info('[heat-map] tool event', { toolName, toolInput, sessionId })` at the PostToolUse event reception in `useFileHeatMap.ts`; `log.info('[heat-map] extracted path', { rawPath, normalized, projectRoot })` at the path-extraction site; `log.info('[heat-map] row lookup', { lookupKey, found, rowCount })` at the file-tree row mapping site. User runs IDE with an agent edit, shares logs. Suspect surfaces: tool-name shape (legacy `Edit` vs new `edit_file`), path normalization (relative vs absolute), row lookup-key collision. Second commit (after evidence): targeted fix to whichever stage is dropping the path. Add regression test if testable in jsdom (event-flow may require integration test). |
| C | Fix bug 2 — Full Review artifact pane empty | sonnet-implementer | INSTRUMENT FIRST per follow-up's investigation plan. First commit: four log statements per the follow-up — `log.info('[trace:full-review] click', { sessionId, snapshotHash, projectRoot, fileCount })` at `ChangeSummaryBar.tsx:140-144` `dispatchDiffReview` site; `log.info('[trace:full-review] event received', payload)` in artifact-pane listener; `log.info('[trace:full-review] artifact-pane mount', { mode, payload })` at content slot; `log.info('[trace:full-review] diff-review render', { hasFiles, sessionId, snapshotHash })` in `AgentChatDiffReview` body. User reproduces, shares logs. Identify which hop drops state. Second commit (after evidence): targeted fix. Add regression test in `ChatWorkbenchArtifactPane.test.tsx` covering listener-to-render path. |
| D | Fix bug 3 — chat streaming freezes on project switch | sonnet-implementer | Hypothesis from follow-up: rAF throttle on background/unfocused windows. Instrument both ends. Main side: `log.info('[trace:stream] emit', { windowId, threadId, chunkId, ts })` at `chatOrchestrationBridge*` send site. Renderer side: `log.info('[trace:stream] received', { threadId, chunkId, ts, documentHidden: document.hidden })` at `useAgentChatStreaming` listener; `log.info('[trace:stream] flush', { queuedCount, sinceLastFlushMs })` inside `useRafBatchedChunks` flush callback. User reproduces with two-window test (focus A, focus B, focus A, leave both 30s). Compare emit-vs-flush timestamps. If hypothesis confirmed: implement `setTimeout(0)` fallback flush when `document.hidden === true` OR threshold-based synchronous flush above N (e.g. 30) queued chunks. Per `AgentChat/CLAUDE.md`: `complete`/`error` chunks already flush synchronously — this fix is for `delta` chunks only. Add unit test for `useRafBatchedChunks` hidden-document fallback; assert focused-window behavior unchanged. |
| E | Fix bug 4 — subagent dispatch 500 | sonnet-implementer (default) OR sonnet-diagnostician (if Phase 0 finds bug non-reproducible) | Hypotheses from updated follow-up: payload-shape difference, system-prompt collision, tool-list size/shape. OAuth ruled out (3 sessions running concurrently). If implementer dispatch: instrument-first at `claudeCodeSubagentHandler.ts` spawn site — `log.info('[trace:subagent] spawn', { argv, env: filteredKeys, cwd, mcpServersCount, systemPromptLen, toolsCount })`. Capture full stream-json output up to the error frame on next repro. Compare IDE-spawned vs terminal-spawned dispatch's spawn args + system prompt + tool list. Identify the delta; fix the offending injection. If diagnostician dispatch: same instrumentation, but Phase E's deliverable is `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/phase-e-diagnostic.md` with hypothesis ranking + sample logs; the fix lands in a follow-up Phase E2 sonnet-implementer dispatch (or in a future wave if samples are slow to accumulate). Add regression test if a test seam exists for stream-json error-frame handling. |
| F | Fix bug 5 — queue auto-send + force-send draft | haiku-implementer | Fix shape pre-determined per gap analysis lines 991-1009 (no instrumentation needed). (1) Add `forceSendQueuedMessage(id: string): void` action in `agentChatWorkspaceActions.ts`: looks up item, calls `deleteQueuedMessage(id)` (NOT `editQueuedMessage`), calls `sendMessage(item.content)`. (2) Add `useEffect` in `useAgentChatWorkspace.ts` watching `[thread.status, queuedMessages.length]` that fires `forceSendQueuedMessage(queuedMessages[0].id)` when `thread.status === 'idle'` AND `queuedMessages.length > 0`. (3) Rewire force-send button in `AgentChatConversation.tsx` to call `forceSendQueuedMessage` (NOT `editQueuedMessage` + `sendMessage`). Add unit tests in `useAgentChatWorkspace.queue.test.ts` covering: auto-drain effect fires on idle transition; `forceSendQueuedMessage` does NOT touch draft; in-progress user composing while queue drains preserves user's draft. Haiku tools: Read, Edit, Write — orchestrator runs gates after DONE per `~/.claude/rules/agent-catalog.md`. |
| Z | Wave wrap | orchestrator | Run full `npm run lint`, full `npm run typecheck`, scoped vitest on `src/renderer/components/AgentChat/`, `src/main/agentChat/`, `src/renderer/hooks/`, full vitest at push-time. `/review` mechanical gap-check; address all FLAGs. Manual smoke gate (UI-bearing wave per `~/.claude/rules/manual-smoke-gate.md` — touches renderer chat surface): six smoke probes per the Verification table. Update each of the six follow-up files: `status: OPEN` → `status: RESOLVED` with commit SHA. Recompute verdict cells in `04-ouroboros-gap-analysis.md` (PARTIAL → AHEAD/MATCHES per predictions); update the numeric verdict-distribution table. Update `00-summary.md` headline-finding section if numbers diverge from the prediction. Author `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/wave-84-auto-brief.md`. Commit Phase Z's deliverables, push the accumulated wave commits, tag v2.16.0, update CHANGELOG.md. |

### Phase ordering

```
Phase 0 (ADR + repro pre-flight)
    ↓
Phase A (rules disappear)        ─┐
Phase B (heat-map)               ─┤  Renderer-only bugs.
Phase C (artifact pane)          ─┤  Serial execution recommended;
Phase D (streaming freeze)       ─┘  parallel risks instrumentation interference between bugs.
    ↓
Phase E (subagent 500)           ←   Touches main process + orchestration; serialize to avoid IDE-restart churn.
    ↓
Phase F (queue)                  ←   Simplest fix; safe last; no instrumentation needed.
    ↓
Phase Z (wrap)
```

Phases A–D are renderer-only and disjoint at the file level; they could in principle run in parallel via separate sonnet subagent dispatches. Recommend serial because (a) instrumentation logs interleave confusingly across bugs and (b) the IDE is restart-heavy on renderer changes during the verify-each-fix cycle. The orchestrator may choose to parallelize A and D (most-disjoint pair) if the wave timeline pressures.

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
| C | Cole clicks the "Full Review" button in the chat-only shell after the agent has completed a turn with file edits, in a live IDE session | "Full Review →" button click in `ChangeSummaryBar.tsx:254` → `dispatchDiffReview` fires `agent-ide:open-diff-review` CustomEvent with `{ sessionId, snapshotHash, projectRoot, filePaths }` → window event listener in `ChatWorkbenchArtifactPane.tsx` (or `WorkbenchRightPane.tsx`) receives event → opens artifact pane with diff-review content slot mode → `AgentChatDiffReview.tsx` mounts with `useDiffReview` → IPC `orchestration.getDiffSummary(sessionId)` resolves with `{ files: DiffFile[] }` → component renders per-file list | The artifact pane on the right shows: a header with the file count and lines-added/removed tally, a per-file list with each modified file as an expandable row, per-file accept/reject buttons, syntax-highlighted diff lines. The pane is NOT empty. Cole can scroll, click into a file, and see the actual diff hunks. |
| D | Cole has two IDE windows open with active chat streaming in both, switches focus from window A to window B and back over 30 seconds, in a live multi-window session | Window A's main-process emit → IPC `agentChat:streamChunk` arrives at Window A's renderer → `useAgentChatStreaming` accumulates delta → `useRafBatchedChunks` queues delta → `document.hidden === true` detection fires → fallback flush via `setTimeout(0)` (or threshold-trigger when queue > 30) → `setStateMap` fires → React re-renders Window A's chat panel even while unfocused → Cole switches back to Window A and observes content advanced during the focus-elsewhere period | Window A's chat panel shows new tokens / tool calls / blocks that arrived while Window A was unfocused. The streaming indicator advanced. The persisted message render that catches up after completion is no longer the only thing the user sees post-switch — the LIVE render kept up. No long catch-up flash on focus-return. |
| E | Cole asks the IDE chat agent to dispatch `sonnet-implementer` via the Agent tool in a live IDE chat, repeats three times across two different prompts | Chat agent invokes Agent tool with `subagent_type: "sonnet-implementer"` → `claudeCodeSubagentHandler.ts` builds spawn argv + env + scoped MCP config → spawns child Claude Code process → child completes auth handshake → API request body assembled (system prompt + tools + messages) → API returns 200 with stream-json response → child streams progress back through `chatOrchestrationBridge*` → renderer renders the subagent tool card with status `pending` → status transitions to `complete` with the subagent's output text | Chat shows a subagent tool card that progresses from "running" to "complete" with the subagent's actual output text. The "API Error: Internal server error" message does NOT appear. The parent agent's turn does NOT stop mid-stream. Cole sees the subagent's reply rendered in the parent's tool card output. Repeats successfully across at least 3 different dispatches across at least 2 different prompts. |
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
