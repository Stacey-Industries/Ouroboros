# Manual smoke gate — checklist template

Required for any wave touching `src/renderer/components/Layout/**`. Green CI is not sufficient — Wave 47 shipped with multiple BLOCKER UX defects despite all tests passing, because the tests measured implementation shape, not user experience. The manual smoke gate is the missing layer.

Rule: `~/.claude/rules-deferred/manual-smoke-gate.md` (cold-loaded at wave end for UI-bearing changes).

## How to use

Copy the block below into the wave's result brief (`roadmap/wave-{N}-{slug}/wave-{N}-result.md`) and fill in each item before pushing. The signed entry is mandatory for any UI-bearing wave; absence blocks merge.

## Checklist

```
Wave: ___  Date: ___  Tester: ___

Launch
[ ] App launches with `layout.chatWorkbench: true` set in config.
[ ] No white borders visible anywhere in the workbench shell.
[ ] No debug labels visible (e.g. "Active utility:", enum dumps, testid text).
[ ] No developer scaffold visible (e.g. pill toggle rows, raw state dumps).

Rail
[ ] Workbench rail renders with correct groups (active sessions / background / recent chats).
[ ] New session button: creates a session AND navigates the conversation pane to it.
[ ] Launch agent button: opens the multi-session launcher overlay.
[ ] Clicking a session row: activates that session and navigates to its thread.
[ ] Right-click a session row: context menu appears with Delete / Archive.
[ ] Right-click a chat row: context menu appears with Pin/Unpin / Rename / Delete.
[ ] Rail collapse toggle: rail collapses to icon-only width; toggles back.

Utility drawer
[ ] Drawer does not open on first paint (no pending approvals, no diff review).
[ ] Activity tab: renders timeline (or "No timeline entries yet." if empty).
[ ] Approvals tab: renders approval panel (or "No approvals are waiting." if empty).
[ ] Review tab: renders diff review panel (or "No diff review is pending." if empty).
[ ] Rules tab: renders rules panel with Rules / Rule Files sections.
[ ] Subagents tab: renders subagent panel or empty state.
[ ] Close button in drawer header: dismisses the drawer.
[ ] After dismissing, same-trigger event does NOT re-open the drawer.

User menu
[ ] User menu trigger visible in rail footer.
[ ] Settings (Ctrl+,): opens settings overlay.
[ ] Theme toggle: switches theme immediately.
[ ] Keyboard shortcuts (Ctrl+/): opens cheat sheet overlay.
[ ] Command palette (Ctrl+K): opens palette.
[ ] Exit chat mode: returns to IDE shell.

Approvals integration
[ ] Trigger an agent tool-call that requires approval.
[ ] Utility drawer auto-opens to Approvals tab.
[ ] Approving the request: drawer stays open, request cleared.
[ ] Dismissing drawer: does not re-open when same request is still pending.

Exit
[ ] Exit button / Ctrl+Shift+I: IDE shell mounts cleanly, no console errors.
[ ] Re-entering workbench mode: shell state restores (rail open, last tab).

Signature: ___________________________  (wave author or designated reviewer)
```

## History

Established Wave 58+ (2026-05). Originally embedded in `roadmap/session-handoff.md`; extracted to its own reference doc 2026-05-13 as part of the doc-framework migration (`HANDOFF.md` is now lean orientation; reference templates live here in `docs/`).
