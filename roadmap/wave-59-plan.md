# Wave 59 — Workbench Reshape (Piebald-Inspired IA)
**Status:** ✅ COMPLETED — 2026-04-27 · Released as v2.8.0 · Result: `roadmap/auto-briefs/wave-59-result.md`

## Implementation Plan

**Version target:** v2.8.0 (minor — major UI reshape; no breaking IPC changes; flag retirement is a config schema simplification)
**Feature flags:**
- **Retired:** `layout.chatWorkbench` (Phase A deletes the flag, the hook, and the variant selection logic).
- **Behavior change:** `layout.immersiveChat` continues to gate IDE-shell vs chat-shell, but the chat-shell is now always the workbench. There is no longer a "plain chat-only without workbench" variant.
**Dependencies:**
- Wave 58 closed all v2.7.0 audit defects. Build on the cleaned shell, not on Wave 47 scaffolding.
- Existing IDE shell components reusable: `TitleBar.menus.ts`, `ChatHistorySidebar` context-menu handlers, `FileTree`, `TerminalManager`, `CommandPalette`.
- Existing chat composer surface: `src/renderer/components/AgentChat/ChatControlsBar.tsx` (model picker), `RerunMenu.tsx` (effort menu).
**References:**
- `roadmap/wave-58-plan.md` — predecessor; foundation we're building on.
- `roadmap/wave-47-audit.md` — defect inventory (closed by Wave 58).
- User-validated design references: Piebald, Codex/Cursor, Claude Code app screenshots (captured during Wave 58 smoke).
- `~/.claude/rules/manual-smoke-gate.md` — required sign-off before push.

---

## Background

Wave 47 introduced a workbench variant. Wave 58 closed the defects but kept the architectural debt: **three UI states (IDE / plain chat-only / workbench)** controlled by two intersecting flags (`immersiveChat` + `chatWorkbench`). Users hit foot-guns immediately — the host app overwrote config flags on shutdown, and the menu's "Switch to Chat Mode" only flipped one of two flags, leaving users in the wrong shell.

Beyond the foot-gun, the workbench's IA itself was incomplete by Wave 47's spec: rail showed sessions and recent chats as separate flat lists; no top menu bar; no chat search; no context preview; no per-project navigation; one-terminal-only dock with no multi-tab support; model picker labels misleading (`opus / sonnet / haiku` instead of `Opus 4.7 1M / Sonnet 4.6 / Haiku 4.5`); effort levels uniformly applied across models when each model has a different effort matrix.

User-validated design references resolve the IA: Piebald's two-tier rail (outer icon rail of projects + inner sidebar of chats/terminals/code for the active project), Codex/Cursor's collapsible projects-with-nested-chats, Claude Code's solid model-picker labels and effort tiers. Wave 59 adopts the synthesis.

---

## Goals

1. **One chat shell, not two.** Retire `chatWorkbench`. Workbench IS the chat shell. Three UI states → two (IDE / Workbench).
2. **Two-tier rail.** Outer icon rail (projects + Search/Settings/Profile footer). Inner sidebar (Chats / Terminals / Code tabs for active project).
3. **Top menu bar in workbench.** File / Edit / View / Tools / Help — workbench-specific (no Terminal menu since terminal is a sidebar tab).
4. **Chat search.** Search across all chats in the active project.
5. **Editable context preview above composer.** Toggle rules / skills / open files / attached artifacts on/off per prompt. Click expands; checkbox toggles inclusion.
6. **Model picker overhaul.** Labels: `Opus 4.7 1M`, `Opus 4.7`, `Sonnet 4.6`, `Haiku 4.5`, `Auto`. Per-model effort matrix: Opus 4.7 → low/medium/high/xhigh/max; Sonnet 4.6 → low/medium/high/max; Haiku 4.5 → none. Solid (non-glass) dropdown background.
7. **HTML preview discoverability.** HTML files default to preview mode (not code). Inline preview chip in chat when an assistant message references an HTML artifact.

---

## Non-goals

