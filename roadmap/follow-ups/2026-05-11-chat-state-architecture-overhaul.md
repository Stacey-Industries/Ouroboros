---
status: OPEN
created: 2026-05-11
updated: 2026-05-11
priority: high
---

# Chat orchestration state architecture — needs a mapped overhaul, not bug-by-bug fixes

## Why this exists

Wave 84 was framed as six independent chat-lifecycle bugs. Across Phases A–F, each fix revealed adjacent issues that don't fit the "small unrelated bugs" framing:

- **Phase A** (rules disappear): root cause was a main-process suppression gate dropping `instructions_loaded` events from the chat's own headless subprocess. Two prior code-reading fix attempts targeted phantom causes. Required 3 instrumentation rounds + 4 commits.
- **Phase B** (heat-map): two prior code-reading fix attempts targeted the renderer pipeline. Actual bug was UX — toggle defaulted false, never persisted. After the fix landed, the full-rescan-per-state-change pattern surfaced as visible jank (heat-map borders fade in/out during bursty edits).
- **Phase D** (streaming freeze): hypothesis (rAF throttle on hidden windows) was disproven by instrumentation. Repro recipe (two windows) was also wrong — actual bug repros in single-window multi-chat-tab scenarios. `document.hidden` is the wrong signal anyway. Deferred.
- **Phase F** (queue draft): fix is in (commit `f87559be`) but exposed that send paths were reusing the edit-queued path because the state machine doesn't distinguish them by intent.
- **Mid-wave discoveries (separate follow-ups):**
  - `2026-05-11-context-preview-rules-evicted-after-time.md` — per-session agent records get evicted after extended activity; popover then queries a missing key.
  - `2026-05-11-context-preview-pre-send-missing-claude-md.md` — pre-send and post-send branches read from different data sources, showing inconsistent rule counts (18 vs 19).
  - `2026-05-11-chat-streaming-render-freeze-hypothesis-disproven.md` — bridge or subprocess buffers text_delta chunks; only 5 emit events across a 145s turn for an explanation that should stream incrementally.
  - "Test comments removed without a visible chat message" — observed by Cole during Phase F smoke setup. Either a chat-history render bug, an agent-action-not-shown bug, or a state-sync bug between threads.
  - ~100 stored sessions accumulating in renderer memory with no pruning.

## The pattern

These aren't unrelated bugs. They're symptoms of state-architecture leakage:

- **Main and renderer hold overlapping but desynced views** of session state (suppression in main doesn't stop renderer from acting on the suppressed events via other channels — see the `session_end` suppression observed at 15:32:21.536 followed by renderer still finding the agent record).
- **Multiple session-ID namespaces** exist for what users experience as one chat (hook-pipe UUID, stream-json UUID, thread UUID — Phase A's investigation found at least three).
- **State sources for "the same" information differ between code paths** (Phase A's pre-send `listRuleFiles` vs post-send `loadedRules`; Phase F's edit-vs-send paths reusing the same function with different intent).
- **Lifecycle events are fan-out without a single owner** — events flow to multiple reducers, multiple contexts, multiple panels, with no canonical "the chat session ended, drop everything related to it" path.
- **State is partially persisted, partially session-only, partially derived** with no clear contract for which is which.

Each Wave 84 fix patched one symptom of these underlying issues. The next bug-by-bug wave will spend 80% of its time chasing phantom causes again.

## Recommended initiative

Treat this as a Profile A (greenfield-shape) Stage 1 discovery, even though the chat surface exists. Goal is to MAP before fixing. The map deliverable should answer:

1. **State inventory**: every piece of chat-related state, where it lives (main vs renderer reducer vs Zustand vs context vs IPC vs localStorage), and who writes/reads it.
2. **Event flow**: every event that mutates chat state. For each: source channel (IPC named-pipe, hook pipe, stream-json, in-process), target reducers, side effects, ordering guarantees (or lack thereof).
3. **Lifecycle**: chat start → first message → tool calls → agent reply → tool calls → completion → idle. What state is created/updated/torn down at each transition. Cross-cutting: project switch, window close, app reload.
4. **Identity model**: which UUIDs identify what. Where they originate. Where they're conflated. Where they need to be aliased.
5. **Boundary leaks**: places where state in one process/store assumes a contract that's broken in practice (suppression bypass paths, session-end propagation, etc.).
6. **Persistence inventory**: what's persisted, where, what's NOT persisted but probably should be, what's persisted but probably shouldn't be.

From the map, design the overhaul. Likely shape: single per-thread state machine owned by main, with the renderer as a pure projection. But the map drives the design, not the other way around.

## Out of scope for this initiative

- Mention types (@url, @web, @thread, @diff/@commit) — these are feature additions, not state-architecture fixes.
- System prompt visibility (#21) — UX feature.
- Per-hunk accept/reject in diff review (#43) — separate wave.
- `AgentChatConversation.tsx` line-count refactor — known tech debt unrelated to state.

## Severity

High. The chat surface is the IDE's primary product experience. State-architecture issues compound and bug-by-bug fixing has shown diminishing returns. Investing in a map + targeted overhaul has much higher leverage than continuing piecemeal.

## Related artifacts to inherit

- `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/waveplan-84.md` — what was attempted, what landed, what was deferred.
- `roadmap/wave-84-chat-lifecycle-bug-fix-bundle/phase-0-results.md` — pre-flight repro check from this wave.
- `roadmap/foundation/agent-chat-best-practices/04-ouroboros-gap-analysis.md` — verdict-by-axis; PARTIAL items concentrated in chat-lifecycle.
- The Phase A `[trace:agent-record]` instrumentation — still in place; useful for the discovery work.
- The Phase B `[heat-map]` instrumentation — still in place.
- The Phase D `[trace:stream]` instrumentation — still in place.
- All `[trace:*]` instrumentation should be kept in place during the discovery; Phase Z's retain-vs-remove decision is deferred to after the overhaul plan.
