---
status: OPEN
created: 2026-05-07
updated: 2026-05-07
---

# Context preview popover — User and Project rules disappear once a chat starts

## Symptom

In the chat-only shell, the context preview popover above the composer shows User rules and Project rules correctly **before** a chat is started. As soon as the first message is sent (chat session begins), the User and Project rules entries disappear from the popover. Other tabs/sections appear unaffected (to be confirmed during investigation).

## Repro (rough — to be tightened during B0)

1. Open IDE, chat-only shell.
2. Open the context preview popover above the composer — User rules + Project rules visible.
3. Send any message to start a chat session.
4. Reopen the popover — User and Project rules entries are gone.

## Suspect surface

- `src/renderer/components/AgentChat/ContextPreview.popover.tsx`
- `src/renderer/components/AgentChat/ContextPreview.tsx`
- `src/renderer/hooks/useContextPreview.ts` (model assembly)
- Whatever loads `loadedRules` / `useFilesystemDisabledRuleIds` and is keyed on session/cwd state

## Related (likely different but adjacent)

- `outstanding-2026-05-03.md` line 15 — "User-level rules not loading in contractor-app IDE chat popover — investigate `useFilesystemDisabledRuleIds` / `loadedRules` on different cwd shape." That one is contractor-app; this one is Agent IDE. May share a root cause (session-scoped cwd shape changing on start) — verify during B0.

## Investigation plan (when picked up)

Per `~/.claude/rules/debug-before-fix.md`, instrument first:

1. `log.info('[trace:ctx-preview] model items', { phase: 'before-send', userRules, projectRules, sessionId })` at popover open before a session exists.
2. Same line at popover open after a session has started — compare what changed in the model between the two opens.
3. Log the cwd / workspace root used to resolve rules at both points — likely diverges across the boundary.
4. Only after observing the divergence, propose a fix.

## Priority

Medium — visibility regression, not data loss. User noticed during normal chat use, said "to check up on later." Wave 84 is taking the next slot.
