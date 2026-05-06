# Wave 82.1 — Result Brief

**Date:** 2026-05-03
**Status:** code-complete, smoke-pending
**Predecessor:** wave 82 round 3

---

## TL;DR

Round-3 smoke surfaced a structural defect: the chat-only workbench had two parallel "active project" sources (`LayoutState.activeProject` for the rail, `ProjectContext.projectRoot` for everything else) that were not synchronized. Wave 82.1 closes that loop by mirroring the workbench's active project into the per-workspace `AgentChatStore`, then making downstream consumers read from there. Plus three smaller fixes (heat map tool names, minimap track width, timeline outer scroll) and one piece of instrumentation for F1.

7 of 8 round-3 items addressed in code. F1 needs runtime data — instrumentation in place. F4 is a UX call that needs Cole's input.

## Quality gates

- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors, 3 pre-existing warnings (same baseline as wave 82)
- Scoped vitest (AgentChat + ChatOnlyShell): all green except the same pre-existing failures noted in the wave-82 baseline (`ChatWorkbenchShell "subagents tab"` — unrelated, `useToastContext` provider issue in test setup)

## What changed

### C3/F2/rules cluster — chat-project binding

**Root cause:** `ProjectContext.projectRoot` is `projectRoots[0]` of the multi-root list. When the workbench rail switches projects, `LayoutState.activeProject` updates but `ProjectContext` does not. `ComposerContextPreview` (rules popover) and `WorkbenchRulesPanel` (utility drawer) both read from `ProjectContext`, so they queried the wrong project's rule files / MCP servers / memory entries — explaining "16 user / 0 project rules in either project."

**Fix:**

1. `agentChatStore.types.ts` + `agentChatStore.ts` — added `projectRoot: string | null` to `AgentChatThreadState`.
2. `agentChatSelectors.ts` — added `useChatProjectRoot()` selector hook.
3. `AgentChatWorkspace.tsx` — new effect in `useWorkspaceWiring` mirrors `props.projectRoot` into the store.
4. `AgentChatComposer.tsx` — reads `useChatProjectRoot()` and passes through `buildChatOnlyContextPreviewProps`.
5. `AgentChatComposer.helpers.ts` — accepts `projectRoot` arg, forwards to `ComposerContextPreview`.
6. `ComposerContextPreview.tsx` — accepts `projectRoot` prop, prefers it over `useProjectOptional()`. Falls back to context for IDE-shell mounts that don't pass the prop.
7. `ChatWorkbenchUtilityDrawer.tsx` — `WorkbenchRulesPanel` now accepts `projectRoot` instead of reading `useProject()`. `DrawerContent` and `ChatWorkbenchUtilityDrawer` thread `activeProject` through.
8. `WorkbenchRightPane.tsx` — accepts `activeProject` prop, threads to drawer.
9. `ChatWorkbenchBody.parts.tsx` — `WorkbenchSidePanels` passes `layout.activeProject`.
10. `ChatWorkbenchBody.tsx` — `MobileRightPaneContent` does the same for mobile.

### Chat-persistence-across-projects

**Root cause:** When `projectRoot` changes (rail switches projects), the existing `useReloadThreads` is async and the wave-82 round-2 C1 fix removed the pre-fetch clear (to avoid the "No chats yet" flash on add/delete cycles). So during the await window, the conversation pane kept showing the previous project's active thread.

**Fix:**

11. `agentChatWorkspaceSupport.ts` — new `useClearThreadStateOnProjectChange` hook clears `threads` and `activeThreadId` immediately on `projectRoot` _change_ (using a ref to detect transitions). First-mount and same-project add/delete cycles are unaffected — C1's optimistic update still works.

### G — Timeline outer card scroll

**Root cause:** `ChatWorkbenchUtilityDrawer`'s `<aside>` had `flex flex-col` with default `flex: 0 1 auto`, so it sized to content height. Inner `WorkbenchTimelinePanel` had `flex-1` but its parent (the aside) wasn't bounded — `overflow-y-auto` on the inner group list never triggered because there was no bounded ancestor.