- Multi-window project switching. Outer rail switches active project; multiple windows still possible but not the primary path.
- Terminal as a top-level pane (like the IDE's bottom dock). Terminal is a tab in the inner sidebar; in-chat terminal use happens via the workbench dock that stays.
- Subagent display fixes. Tracked by Wave 57; depends on different subsystems.
- Live HTML runtime (separate `BrowserWindow` rendering with full asset loading). The current sandboxed iframe stays; runtime upgrade tracked separately if needed.
- "Live Preview" of running web apps inside the IDE. The `HtmlPreview` is for static HTML artifacts only.

---

## Phase A — Retire `chatWorkbench` flag

**Scope:** Delete the variant selection. Workbench becomes THE chat shell.

**Files modified:**
- `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyShell.tsx` — remove `useChatWorkbenchFlag` and the `isWorkbench` ternary; always mount `ChatWorkbenchShell`.
- `src/renderer/components/Layout/ChatOnlyShell/useChatWorkbenchFlag.ts` — delete.
- `src/main/configSchemaTailExt.ts` and `src/main/configAppTypes.ts` — remove `chatWorkbench` from `LayoutConfig`.
- `src/renderer/types/electron-foundation.d.ts` — remove from typed surface.
- Any test mocking `useChatWorkbenchFlag` — update or delete.
- Any docs referring to the variant — update.

**Acceptance criteria:**
- `grep -rn "chatWorkbench\|useChatWorkbenchFlag" src/` returns zero matches outside this plan / changelog.
- Existing user configs with `chatWorkbench: true | false` continue loading without error (config loader silently drops unknown keys; verify).
- `ChatOnlyShell` always mounts `ChatWorkbenchShell` when `immersiveChat` is true.

**Tests:**
- Update `ChatOnlyShell.test.tsx` to remove flag-variant tests; assert workbench mounts unconditionally.

**Commit:** `feat(wave-59): Phase A — retire chatWorkbench flag; workbench is the chat shell`

---

## Phase B — Two-tier rail (outer icon rail + inner sidebar shell)

**Scope:** Replace the current single-pane `WorkbenchRail` with a two-tier structure.

**Files modified:**
- `src/renderer/components/Layout/ChatOnlyShell/WorkbenchRail.tsx` — refactor or replace with composition of new sub-components.
- New: `src/renderer/components/Layout/ChatOnlyShell/OuterProjectRail.tsx` — Discord/Slack-style icon rail with project icons + Search/Settings/Profile footer.
- New: `src/renderer/components/Layout/ChatOnlyShell/InnerSidebar.tsx` — wraps the tab strip + tab content (Chats/Terminals/Code) for the active project.
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchShell.tsx` — mount the new structure.
- `src/renderer/components/Layout/ChatOnlyShell/useChatWorkbenchLayout.ts` — add per-project rail state (active project index, inner-tab selection per project).

**Outer rail design:**
- Icon-only column, ~52px wide. Project icons stacked top-down. Active project: filled accent background. Inactive: muted, hover reveals tooltip with project name.
- Footer (bottom-anchored): Search icon → opens chat-search overlay; Settings icon → existing `ChatOnlySettingsOverlay`; Profile/avatar → opens existing `ChatOnlyUserMenu` popover.
- Initial project list: from `config.recentProjects` + `config.multiRoots`. New project: `+` button at top of the icon column → folder picker → adds to project list.

**Inner sidebar shell:**
- Header: active project name + breadcrumb / project switcher button.
- Tab strip: Chats / Terminals / Code (3 tabs, persisted per-project in `useChatWorkbenchLayout`).
- Body: active tab's content (Phase D fills these in).
- Footer: workspace-specific status (e.g., chat count, open terminals count).

**Acceptance criteria:**
- Outer rail renders with all current projects.
- Clicking a project icon switches the inner sidebar to that project's content.
- Clicking the `+` icon opens the folder picker; selected folder is added.
- Search/Settings/Profile footer items open their respective surfaces.
- Inner sidebar header shows the active project; tab strip shows three tabs (initially empty content — filled by Phase D).
- Resizable: outer rail fixed at 52px; inner sidebar resizable, default 280px, persisted.

**Tests:**
- New: `OuterProjectRail.test.tsx` — project icons render, clicking switches active.
- New: `InnerSidebar.test.tsx` — tab strip renders, switching tabs updates body.
- Update: existing `WorkbenchRail.test.tsx` — adapt to new structure or delete and replace.

**Commit:** `feat(wave-59): Phase B — two-tier rail (outer projects + inner sidebar shell)`

---

## Phase C — Top menu bar in workbench

**Scope:** Add a workbench-specific top menu bar (File / Edit / View / Tools / Help). Reuse `TitleBar.menus.ts` definitions where applicable; omit menus that don't apply (Terminal).

**Files modified:**
- `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyTitleBar.tsx` — add menu bar to the title bar.
- `src/renderer/components/Layout/TitleBar.menus.ts` — add a workbench-specific menu definition factory (`getWorkbenchMenuDefinitions()`) alongside the existing `getMenuDefinitions()`. Reuse menu item builders; omit Terminal-related items.
- New (if needed): `src/renderer/components/Layout/ChatOnlyShell/WorkbenchMenuBar.tsx` — thin wrapper around the existing menu rendering.

**Menu contents (workbench-specific):**
- **File:** New session, New chat in active session, Open project, Switch project (submenu), Recent projects, Exit chat mode.
- **Edit:** Cut/Copy/Paste (standard), Find in chat (Phase E hook), Find next, Find previous.
- **View:** Toggle outer rail, Toggle inner sidebar, Toggle utility drawer, Toggle terminal dock, Toggle artifact pane, Switch to IDE shell.
- **Tools:** Settings, Keyboard shortcuts, Theme submenu.
- **Help:** About, Documentation, Report issue.

**Acceptance criteria:**
- Menu bar renders below the window-controls row in the workbench title bar.
- Clicking a menu opens its dropdown; items fire their existing handlers.
- Keyboard shortcuts (Alt+F, Alt+E, etc.) open menus.
- Items reused from `getMenuDefinitions()` continue working unchanged in IDE shell.

**Tests:**
- New: `WorkbenchMenuBar.test.tsx` — menus render, items dispatch, keyboard shortcuts work.

**Commit:** `feat(wave-59): Phase C — workbench-specific top menu bar`

---

## Phase D — Inner sidebar tabs (Chats / Terminals / Code)

**Scope:** Fill in the three tabs introduced by Phase B.

**Files modified:**
- New: `src/renderer/components/Layout/ChatOnlyShell/InnerSidebarChats.tsx` — list of chats for active project, nested under sessions if multi-session per project.
- New: `src/renderer/components/Layout/ChatOnlyShell/InnerSidebarTerminals.tsx` — list of terminal sessions for active project. **Multi-tab support** — each terminal is a row; click activates it in the bottom dock; `+` adds a new terminal.
- New: `src/renderer/components/Layout/ChatOnlyShell/InnerSidebarCode.tsx` — file tree scoped to active project. Reuse `FileTree` component with `projectRoot` set to active project.
- `src/renderer/components/Layout/ChatOnlyShell/useChatWorkbenchLayout.ts` — track `activeInnerTab: 'chats' | 'terminals' | 'code'` per project.

**Chats tab:**
- Replaces current `WorkbenchRailSections`. Sessions for active project listed; each session can be expanded to show its chats. Recent chats no longer a separate section — they're under their parent session.
- "+ New chat" button per session row + "+ New session" at the top.
- Right-click context menu: existing `WorkbenchRailContextMenu` reused (delete/rename/pin/archive).

**Terminals tab:**
- List of terminal sessions for the active project. Active terminal highlighted. Click → activates in the workbench's bottom terminal dock (the dock stays — it's the runtime view; the tab is the index).
- "+ New terminal" creates a new terminal in the active project.
- Right-click context menu: rename / kill / clear-buffer.

**Code tab:**
- File tree scoped to active project. Click a file → opens in artifact pane.
- Reuse `FileTree` component verbatim if possible; pass `projectRoot={activeProject.path}`.

**Acceptance criteria:**
- All three tabs render correct content for the active project.
- Switching projects via outer rail updates all three tabs.
- "+ New chat / terminal" affordances work.
- Multi-terminal: opening 3 terminals shows 3 rows; clicking each activates it in the dock.
- File tree opens HTML files in preview mode (Phase H integration check).

**Tests:**
- New: `InnerSidebarChats.test.tsx`, `InnerSidebarTerminals.test.tsx`, `InnerSidebarCode.test.tsx`.

**Commit:** `feat(wave-59): Phase D — inner sidebar tabs (chats / terminals / code)`

---

## Phase E — Chat search

**Scope:** Search across all chats in the active project (and optionally cross-project).

**Files modified:**
- New: `src/renderer/components/Layout/ChatOnlyShell/ChatSearchOverlay.tsx` — overlay that opens via outer-rail Search icon, Ctrl+F, or Edit menu → Find in chat.
- `src/renderer/hooks/useChatSearch.ts` — search hook; queries the chat history store + filters.
- `src/main/ipc-handlers/agentChat.ts` (or wherever chat search lives) — add `agentChat:search` IPC if not present.

**Behavior:**
- Cmd+F or Ctrl+F (workbench mode) opens the overlay.
- Search input matches: chat title, message content, model name, project root.
- Results show chat row with snippet + highlight; Enter navigates to the chat.
- Scope toggle: active project / all projects.

**Acceptance criteria:**
- Overlay opens via three triggers.
- Search returns results in <500ms for ≤500 chats.
- Clicking a result activates the chat in the active project.
- Empty state shows when no results.

**Tests:**
- New: `ChatSearchOverlay.test.tsx`, `useChatSearch.test.ts`.

**Commit:** `feat(wave-59): Phase E — chat search overlay`

---

## Phase F — Editable context preview above composer

**Scope:** Show what context will be sent with the next prompt. Items can be toggled on/off.

**Files modified:**
- New: `src/renderer/components/AgentChat/ContextPreview.tsx` — collapsible strip above the composer.
- `src/renderer/components/AgentChat/AgentChatComposer.tsx` (or wherever the composer is) — mount `ContextPreview` above the input field.
- `src/renderer/hooks/useContextPreview.ts` — aggregates everything that gets sent: rules in scope, active skills, open editor files (if any), attached artifacts, project CLAUDE.md, system prompt.

**Display:**
- Collapsed: "5 items will be sent — expand" + list of icon chips (rules count, skills count, files count, artifacts count).
- Expanded: list rows with checkbox, item type (rule / skill / file / artifact / system), item name, byte/token count.
- Click checkbox → toggle inclusion. Excluded items grayed out; persists per-thread or per-prompt (decide during implementation).

**Acceptance criteria:**
- Context preview is visible above the composer in workbench mode.
- Items reflect what's actually attached (verify by sending a prompt and inspecting the request payload).
- Toggling an item off removes it from the next request.
- Token-count summary shows total bytes/tokens.

**Tests:**
- New: `ContextPreview.test.tsx` — render with fixture context, toggle items, assert state.
- Integration: send a prompt with two items disabled, assert the request payload omits them.

**Commit:** `feat(wave-59): Phase F — editable context preview above composer`

---

## Phase G — Model picker overhaul

**Scope:** Fix labels, per-model effort matrix, solid dropdown background. Affects both classic chat-only AND workbench (shared component).

**Files modified:**
- `src/renderer/components/AgentChat/ChatControlsBar.tsx` — model dropdown.
- `src/renderer/components/AgentChat/RerunMenu.tsx` — model + effort menu.
- `src/renderer/components/AgentChat/ChatControlsBarSupport.ts` — model label + effort matrix mapping.
- New: `src/renderer/components/AgentChat/modelEffortMatrix.ts` — single source of truth for per-model effort options.

**Model labels (display strings):**
- `claude-opus-4-7` → `Opus 4.7`
- `claude-opus-4-7[1m]` → `Opus 4.7 1M` (1M context variant)
- `claude-sonnet-4-6` → `Sonnet 4.6`
- `claude-haiku-4-5` → `Haiku 4.5`
- `auto` → `Auto`

**Effort matrix per model:**
- Opus 4.7 (both variants): `low | medium | high | xhigh | max`
- Sonnet 4.6: `low | medium | high | max`
- Haiku 4.5: (no effort options — hide effort selector entirely)
- Auto: defer to underlying selected model

**Dropdown background:**
- Both `RerunMenu` and `ChatControlsBar` dropdowns currently use `bg-surface-base` or similar transparent token. Replace with `role="menu"` to trigger the global frosted-overlay rule (`globals.css:1066`), matching how Wave 58 fixed `WorkbenchRailContextMenu` and `MultiSessionLauncher`.

**Acceptance criteria:**
- All four model labels render correctly in workbench AND classic IDE chat.
- Selecting Haiku hides effort selector; selecting Sonnet hides "xhigh"; selecting Opus shows all five.
- Dropdown is readable on glass theme (solid background, backdrop blur).
- Existing model selection persists; no behavior regression for already-stored model values.

**Tests:**
- New: `modelEffortMatrix.test.ts` — matrix returns correct options per model.
- Update: `ChatControlsBar.test.tsx` and `RerunMenu.test.tsx` — assert labels and effort visibility per model.

**Commit:** `feat(wave-59): Phase G — model picker labels + per-model effort matrix + solid bg`

---

## Phase H — HTML preview discoverability

**Scope:** Make the existing `HtmlPreview` actually reachable.

**Files modified:**
- `src/renderer/components/FileViewer/useFileViewerState.ts` — change initial `viewMode` for HTML files from `'code'` to `'preview'`.
- `src/renderer/components/AgentChat/AssistantMessage.tsx` (or wherever assistant messages render) — detect HTML artifact references and render a small "Preview" chip that opens the artifact pane in preview mode.
- New: `src/renderer/components/AgentChat/InlineArtifactChip.tsx` — small clickable chip for HTML/markdown/PDF artifact previews.

**Acceptance criteria:**
- Opening an `.html` file lands directly on Preview mode (not Code).
- When an assistant message says "I created `dashboard.html`", a Preview chip renders inline; clicking it opens the artifact pane in preview mode.
- The existing Code/Diff/Preview mode toggle still works — default just changes for HTML.

**Tests:**
- Update `useFileViewerState.test.ts` — assert `viewMode === 'preview'` when `isHtml` is true on first mount.
- New: `InlineArtifactChip.test.tsx` — chip renders for HTML mentions, click opens artifact pane.

**Commit:** `feat(wave-59): Phase H — HTML preview discoverability`

---

## Phase I — Integration coverage + manual smoke gate sign-off + result brief

**Scope:** Real integration tests for the new IA, signed manual smoke entry, result brief.

**Files modified:**
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchFollowThrough.integration.test.tsx` — extend to cover Phase B, D, E joins. No mocks of components defined inside `ChatOnlyShell/`.
- New: `src/renderer/components/Layout/ChatOnlyShell/wave59ReshapeIntegration.test.tsx` — explicit cross-tier integration coverage (outer rail switches project → inner sidebar updates → chats tab repopulates).
- `roadmap/auto-briefs/wave-59-result.md` — phase summaries, files changed, tests added, audit findings closed (n/a; this is a forward-looking wave), deferred items, signed manual smoke checklist embedded.
- `roadmap/wave-59-plan.md` — flip status to ✅ COMPLETED with date and version.

**Manual smoke gate** (per `~/.claude/rules/manual-smoke-gate.md`):
- Launch app, confirm workbench mounts on chat-shell entry (no flag).
- Outer rail: project icons present, switching projects updates inner sidebar, footer items reachable.
- Inner sidebar: tabs switch correctly, content per project is correct, "+ new chat / terminal" works.
- Top menu bar: each menu opens, items fire correct handlers, keyboard shortcuts work.
- Chat search: opens via three triggers, returns results, navigates correctly.
- Context preview: shows correct items, toggles work, prompt payload reflects toggles.
- Model picker: correct labels, correct effort options per model, dropdown readable.
- HTML preview: opens an `.html` file → preview mode by default; assistant chip click → artifact pane in preview mode.
- No console errors, no white borders, no debug labels, no dead UI.
- Quit + relaunch persists rail state, project selection, inner-tab selection per project.

**Commit:** `docs(wave-59): Phase I — integration coverage + result brief`

---

## Phase dispatch order — scope-split for parallel execution

Wave 59 has natural parallel structure. The IA reshape (A→B→D→E) is sequential by design (each step depends on the prior). Phases C, F, G, H are independent of each other and of the IA reshape (touch different files, no shared state). Phase I gates on all prior phases.

### Recommended dispatch:

**Sequential track (one agent, single sonnet-implementer):**
- A → B → D → E
- ~4 commits, deep dependency chain, single ownership avoids merge conflicts in shared files (`useChatWorkbenchLayout.ts`, `WorkbenchRail.tsx`, `ChatWorkbenchShell.tsx`).

**Parallel tracks (four agents, run concurrently with the sequential track):**
- Track 1: Phase C — top menu bar. Files: `ChatOnlyTitleBar.tsx`, `TitleBar.menus.ts`, new `WorkbenchMenuBar.tsx`.
- Track 2: Phase F — context preview. Files: `AgentChat/ContextPreview.tsx`, `AgentChat/AgentChatComposer.tsx`, `useContextPreview.ts`.
- Track 3: Phase G — model picker. Files: `AgentChat/ChatControlsBar.tsx`, `AgentChat/RerunMenu.tsx`, `AgentChat/ChatControlsBarSupport.ts`, new `modelEffortMatrix.ts`.
- Track 4: Phase H — HTML preview discoverability. Files: `FileViewer/useFileViewerState.ts`, `AgentChat/AssistantMessage.tsx`, new `InlineArtifactChip.tsx`.

**Final track (one agent, after all prior land):**
- Phase I — integration tests + result brief + plan status flip.

**File-collision check:** Sequential and Track 1 both touch `ChatOnlyTitleBar.tsx`. Mitigation: Sequential owns the file in workbench-mode signal additions (via `props.onToggleRail` etc. — already prior art); Track 1 adds the menu bar to the same file. Coordinate by having Sequential land Phase B FIRST, then Track 1 starts. Or: extract the menu bar to its own file (`WorkbenchMenuBar.tsx`) so Track 1 only touches it via a single mount point. Prefer the latter.

---

## Risk notes

- **Outer rail project list source.** The current "projects" concept in this app is `recentProjects` + `multiRoots` + per-window `projectRoots` (per `windowManager.ts`). Reconcile during Phase B implementation: pick one source of truth for the rail's project list and migrate the others. Likely candidate: a new `config.layout.workbenchProjects` array, populated lazily from existing sources.
- **Per-project state explosion.** Phase B introduces per-project rail state (active inner tab, expanded chats). Persisting this as `Record<projectId, ProjectState>` in `useChatWorkbenchLayout` is fine for ~50 projects; if users have hundreds, consider an LRU cap.
- **Top menu Accel keys.** The IDE shell's title bar already binds Alt+F/E/V/T/H. In the workbench, those need to fire only when the workbench is mounted (avoid double-binding). Use a ref guard or a single shared menu controller.
- **Model picker shared between shells.** Phase G changes affect classic IDE chat AND workbench. Verify no regression on IDE-shell side.
- **HTML preview default-mode change.** Some users may have come to expect Code mode for HTML. Phase H flips the default; document in the result brief and changelog.
- **Removing the `chatWorkbench` flag** drops the legacy chat-only-without-workbench shell entirely. Any user with that variant active gets the workbench on first launch post-upgrade. Acceptable per user direction; document in release notes.

---

## Definition of done

Wave 59 is complete when:

1. All nine phases (A–I) have a fix-or-defer disposition. Defers must have a written reason and a follow-up wave.
2. The workbench is the only chat shell — `chatWorkbench` flag fully retired.
3. Outer rail + inner sidebar + top menu bar + chat search + context preview + model picker overhaul + HTML preview discoverability all shipped or explicitly deferred with reason.
4. Real integration tests cover the IA joins (no mocking of components defined in `ChatOnlyShell/` or `AgentChat/`).
5. Manual smoke gate signed in `roadmap/auto-briefs/wave-59-result.md`.
6. The plan's `**Status:**` line at the top of this file is flipped to `✅ COMPLETED — <date> · Released as v2.8.0`.

---

## Convention note

Per user direction (2026-04-27), every wave plan must carry a `**Status:**` line directly under the title H1, set to one of:
- `📋 PLANNED — <date>` — drafted, not started.
- `🚧 IN PROGRESS — <date> · Started <date>` — phases landing.
- `✅ COMPLETED — <date> · Released as v<version> · Result: <path>` — shipped.
- `⛔ ABANDONED — <date> · Reason: <one line>` — explicitly retired.

When marking COMPLETED, do not delete the plan content — future agents may need the historical context. The status line is the immediate signal.
