---
status: OPEN
created: 2026-05-11
updated: 2026-05-11
---

# Context preview rules disappear after time / activity (session record evicted)

## Symptom

After Wave 84 Phase A's fix (commit `821435c1`) made post-send rules visible, a second issue surfaced: the rules are visible immediately after the first agent reply, but disappear later in the session. The popover's session-found branch shows `userRulesCount: 0`, and the underlying lookup shows `foundKey: null` — the per-session agent record was evicted from the renderer's `currentSessions` store entirely.

## Evidence

From Cole's repro on 2026-05-11 at 11:40:

- Earlier (~11:30 local), session `44364d19-4cb7-45fe-84e8-add1f8b30afa` showed `foundUserRulesCount: 19` post-send (CLAUDE.md + 18 rules — see also `2026-05-11-context-preview-pre-send-missing-claude-md.md`).
- After ~10 minutes of activity (project switching observed in the logs: Agent IDE then back to Gamify), the popover queried the same `44364d19-...` ID and got `foundKey: null`.
- The store still contained ~100 other session UUIDs — so this isn't a global wipe. The specific session record was removed.

Relevant log excerpt:

```
11:40:03.914 > [trace:agent-record] lookup {
  queriedSessionId: '44364d19-4cb7-45fe-84e8-add1f8b30afa',
  foundKey: null,
  foundUserRulesCount: 0,
  foundProjectRulesCount: 0,
  storeSessionIds: [ ... 100 entries, none matching '44364d19-...' ]
}
```

## Hypothesis

Some reducer path in `src/renderer/hooks/useAgentEvents.ts` (or wherever `currentSessions` is mutated) evicts the per-session record on a trigger we haven't identified yet. Candidates:

- `session_stop` / `agent_stop` / `agent_end` event removes the record entirely.
- Project switch in the renderer clears sessions scoped to the previous project.
- The chat's synthetic session is registered on launch via `beginChatSessionLaunch`, and its corresponding `endChatSessionLaunch` removes the record while the popover still has the stale `claudeSessionId`.
- The renderer's `claudeSessionId` source diverges from the storage key over time (e.g., session_id changes mid-conversation but the popover keeps the old value).

## Recommended investigation shape

1. **Add a `[trace:agent-record] evict` log** wherever the reducer removes a session from `currentSessions` (likely a `SESSION_END` or `SESSION_REMOVE` action handler). Capture the session ID and the trigger action type.
2. **Reproduce**: start chat, send message, confirm rules visible (19), then trigger the suspected eviction conditions one at a time:
   - Switch projects → check.
   - Wait N minutes idle → check.
   - Start second chat in same project → check.
   - End chat thread / clear chat → check.
3. From the evict log, pick the right fix shape: either prevent eviction while the popover might still reference the ID, or invalidate the popover's `claudeSessionId` when its session is evicted (forcing it back to the no-session branch which reads files directly).

## Out of scope (deferred)

- The "store grows unboundedly to 100+ session UUIDs across IDE lifetime" issue is visible in the same logs. File separately if not already filed; this is memory growth, distinct from this eviction issue.
- The CLAUDE.md absence in the pre-send branch is its own follow-up (`2026-05-11-context-preview-pre-send-missing-claude-md.md`).

## Severity

Medium. Rules ARE visible at the immediate point Phase A targeted (first agent reply). The disappearance happens during extended sessions, which is the more common case in practice. Closing this would complete the user-visible promise of Wave 84 bug 1.

## Why this wasn't caught in Phase A

The Phase A acceptance criterion was "rules visible before AND after first agent reply." The fix satisfies that exactly. The eviction surfaces only after extended activity that wasn't in the original repro recipe. Updating Wave 84 hindsight: include "wait N minutes / switch projects / start a second chat" in the smoke checklist for similar lifecycle bugs.
