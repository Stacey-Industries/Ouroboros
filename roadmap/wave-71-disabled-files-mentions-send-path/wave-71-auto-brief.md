# Wave 71 — Result Brief

**Title:** Disabled file/mention IDs honored at chat send path
**Status:** Shipped
**Dates:** 2026-05-02 (single session)
**Branch:** `master`

## What shipped

Toggling a file or @mention off in the composer's context preview popover now actually drops it from the next send.

### The bug

`TOGGLEABLE_KINDS = ['file', 'mention', 'rule']`. Rules are routed by `useToggleHandler` to `fireRuleToggleIpc` → `toggleRuleFile` IPC (the Wave 62 filesystem mechanism, post-spawn-restored). Files and @mentions fall through to `toggleLocal` and end up in a renderer-only `useState` Set. That Set was never read by the send path — `buildContextSelection` always passed the full `contextFilePaths` and `mentionRanges` arrays.

UI: checkbox unticks. Send path: file/mention still injected. The "UI lies" pattern.

### The fix

State lifted from `ComposerContextPreview` into the workspace controller (`useControllerState`), wired through the zustand store + selectors, and threaded into `SendMessageArgs`:

- **`buildContextSelection(contextFilePaths, mentionRanges, disabledLocalIds?)`** — filters `contextFilePaths` against `file:<path>` IDs and `mentionRanges` against `mention:<i>:<label>` index encoding. Returns `undefined` when all files are filtered out (matching the existing "no files = no selection" contract).
- **`applyComposerSuccess`** — clears the local-disabled set after a successful send. Failure path does not clear (intent preserved for retry).
- **`ComposerContextPreview`** — now controlled when `disabledLocalIds` + `setDisabledLocalIds` props are passed; falls back to internal `useState` for non-chat mounts (backward compat).

### Wiring surface

- `agentChatWorkspaceActionHelpers.ts` — `buildContextSelection` accepts the disabled set; helpers added (`disabledFilePaths`, `disabledMentionIndexes`); `applyComposerSuccess` clears.
- `useAgentChatWorkspace.ts` — `useControllerState` owns the state; model exposes `disabledLocalIds` + `setDisabledLocalIds`.
- `agentChatStore.types.ts` / `agentChatStore.ts` — store types + defaults extended.
- `AgentChatWorkspace.storeSync.ts` — pushes the field/setter into the store.
- `agentChatSelectors.ts` — `useAgentChatContextFiles` exposes `disabledLocalIds`; `useAgentChatActions` exposes `setDisabledLocalIds`.
- `AgentChatConversation.tsx` / `AgentChatComposerSection.tsx` / `AgentChatComposer.tsx` — pass props through.
- `ComposerContextPreview.tsx` — `useLocalDisabledIds` accepts optional controlled `(ids, setter)` and switches modes.

## Tests

- **New** in `agentChatWorkspaceActionHelpers.test.ts`: 5 `buildContextSelection` cases (file filtering, mention index filtering, all-disabled returns undefined, empty set passes through, file/mention encoding); 2 `buildComposerRequest` cases (filtered through send path); 1 `applyComposerSuccess` case (clears on success).
- **New** in `ComposerContextPreview.test.tsx`: 2 controlled-mode cases (toggle invokes setter; prop drives checkbox state).
- **All 794 AgentChat tests pass.**
- **Pre-existing failures** (mobile-touch-targets, ChatWorkbenchShell.integration, ChatWorkbenchFollowThrough.integration, TitleBar.menus): verified failing on `master` before Wave 71 — not introduced by this wave.
- **Lint:** clean.
- **Typecheck:** clean (`tsc --noEmit`).

## Manual smoke gate

UI-bearing wave per `~/.claude/rules/manual-smoke-gate.md`. Smoke not yet performed — checklist items:

- [ ] Pin a file. Toggle it off in popover. Send. Verify file content NOT in agent's response context.
- [ ] @-mention a file. Toggle the mention off. Send. Verify the mention's file content NOT in context.
- [ ] Send a message with toggled-off items. Confirm the local set clears (popover shows them re-enabled on next open).
- [ ] Send a message that fails (e.g. no project root). Confirm the local set is preserved (next attempt still has them off).
- [ ] Toggle a rule (Wave 62 path). Confirm filesystem-disable still works unchanged.

## Follow-ups

- **Persistence per-thread (option B from the plan)** — defer until real users ask.
- **Mention index stability under list mutations** — current encoding is `mention:<index>:<label>`; if mentions are reordered while the popover is open, the index→range mapping could drift. Acceptable for v1 (popover lifetime is short); revisit if a user surfaces it.
- **Manual smoke completion before push** — required by the rule.

## ADR

`roadmap/wave-71-disabled-files-mentions-send-path/wave-71-decisions.md` — three decisions: (1) re-scope from rules to files/mentions after code verification, (2) lift state to workspace controller / controlled popover, (3) clear-on-success rather than persist per-thread.

## Files changed

```
roadmap/wave-71-disabled-files-mentions-send-path/waveplan-71.md           (re-scoped header)
roadmap/wave-71-disabled-files-mentions-send-path/wave-71-decisions.md     (new ADR)
roadmap/wave-71-disabled-files-mentions-send-path/wave-71-auto-brief.md    (this brief)
src/renderer/components/AgentChat/agentChatWorkspaceActionHelpers.ts       (filter + clear)
src/renderer/components/AgentChat/agentChatWorkspaceActionHelpers.test.ts  (8 new tests)
src/renderer/components/AgentChat/agentChatWorkspaceActions.ts             (model fields)
src/renderer/components/AgentChat/useAgentChatWorkspace.ts                 (controller state)
src/renderer/components/AgentChat/agentChatStore.ts                        (defaults)
src/renderer/components/AgentChat/agentChatStore.types.ts                  (types)
src/renderer/components/AgentChat/agentChatSelectors.ts                    (selector exposure)
src/renderer/components/AgentChat/AgentChatWorkspace.storeSync.ts          (sync field/setter)
src/renderer/components/AgentChat/AgentChatConversation.tsx                (pass to ComposerSection)
src/renderer/components/AgentChat/AgentChatComposerSection.tsx             (props + threading)
src/renderer/components/AgentChat/AgentChatComposer.tsx                    (props + threading)
src/renderer/components/AgentChat/ComposerContextPreview.tsx               (controlled mode)
src/renderer/components/AgentChat/ComposerContextPreview.test.tsx          (2 new tests)
```
