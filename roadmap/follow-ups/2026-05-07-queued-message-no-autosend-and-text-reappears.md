---
status: OPEN
created: 2026-05-07
updated: 2026-05-07
---

# Queued message never auto-sends; force-send leaves text in the composer

## Symptom

Two related defects in the chat queued-message flow:

1. **No auto-send on agent completion.** While the agent is mid-turn, the user can queue a follow-up message via the composer. When the agent finishes its turn, the queued message is **not** automatically sent to start the next turn. It just sits in the queued list.
2. **Force-send doesn't clear the queued payload from the composer.** When the user manually triggers a force-send of the queued message, the message does send (the agent receives it and starts processing), but the text **also reappears in the composer** — as if the queue's "edit" path fired in addition to (or instead of just) the send path.

## Repro (rough — to be tightened during B0)

1. Send a message to an agent that takes a while to complete (long task, multiple tools).
2. While the agent is still working, type a second message into the composer and submit it — it goes into the queued-messages list (visible above/around the composer).
3. Wait for the agent to finish.
4. Observe (a): the queued message does NOT auto-fire; the user is required to hand it through.
5. Force-send the queued message.
6. Observe (b): the message sends, AND the text content of that queued message ends up back in the composer textarea.

## Suspect surface

- `src/renderer/components/AgentChat/useAgentChatWorkspace.queue.ts` — owns queue state. **Notable absence:** no flush-on-completion logic anywhere in this file. `addToQueue`, `editQueuedMessage`, `deleteQueuedMessage` are the only mutators. No subscriber to `'thread_complete'` / `'agent_complete'` / `status: 'idle'` that drains the queue. This is the most-likely root of defect (1) — auto-send is **not implemented**, not broken.
- `src/renderer/components/AgentChat/useAgentChatWorkspace.queue.ts:56-65` (`editQueuedMessage`) — when invoked, calls `setDraft(item.content)` AND removes the item from queue. **This is the smoking gun for defect (2):** if "force-send" is wired to a path that calls `editQueuedMessage` (which moves the queued item back into the composer draft) and then independently triggers `sendMessage`, both effects fire — the message sends AND the composer gets repopulated.
- `src/renderer/components/AgentChat/AgentChatConversation.tsx` — renders queued-message UI (per CLAUDE.md "Handles message grouping, auto-scroll, streaming overlay, composer placement, queued messages"). Likely contains the force-send button wiring.
- `src/renderer/components/AgentChat/agentChatWorkspaceActions.ts` — `sendMessage` action.
- `src/renderer/components/AgentChat/useAgentChatDraftPersistence.ts` — per-thread draft persistence; if the force-send doesn't explicitly clear the draft, the persisted draft could also be the source of the reappearance.

## Likely failure modes (enumerate during B1, not fix yet)

1. **Auto-send is not implemented at all.** No effect/listener watches for thread status `'idle'` / completion events to flush the queue. (Most likely — the queue file has no such hook and a quick grep for `queue.*flush`/`drainQueue` against chat code finds only telemetry hits.)
2. **Force-send button calls `editQueuedMessage` (which restores draft) and then `sendMessage` separately.** Order: `editQueuedMessage` removes item + restores draft → `sendMessage` sends the draft and clears it. If `sendMessage`'s clear step has a stale closure or runs before the restore, the draft is left non-empty.
3. **Send path doesn't clear the persisted draft.** `useAgentChatDraftPersistence` re-hydrates from localStorage on next render after force-send wrote it.

## Investigation plan (when picked up)

Per `~/.claude/rules/debug-before-fix.md`, instrument before fixing:

**Defect (1) — auto-send:**

1. `log.info('[trace:queue] thread status change', { threadId, status, queuedCount })` in whatever effect watches thread status. If no such effect exists, the log won't appear — that itself confirms hypothesis 1.
2. Confirm with a grep: any `useEffect` whose deps include `thread.status` or equivalent and reads `queuedMessages`. If none, root cause confirmed.

**Defect (2) — composer repopulation:**

1. `log.info('[trace:queue] force-send invoked', { messageId, content })` at the click handler.
2. `log.info('[trace:queue] editQueuedMessage called', { messageId })` at the start of `editQueuedMessage` in `queue.ts:56`.
3. `log.info('[trace:queue] sendMessage called', { content, draftAfter })` immediately before and after the send.
4. The log order will tell us whether `editQueuedMessage` fired (hypothesis 2) or whether the draft persisted from another path (hypothesis 3).

Only after observing the log order, propose a fix. The likely shape: a single `forceSendQueuedMessage(id)` action that removes the item from queue, sends its content directly via `sendMessage`, and **does not** touch `setDraft`. Auto-send becomes the same action invoked from a `thread.status === 'idle' && queuedMessages.length > 0` effect.

## Priority

Medium-high — workflow defect (user has to manually drive a feature whose entire premise is automation), and the force-send misbehavior makes the manual workaround feel broken. Both defects share a single fix surface. User flagged "to follow up on later." Not in Wave 84.

## Related

- Adjacent open follow-ups: `2026-05-07-context-preview-rules-disappear-after-chat-start.md`, `2026-05-07-full-review-artifact-pane-empty.md`, `2026-05-07-chat-streaming-freezes-on-project-switch.md`. The growing pile of chat-only-shell post-chat-start state-management bugs may warrant a dedicated chat-state-machine wave; consider for triage at next sweep.
