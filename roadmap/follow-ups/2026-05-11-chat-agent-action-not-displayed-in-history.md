---
status: OPEN
created: 2026-05-11
updated: 2026-05-11
---

# Agent action executed without a corresponding chat message in history

## Symptom

During Wave 84 Phase F smoke setup, Cole asked the agent to "go edit 10 files and add a test comment." Agent did it. Cole then said "remove them" — agent started, Cole cancelled. Cole then said "leave them for now" — agent acknowledged with a message in chat ("Understood — leaving the test comments in place").

Then later (after Cole asked "Actually go ahead and remove them"), the agent ran `git diff` and `grep`, found no test comments in any source files, and reported they were already gone. **But the user never saw any chat message corresponding to the removal action that erased them.**

Either:
- The agent silently performed the removal between the cancel and the "leave them" — possibly executing residual tool calls after cancel
- A chat message exists but isn't rendering in the conversation view
- The state is desynced between what the agent thinks happened and what's actually in the visible chat history

## Why this matters

If users can't see actions the agent takes, they can't trust the chat surface. This is a fundamental product-experience issue — distinct from the rules-disappear, heat-map, and queue bugs from Wave 84.

## Possible mechanisms (not yet investigated)

1. **Cancel doesn't actually cancel in-flight tool calls.** Cole hit cancel mid-removal; tool calls already dispatched may have completed despite cancel.
2. **Cancelled actions don't appear in chat history.** Render filter hides them — but the side effects remain.
3. **Conversation state desync.** The renderer's thread state was updated for some events but not others.
4. **The "leave them" prompt was reinterpreted.** Worth checking the prompt log for that turn — did the agent receive context that made it think removal was wanted?

## Investigation shape

1. Reproduce: ask agent to edit N files, cancel mid-edit, watch git status and chat history together.
2. Instrument cancel path: log every tool call started, every tool call completed, every cancel-signal received and what it stopped.
3. Compare what chat history shows vs what main process logged vs what git records.

## Related

This is a symptom of the broader state-architecture issues filed at `2026-05-11-chat-state-architecture-overhaul.md`. It probably gets addressed as part of that initiative rather than in isolation.

## Severity

High. Silent agent actions are a trust-breaking experience. Even if the action was correct (Cole did eventually want them removed), users need to see what happened.