**Fix:**

12. `ChatWorkbenchUtilityDrawer.tsx` — added `min-h-0 flex-1 overflow-hidden` to the aside. It now fills its bounded parent in `WorkbenchRightPane`, and the inner timeline list scrolls correctly.

### B2 — Heat map silent failure

**Root cause:** `EDIT_TOOL_NAMES` in `useFileHeatMap.ts` only matched legacy Claude Code tool names (`Write`, `Edit`, etc.). The backend also emits new MCP-style names (`write_file`, `edit_file`, `notebook_edit`). Per `AgentChat/CLAUDE.md`, both forms must be handled — the same dual-list exists in `FILE_MODIFYING_TOOLS_SET`. Cole's "had Claude write a test.md" call almost certainly emitted `write_file`, which wasn't in the heat map's set.

**Fix:**

13. `useFileHeatMap.ts` — added `write_file`, `edit_file`, `notebook_edit`, `MultiEdit`, `multi_edit` to the set.

### F1c — Remaining minimap ruler

**Root cause:** `scrollbar.vertical: 'hidden'` hides the scrollbar handle but Monaco still reserves the 14px track width. Cole saw it as a "non-interactive bar."

**Fix:**

14. `MonacoEditor.hooks.ts` — added `verticalScrollbarSize: 0` and `verticalSliderSize: 0` and `useShadows: false` when minimap is on. The reserved column width collapses to 0.

### F1 — Toolbar disappears in artifact pane (instrumentation only)

The wave-82 round-2 fix in `FileViewer.tsx` is in the correct code path — the artifact pane uses the same `EditorContent` → `FileContentView` → `FileViewer` chain. But the symptom persists. Per `debug-before-fix`, instrumentation is in place rather than another guessed fix.

**Instrumentation:**

