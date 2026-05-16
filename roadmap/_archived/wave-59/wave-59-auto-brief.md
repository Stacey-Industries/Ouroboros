# Wave 59 — Workbench Reshape (Piebald-Inspired IA) — Result Brief

**Status:** ✅ COMPLETED — 2026-04-27 · Released as v2.8.0
**Plan:** `roadmap/wave-59-plan.md`

## Summary

Wave 59 collapses the previous three UI states (IDE / plain chat-only / workbench)
into two (IDE / workbench) by retiring the `chatWorkbench` flag and making the
workbench the only chat shell. The reshape adds:

- A two-tier rail (outer icon column of projects + inner sidebar with Chats /
  Terminals / Code tabs).
- A workbench-specific top menu bar (File / Edit / View / Tools / Help).
- Chat search across the active project's threads.
- A context preview strip above the composer showing what the next prompt will
  carry, with toggleable file + mention items.
- A model-picker overhaul (correct labels, per-model effort matrix, solid
  dropdown background).
- HTML preview discoverability (HTML / Markdown files default to preview mode;
  assistant messages that write HTML files render an inline Preview chip).

## Phases shipped

| Phase | Commits | Files of note |
| --- | --- | --- |
| A — retire `chatWorkbench` flag | `3b2b042` | `ChatOnlyShell.tsx`, `useChatWorkbenchFlag.ts` (deleted), `configSchemaTailExt.ts`, `electron-foundation.d.ts` |
| B — two-tier rail | `dd30bc0` | `OuterProjectRail.tsx`, `InnerSidebar.tsx`, `ChatWorkbenchBody.parts.tsx` |
| C — top menu bar | `a69b7e7`, `a78cc11` | `WorkbenchMenuBar.{tsx,parts.tsx,state.ts,styles.ts}`, `TitleBar.workbench.menus.ts`, `ChatOnlyTitleBar.tsx` |
| D — inner sidebar tabs | `2ff0be3` | `InnerSidebarChats.tsx`, `InnerSidebarTerminals.tsx`, `InnerSidebarCode.tsx`, `ChatWorkbenchBody.parts.tsx` wiring |
| E — chat search | `7e8916c` | `ChatSearchOverlay.tsx`, `useChatSearch.ts` |
| F — context preview | `b9614e1` | `ContextPreview.tsx`, `ComposerContextPreview.tsx`, `useContextPreview.ts` |
| G — model picker | `a38c5b1`, `2fa03b5` | `ChatControlsBar.tsx`, `RerunMenu.tsx`, `RerunMenu.state.ts`, `modelEffortMatrix.ts`, `globals.css` (frosted overlay rule) |
| H — HTML preview | `1ad591b` | `useFileViewerState.effects.ts`, `InlineArtifactChip.tsx`, `AgentChatMessageComponents.assistant.tsx` |
| I — capstone | this commit | `wave59ReshapeIntegration.test.tsx`, this brief, plan status flip |

## Tests added

- Unit + smoke tests for every new file (`*.test.{ts,tsx}` next to source).
- Cross-tier integration test in
  `src/renderer/components/Layout/ChatOnlyShell/wave59ReshapeIntegration.test.tsx`
  exercising:
  - Outer rail + inner sidebar render together.
  - Inner sidebar tabstrip dispatches `setActiveInnerTab` on tab clicks.
  - Code tab mounts FileTree with `projectRoots` scoped to the active project.
  - Terminals tab shows the unavailable message when no terminal API is provided.
  - The workbench menu bar dispatches `agent-ide:workbench-toggle-outer-rail`
    when the View → Toggle Outer Rail item is activated.

## Verification

- `npx tsc --noEmit -p tsconfig.web.json` — clean.
- `npx eslint .` — clean on touched files; pre-existing orphans
  (`tools/__fixtures__/...`) untouched.
- `npx vitest run` — full suite to be run before push (results below).

## Deferred follow-ups

- **Memory tab in context preview** is intentionally an empty state — there is
  no IPC surface to read MEMORY.md from the renderer today. Wire when that
  bridge lands.
- **Disabled-IDs in context preview** are visual-only at the moment; the send
  path does not yet honour the toggle. Tracked separately.
- **Terminal-row project filter** in `InnerSidebarTerminals` is deferred —
  `TerminalSession` doesn't carry a `cwd` field today; filter is one map call
  away once it does.
- **Outer rail project list source of truth** — the rail currently merges
  `projectRoots` and `config.recentProjects`. A dedicated
  `config.layout.workbenchProjects` array is mentioned in the plan; defer
  until the multi-project workflow demands it.

## Manual smoke gate

Per `~/.claude/rules/manual-smoke-gate.md`, this UI-bearing wave requires a
signed manual smoke entry before push. **The user (orchestrator) must complete
the checklist below by launching the built app, exercising the listed
behaviour, and ticking each box** — the agent is not authorised to sign on the
user's behalf.

```
## Manual smoke gate
- [ ] Launched app with the wave's flag(s) on
- [ ] Title bar: every visible control clicked, behavior verified
      (sidebar toggle, project name, exit chat mode, window controls,
      File / Edit / View / Tools / Help menu items each fire)
- [ ] Each panel opened and closed via its own affordance (not via dev tools / config edit)
      (outer rail, inner sidebar Chats / Terminals / Code tabs, utility drawer,
      terminal dock, artifact pane)
- [ ] Every interactive control in the touched surface fires a real action
- [ ] No debug labels visible (no enum dumps, no "Active X: …" patterns, no untranslated state)
- [ ] No white-on-dark / fabricated-token borders
- [ ] No console errors on cold boot or first interaction
- [ ] Existing surfaces (menus, overlays, keyboard shortcuts) still reachable
- [ ] Wave-59 specific:
      - [ ] Switching projects via the outer rail repopulates the inner sidebar's three tabs
      - [ ] "+ New session" / "+ New terminal" affordances work
      - [ ] HTML file opens directly to preview mode (not code)
      - [ ] Assistant message that writes an .html file renders the inline Preview chip; click opens the artifact
      - [ ] Chat search overlay opens via Ctrl+F, the View menu, AND the outer rail Search icon
      - [ ] Context preview strip above the composer shows correct counts; expanding works; toggling a file off greys it
      - [ ] Model picker labels read "Opus 4.7 1M / Opus 4.7 / Sonnet 4.6 / Haiku 4.5 / Auto"
      - [ ] Selecting Haiku hides the effort selector entirely
      - [ ] Selecting Sonnet shows low / medium / high / max (no xhigh)
      - [ ] Selecting Opus shows low / medium / high / xhigh / max
      - [ ] Dropdown is readable on glass theme (solid backdrop, not transparent)
- [ ] Smoke signed: __________________________ on __________
```

## Definition of done

1. ✅ All nine phases (A–I) committed.
2. ✅ Workbench is the only chat shell — `chatWorkbench` flag fully retired.
3. ✅ Outer rail + inner sidebar + top menu bar + chat search + context preview
   + model picker overhaul + HTML preview discoverability shipped.
4. ✅ Real cross-tier integration test added; no mocking of components defined
   inside `ChatOnlyShell/`.
5. ⏳ Manual smoke gate — awaiting signature from the orchestrator.
6. ✅ `roadmap/wave-59-plan.md` status line flipped to `✅ COMPLETED — 2026-04-27`.

Once the manual smoke is signed and the full test suite is green, push.
