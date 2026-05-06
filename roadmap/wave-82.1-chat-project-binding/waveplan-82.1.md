# Wave 82.1 — Chat-Project Binding & Residual Polish

**Date opened:** 2026-05-03
**Predecessor:** wave 82 (round 2 closed 9/11; round 3 smoke surfaced 8 still-broken items)
**Owner:** continuation session

---

## Why this is its own wave

Wave 82 round-3 smoke surfaced an unanticipated structural defect — the chat-only workbench has **two parallel "active project" sources** that are not synchronized:

1. `LayoutState.activeProject` — what the workbench rail tracks. Gets passed correctly to `AgentChatWorkspace` via the `projectRoot` prop (round-2 F2 fix).
2. `ProjectContext.projectRoot` — derived from `projectRoots[0]` in the multi-root list. Read by `ComposerContextPreview` (rules popover), `WorkbenchRulesPanel` (utility drawer), `EditorContent` (artifact pane), and many other surfaces. **Not updated when the workbench rail switches projects.**

This explains the "16 user / 0 project rules in either project" symptom (popover queries the wrong project's rule files), the `WorkbenchRulesPanel` showing IDE-shell rules instead of workbench rules, and likely the chat-persistence-across-projects symptom.

Round 2's F2 fix only patched one consumer (`AgentChatWorkspace`'s thread reload). Wave 82.1 closes the binding loop.

## Scope

| ID                                       | Item                                                               | Status before                                                       |
| ---------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| C3/F2/rules cluster                      | Make project binding cohesive across all chat-only consumers       | Round-2 partial — only `AgentChatWorkspace` got the active project  |
| Chat persistence across project switches | Threads from project A still visible after switch to project B     | Pre-existing; surfaced when binding investigation began             |
| F1                                       | Edit→Exit toolbar in artifact pane                                 | Round-2 fix landed in `FileViewer.tsx` but symptom persists         |
| F1c                                      | Remaining decoration column next to minimap                        | Round-2 disabled scrollbar + ruler; another element still rendering |
| G timeline                               | Outer session card list does not scroll                            | Round-2 fixed inner expanded scroll; outer parent height unbounded  |
| B2                                       | Heat map didn't fire on real Claude `Edit`/`Write`                 | Round-2 fixed JSON path extraction; tool name set is stale          |
| F4                                       | UX clarification for "New Session" vs "New Chat in Active Session" | Question, not a bug — needs Cole's call                             |

## Approach

### C3/F2/rules cluster + chat persistence

The right fix is **not** to globally sync `ProjectContext` with `LayoutState.activeProject` — that would disturb the multi-root semantics IDE shell relies on. Instead:

1. Add `projectRoot: string | null` to the per-workspace `AgentChatStore`.
2. Sync it from the `AgentChatWorkspace`'s `projectRoot` prop in the existing wiring effect.
3. `ComposerContextPreview` reads `projectRoot` from the store, not `useProjectOptional()`.
4. `WorkbenchRulesPanel` accepts `activeProject` as a prop, threaded down from `ChatWorkbenchBody` (which has `layout.activeProject`).
5. `useThreadState` clears `threads` and `activeThreadId` immediately when `projectRoot` _changes_ (not on every reload — the round-2 optimistic fix for C1 stays for in-project add/delete).

This is structurally cleanest because the per-workspace store is the right scope for "this workspace's project" — it isolates the workbench's project choice from the rest of the renderer.

### Smaller items

- **F1c**: try `verticalScrollbarSize: 0` when minimap is on. The hidden vertical scrollbar's track may still occupy space.
- **G timeline outer scroll**: the drawer `<aside>` lacks `flex-1 min-h-0`, so it sizes to content height instead of filling its bounded parent.
- **B2 heat map**: `EDIT_TOOL_NAMES` set is missing the new MCP-style names (`write_file`, `edit_file`, `notebook_edit`). Per `AgentChat/CLAUDE.md`, the backend emits both legacy and new forms. Add the new ones.
- **F1**: needs runtime instrumentation — round-2 fix should be in the code path, but symptom persists. Add log lines to capture state during Edit→Exit cycle and have Cole repro.
- **F4**: report on the menu item distinction (New Session = new orchestration session + new thread; New Chat in Active Session = new thread inside the current orchestration session). UX call belongs to Cole.

## Verification

1. Manual round-4 smoke after fixes — same checklist shape as wave 82 round 3.
2. Scoped vitest: `test:agentchat`, `test:layout` after touching their files.
3. `npx tsc --noEmit` and `npm run lint` clean.
4. Cole's smoke replaces test for UI behavior — code passing tests is necessary but not sufficient.

## Files in scope

```
src/renderer/components/AgentChat/
  agentChatStore.types.ts      — add projectRoot field
  agentChatStore.ts            — default projectRoot null
  AgentChatWorkspace.tsx       — sync projectRoot into store
  AgentChatComposer.tsx        — read from store, pass through helper
  AgentChatComposer.helpers.ts — accept projectRoot in builder
  ComposerContextPreview.tsx   — accept projectRoot prop, prefer over context
  agentChatWorkspaceSupport.ts — clear thread state on projectRoot change

src/renderer/components/Layout/ChatOnlyShell/
  ChatWorkbenchUtilityDrawer.tsx — accept activeProject; aside layout fix
  ChatWorkbenchBody.parts.tsx    — thread activeProject to WorkbenchRightPane
  WorkbenchRightPane.tsx         — thread activeProject to drawer

src/renderer/components/FileViewer/
  MonacoEditor.hooks.ts          — verticalScrollbarSize 0 with minimap

src/renderer/hooks/
  useFileHeatMap.ts              — new tool name aliases

src/renderer/components/FileViewer/FileViewer.tsx (instrumentation only)
src/renderer/components/FileViewer/useFileViewerState.effects.ts (instrumentation only)
```