15. `FileViewer.tsx` — `renderInitialViewerState` now logs which branch fires (and the resolved props state) on every render. When Cole reproduces F1, the dev-tools console will show whether the chrome stayed mounted (so the bug is downstream — likely in `ContentRouter` or `useResetViewerUi`) or whether one of the early-return EmptyState/LoadingState paths fired (so the round-2 fix didn't actually catch the failing condition).

**Action item for Cole:** repro F1, share console log lines starting with `[trace:FileViewer]` covering the Edit click → Exit click cycle.

### F4 — Menu collapse: "New Session" + "New Chat in Active Session" → "New Chat"

**Decision (Cole, 2026-05-03):** the two menu items had no user-visible distinction. Sessions are not surfaced as distinct entities in the UI — both items effectively created a new chat from the user's perspective. The split exposed an internal data-model distinction (sessions vs threads) that doesn't earn its menu real estate.

**Change:** collapsed both into a single **New Chat** entry (Ctrl+N). The action still dispatches `WORKBENCH_NEW_SESSION_EVENT` so the canonical handler chain (`handleCreateSession` → orchestration session row + thread + activation + selection) stays untouched. Branching is unaffected — that's a per-message affordance, not a menu item.

**Files:**

- `TitleBar.workbench.menus.ts` — single "New Chat" entry, removed `WORKBENCH_NEW_CHAT_EVENT` import.
- `useWorkbenchMenuEvents.ts` — removed `startNewChatViaStore` and the `WORKBENCH_NEW_CHAT_EVENT` listener; deleted now-unused `useContext` and `AgentChatStoreContext` imports.
- `appEventNames.ts` — deleted the `WORKBENCH_NEW_CHAT_EVENT` constant with a tombstone comment.
- `TitleBar.menus.test.ts` — assertions updated for the new label; legacy labels asserted absent.

## Files touched

**Implementation (18):**

```
src/renderer/components/AgentChat/
  agentChatStore.ts
  agentChatStore.types.ts
  agentChatSelectors.ts
  agentChatWorkspaceSupport.ts
  AgentChatWorkspace.tsx
  AgentChatComposer.tsx
  AgentChatComposer.helpers.ts
  ComposerContextPreview.tsx

src/renderer/components/Layout/
  TitleBar.workbench.menus.ts    (F4: menu collapse)

src/renderer/components/Layout/ChatOnlyShell/
  ChatWorkbenchBody.tsx
  ChatWorkbenchBody.parts.tsx
  ChatWorkbenchUtilityDrawer.tsx
  WorkbenchRightPane.tsx
  useWorkbenchMenuEvents.ts      (F4: dead listener removal)

src/renderer/components/FileViewer/
  FileViewer.tsx                 (instrumentation only)
  MonacoEditor.hooks.ts

src/renderer/hooks/
  appEventNames.ts               (F4: WORKBENCH_NEW_CHAT_EVENT removed)
  useFileHeatMap.ts
```

**Test fixes (2):**

```
src/renderer/components/AgentChat/AgentChatComposer.test.tsx
  (added useChatProjectRoot to the agentChatSelectors mock)

src/renderer/components/Layout/TitleBar.menus.test.ts
  (F4: updated assertions for the collapsed menu)
```

**Docs (2):**

```
roadmap/wave-82.1-chat-project-binding/
  waveplan-82.1.md
  wave-82.1-result.md
```

## Round 4 smoke checklist (for Cole)

```
[ Conversation pane did not clear, existing stayed up] Open chat-only workbench. Switch rail to Project A → "+ New chat" → send a message. Switch rail to Project B. Conversation pane should clear (no chats from A visible). Open the rules popover — should show Project B's actual rule counts (user + project), not 16/0.
[Same issue as above basically, it didn't change from project As rule. ] In Project B, repeat: open the popover, see Project B's project rules.
[Same as above ] Switch back to Project A. Conversation pane shows A's chats again.
[X] Right-click a chat → Delete. No "No chats yet" flash (round-2 C1 still works).
[X ] Open utility drawer → Activity tab. Many session cards: outer list scrolls (you can reach session cards below the fold). Expanded session content also scrolls (round-2 G still works).
[X ] Open utility drawer → Rules tab. Should show the active project's rules.
[There is still a miniature scrollbar showing, but it might be the minimaps scroll bar, and it might have a big semi clear scroll bar and then one that is thin and blue ] Toggle Minimap on. The decoration column right of the minimap should be gone (no leftover scrollbar track).
[ ] In chat, ask Claude to write a test file. Toggle file-tree heat-map. Edited file should show a colored left-border. Toggle off → border disappears.
[Still broken, I have to close it or click away and click back for it to show again - pre click element - <div style="flex-shrink: 0; display: flex; align-items: center; gap: 6px; padding: 3px 12px; border-bottom: 1px solid var(--border-subtle); background-color: var(--surface-panel); user-select: none;"><button title="Toggle word wrap (Alt+Z)" style="padding: 2px 8px; font-size: 0.6875rem; font-family: var(--font-ui); font-weight: 500; border-radius: 4px; cursor: pointer; line-height: 1.5; border-width: 1px; border-style: solid; border-color: var(--interactive-accent); border-image: initial; background-color: var(--interactive-accent); color: var(--text-on-accent);">Wrap</button><button title="Toggle minimap" style="padding: 2px 8px; font-size: 0.6875rem; font-family: var(--font-ui); font-weight: 500; border-radius: 4px; cursor: pointer; line-height: 1.5; border-width: 1px; border-style: solid; border-color: var(--interactive-accent); border-image: initial; background-color: var(--interactive-accent); color: var(--text-on-accent);">Minimap</button><button title="Toggle git blame annotations" style="padding: 2px 8px; font-size: 0.6875rem; font-family: var(--font-ui); font-weight: 500; border-radius: 4px; cursor: pointer; line-height: 1.5; border-width: 1px; border-style: solid; border-color: var(--border-semantic); border-image: initial; background-color: transparent; color: var(--text-muted);">Blame</button><button title="Toggle symbol outline" style="padding: 2px 8px; font-size: 0.6875rem; font-family: var(--font-ui); font-weight: 500; border-radius: 4px; cursor: pointer; line-height: 1.5; border-width: 1px; border-style: solid; border-color: var(--border-semantic); border-image: initial; background-color: transparent; color: var(--text-muted);">Outline</button><button title="Toggle commit history for this file" style="padding: 2px 8px; font-size: 0.6875rem; font-family: var(--font-ui); font-weight: 500; border-radius: 4px; cursor: pointer; line-height: 1.5; border-width: 1px; border-style: solid; border-color: var(--border-semantic); border-image: initial; background-color: transparent; color: var(--text-muted);">History</button><div style="flex: 1 1 0%;"></div><div style="display: flex; align-items: center; gap: 4px;"><button title="Edit file" style="padding: 2px 8px; font-size: 0.6875rem; font-family: var(--font-ui); font-weight: 500; border-radius: 4px; cursor: pointer; line-height: 1.5; border-width: 1px; border-style: solid; border-color: var(--border-semantic); border-image: initial; background-color: transparent; color: var(--text-muted);">Edit</button></div></div> and post click - <div style="flex-shrink: 0; display: flex; align-items: center; gap: 6px; padding: 3px 12px; border-bottom: 1px solid var(--border-subtle); background-color: var(--surface-panel); user-select: none;"><button title="Toggle word wrap (Alt+Z)" style="padding: 2px 8px; font-size: 0.6875rem; font-family: var(--font-ui); font-weight: 500; border-radius: 4px; cursor: pointer; line-height: 1.5; border-width: 1px; border-style: solid; border-color: var(--interactive-accent); border-image: initial; background-color: var(--interactive-accent); color: var(--text-on-accent);">Wrap</button><button title="Toggle minimap" style="padding: 2px 8px; font-size: 0.6875rem; font-family: var(--font-ui); font-weight: 500; border-radius: 4px; cursor: pointer; line-height: 1.5; border-width: 1px; border-style: solid; border-color: var(--interactive-accent); border-image: initial; background-color: var(--interactive-accent); color: var(--text-on-accent);">Minimap</button><button title="Toggle git blame annotations" style="padding: 2px 8px; font-size: 0.6875rem; font-family: var(--font-ui); font-weight: 500; border-radius: 4px; cursor: pointer; line-height: 1.5; border-width: 1px; border-style: solid; border-color: var(--border-semantic); border-image: initial; background-color: transparent; color: var(--text-muted);">Blame</button><button title="Toggle symbol outline" style="padding: 2px 8px; font-size: 0.6875rem; font-family: var(--font-ui); font-weight: 500; border-radius: 4px; cursor: pointer; line-height: 1.5; border-width: 1px; border-style: solid; border-color: var(--border-semantic); border-image: initial; background-color: transparent; color: var(--text-muted);">Outline</button><button title="Toggle commit history for this file" style="padding: 2px 8px; font-size: 0.6875rem; font-family: var(--font-ui); font-weight: 500; border-radius: 4px; cursor: pointer; line-height: 1.5; border-width: 1px; border-style: solid; border-color: var(--border-semantic); border-image: initial; background-color: transparent; color: var(--text-muted);">History</button><div style="flex: 1 1 0%;"></div><div style="display: flex; align-items: center; gap: 4px;"><button title="Edit file" style="padding: 2px 8px; font-size: 0.6875rem; font-family: var(--font-ui); font-weight: 500; border-radius: 4px; cursor: pointer; line-height: 1.5; border-width: 1px; border-style: solid; border-color: var(--border-semantic); border-image: initial; background-color: transparent; color: var(--text-muted);">Edit</button></div></div>] Open a file in artifact pane → Edit → Exit. If the toolbar disappears, open dev tools (F12) → Console → filter for `[trace:FileViewer]` and share the lines from before/after Exit click. (Don't reload — we need the trace from the moment of failure.)
[ ] F4 question — pick (a/b/c) above for the two New Session/New Chat menu items.

Smoke signed: ____________ on ____________
```

## Things to NOT do

- Do not push without Cole's OK after round-4 smoke.
- Do not remove the F1 instrumentation until F1 is closed.
- Do not change `ProjectContext` — IDE shell still relies on the multi-root[0] convention. The store-mirror approach in this wave keeps that intact.
