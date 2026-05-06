# Wave 82 — Architectural Decisions

Per `~/.claude/rules/best-practice-spectrum.md`. Decisions 1-8 are locked from grounding (user statements during the 2026-05-03 bug-hunt session). Decisions 9-12 require user lock and present recommended picks with the industry-standard / emerging / experimental spectrum.

---

## Decision 1: Heat map fix path

**Context:** `useFileHeatMap.extractFilePath` (lines 91-98) rejects any input starting with `{` or `[`, so all JSON-shaped agent tool inputs return null and the heat map never populates. The button toggle is purely cosmetic today.

**Pick:** Extend `extractFilePath` to JSON-parse structured tool inputs and read `parsed.file_path` (Write/Edit) or `parsed.notebook_path` (NotebookEdit), preserving the raw-string fallback for legacy-shape inputs.

**Rationale:** Industry-standard for tool-input parsing in 2026 LLM tooling — every Anthropic / OpenAI tool-use spec since mid-2024 emits structured JSON. Original string-only path is dead weight for real agent tool calls. ~10-line change; no API surface impact.

---

## Decision 2: Branch indicator location

**Context:** Git branch displays in two places — `StatusBar.tsx:113` (bottom-left `BranchButton`) and `FileTree.tsx:243` (top-of-tree `GitBranchIndicator`). User stated preference for the file-tree variant.

**Pick:** Drop the `<GitSection>` mount from `StatusBar.tsx:208` (or specifically `BranchButton` at line 113); keep `GitBranchIndicator` at top of file tree.

**Rationale:** User preference. Reduces visual duplication. Status bar regains horizontal space for the items that remain.

---

## Decision 3: Chat-delete cascade fix

**Context:** Chat-only sidebar (`ChatHistorySidebar.handleDelete`, lines 258-264) and workbench rail (`useWorkbenchRailActions.onDeleteThread`, lines 71-84) both mutate the Zustand store directly via `applyDeleteToStore`, bypassing the workspace's canonical action `model.deleteThread`. This causes a ~0.2s rail flash because the workspace's internal `useThreadState` is unaware and re-syncs stale data into the store on the next render.

**Pick:** Route both delete paths through `model.deleteThread` (the canonical workspace action wired into the store via `useSyncActionsIntoStore`); delete the local `applyDeleteToStore` helpers.

**Rationale:** Single source of truth. The workspace's `useThreadState` is the canonical owner; the sidebar must use it, not race against it. Industry-standard pattern (single-write-path) — emerging alternatives (event-sourced delete with optimistic UI) add complexity without proportionate benefit for this specific cascade.

---

## Decision 4: Outer-rail project persistence (quick fix)

**Context:** Projects added via `OuterProjectRail` in chat-only view don't persist between sessions. `useAddProject` (lines 240-249) writes only per-window state via `addProjectRoot`, never touches `config.recentProjects`. Chat windows initialize with `projectRoots: []` per `windowManager.ts:244` and there's no per-window restore path. The merge in `useWorkbenchProjects` (`ChatWorkbenchBody.rails.tsx:37`) falls back to `config.recentProjects`, which is never updated by the chat-only path — so projects added in chat-only vanish on close.

**Pick:** Mirror the IDE-shell add path — when `OuterProjectRail.useAddProject` runs, also call `window.electronAPI.config.set('recentProjects', updated)` matching `InnerAppLayout.tsx:174-178` and `useProjectManagement.ts:28-35`.

**Rationale:** Minimal-surface fix that restores the round-trip via the existing fallback merge. Structural fix (per-window `projectRoots` persisted to sessionsData/SQLite — would require extending the `Session` type to carry an array) is deferred to a future "session model v2" wave; this quick fix unblocks the user without that lift.

---

## Decision 5: Activeproject desync handling

**Context:** `layout.activeProject` persists in config, but isn't validated against the actual merged project list on load. So after Decision 4 lands, the inner rail can still show a project that's no longer in the outer rail.

**Pick:** Validate `layout.activeProject` against the merged project list in `useWorkbenchProjects`; if not present, call `layout.setActiveProject(null)`.

**Rationale:** One-liner; prevents orphan-active-project state. Defensive guard, costs nothing.

---

## Decision 6: Edit-mode label change

**Context:** `FileViewerToolbar.tsx:224` reads `props.editMode ? 'Exit Edit' : 'Edit'`. User requested simplification to "Exit."

**Pick:** Rename "Exit Edit" to "Exit" — change the ternary to `props.editMode ? 'Exit' : 'Edit'`.

**Rationale:** User preference. Shorter label; same affordance.

---

## Decision 7: Workbench menu wiring strategy

**Context:** Most workbench title-bar menu items dispatch DOM events with no `addEventListener` consumers anywhere in `src/renderer` (verified by grep for `WORKBENCH_NEW_SESSION_EVENT`, `WORKBENCH_NEW_CHAT_EVENT`, etc.). Clicking them is a no-op. Some likely freeze the IDE due to a separate dropdown-portal bug.

**Pick:** Subscribe each unwired event at the `ChatWorkbenchShell` or `TwoTierRailSurface` level so the listener has access to `layout`, `handlers`, `terminal`, etc. Reuse existing handler implementations (`handleCreateSession`, `model.startNewChat`, `addProjectRoot`, `layout.setActiveProject`); don't fabricate new functionality. Menu items whose intended action is genuinely deprecated are removed from the menu, not wired to no-ops.

**Rationale:** Wiring-only sweep is cheaper than menu-restructure and addresses the user's reported defect directly. Existing handlers cover the cases — the bug is purely subscription-side. Industry-standard React pattern for keyboard / menu event handling.

---

## Decision 8: Terminal close affordance

**Context:** No way to close a terminal in chat-only view. `InnerSidebarTerminals` rows are select-only (no context menu, no hover-X); `ChatWorkbenchTerminalDock` doesn't mount `TerminalTabs` (only `TerminalPane` does), so the dock has no per-session close X. The dock header's existing ✕ closes the dock, not the session.

**Pick:** Add hover-revealed `TabCloseButton` to `InnerSidebarTerminals` rows AND a "Close session" action button in `ChatWorkbenchTerminalDock` header next to "+ New". Both bind to `terminal.handleTerminalClose`. The dock header's existing ✕ stays as documented (closes the dock).

**Rationale:** Two surfaces, two complementary affordances — covers both "close from list" and "close active in dock" UX paths. Reuses the existing `TabCloseButton` component for visual consistency. Avoids the heavier alternative of mounting `TerminalTabs` inside the dock (which would conflict with the dock's vertical-space model).

---

## Decision 9: Artifact pane Recent section semantics

**Context:** `ArtifactHistoryList` currently renders a vertical stack auto-populated by `useArtifactObserver` on every observation. User wants horizontal layout (5 chips per row), only populated by close-or-overflow. Open semantic questions: cap scope, eviction behavior, click-restore behavior.

**Options considered:**

- _Industry standard:_ Recent caps at 5 chips per row × 2 rows max (10 total). Open-files row caps at 5; on overflow, oldest open file moves to Recent and the underlying `OpenFile` stays loaded but hidden from the active tab strip. Clicking a Recent chip moves it back to the open-files row, evicting the current oldest to Recent (LRU swap). Cap applies to file artifacts only — diffs are transient and surface-once, untouched by this cap. Source: VS Code's "Recently Opened Editors" pattern (Ctrl+Shift+T) — proven LRU + cap UX in mainstream IDE since 2017.
- _Emerging:_ Don't unload at all — `useFileViewerManager` carries unbounded open files but only displays 5 in the tab row; Recent is just an alternative view of the rest. Avoids close/restore semantics.
- _Experimental:_ MRU pinning — user explicitly pins which 5 stay in the open row; Recent shows everything else. Most flexible, requires UI for pinning.

**Pick:** _Industry standard._ **LOCKED 2026-05-03 (Cole).**

**Rationale:** VS Code's pattern is widely understood by IDE users; LRU swap matches mental model of "active set + overflow." Files-only cap respects the diff surface's transient nature. Cheapest of the three to build (no new pin UI, no unbounded carry). Trade-off: closing a file then immediately reopening it requires a Recent click — slightly more friction than the unbounded model but consistent with VS Code's behavior.

**Consequences:** Commits the wave to LRU semantics. Future "stickiness" features (pinned-open files, multi-pane tab groups) would build on top, not replace.

---

## Decision 10: Timeline tab disposition

**Context:** Timeline tab's counter shows full `totalCount` (e.g., 2178) but the list is hardcoded-capped at `TIMELINE_VISIBLE_LIMIT = 24`. The Monitor tab (`AgentMonitorManager`) shows the same agent event stream, so Timeline feels redundant. Header subtitle ("X derived events from renderer state") implies Timeline was meant as a digest distinct from Monitor's raw stream, but the implementation doesn't differentiate enough.

**Options considered:**

- _Industry standard:_ Lift the cap to ~500 entries with paginated "Load more" affordance for older entries. Counter and visible list stop disagreeing. Cheapest path; preserves a working surface.
- _Emerging:_ Repurpose Timeline as a digest view (collapsed by session, file-change summaries, milestone markers — not raw events). Monitor stays as raw stream. Differentiates the two surfaces meaningfully and aligns with the subtitle's intent.
- _Experimental:_ Drop Timeline entirely — Monitor covers it.

**Pick:** _Emerging (digest view)._ **LOCKED 2026-05-03 (Cole).**

**Rationale:** Differentiates Timeline from Monitor meaningfully — the header subtitle ("X derived events from renderer state") implied a digest framing was the original intent. Emerging is more work than industry-standard but resolves the redundancy concern alongside the cap defect.

**Consequences:** Phase G/H scope expands materially — digest model design (session collapse, milestone marker categories, file-change summary aggregation) becomes its own deliverable. Implementation approach (committed in autonomous execution unless overridden): minimal defensible digest with these elements: (a) entries grouped by session, collapsed by default with header showing session label + total event count + duration; (b) milestone markers as distinct entry types — `session-start`, `session-end`, `first-tool-use`, `error`, `subagent-spawn`; (c) file-change summary per session showing top 3 most-edited files with edit counts; (d) raw event list available behind expansion toggle (no cap once expanded — Monitor remains the unbatched stream). Design choices documented in Phase G result brief for post-wave review.

---

## Decision 11: Files tab semantics in context-preview popover

**Context:** Today the popover has separate Files (`pinnedFiles`) and Mentions (`mentionLabels`) tabs, plus invisible `attachments[]` (images) that don't show anywhere. User reports the split is confusing — internal file-tree drops show as Mentions, external non-image drops are silently rejected, attachments are invisible.

**Options considered:**

- _Industry standard:_ Unify "Files" and "Mentions" into a single "Context" tab grouped by source (Pinned / Mentioned / Dropped / Attachments). Single mental model: "what's going to the prompt." Adds Attachments group surfacing `attachments[]`. External non-image drops pin as files (calls `addFile` instead of being silently dropped). Source: Cursor / Continue / Windsurf composer UX — all unify "context items" into one surface with source badges.
- _Emerging:_ Keep tabs separate but add Attachments tab; Files = pinned only; Mentions = `@`-typed only. Preserves existing mental model; adds the missing surface.
- _Experimental:_ No tabs at all; flat scrollable list with type badges. Most compact; loses the at-a-glance count per category.

**Pick:** _Industry standard._ **LOCKED 2026-05-03 (Cole).**

**Rationale:** Matches modern AI composer UX; reduces user confusion (one surface, one mental model); fixes the silent non-image-drop rejection as a side effect.

**Consequences:** Commits to a "Context" naming + grouping model. Updates `TABS` array, `EMPTY_TAB_MESSAGES`, popover render logic. Adds `addFile` call path for non-image drops. Test coverage must reflect the new grouping shape.

---

## Decision 12: Skills tab data source

**Context:** Skills tab today shows only `skillExecutions[]` (skills that have run this session); empty state reads "No skills executed in this session." User reports the tab feels unwired — they want to know what's available.

**Options considered:**

- _Industry standard:_ Show available skills (the catalog from the system reminder) as the primary list, with a small "Recently executed" subsection at top when `skillExecutions[]` is non-empty. Mirrors the Rules tab's User/Project sub-grouping. Requires a new `rulesAndSkills:listSkills(projectRoot)` IPC analogous to `listRuleFiles`.
- _Emerging:_ Show only executions but make the empty state actionable ("X skills are available — try /<command>"). Cheapest; no new IPC.
- _Experimental:_ Defer the tab entirely; remove from popover until skills become a more prominent feature.

**Pick:** _Industry standard._ **LOCKED 2026-05-03 (Cole).**

**Rationale:** Mirrors how Rules tab works (user/project grouping with full available list). Solves the "I don't know what's available" UX gap directly.

**Consequences:** Adds `listSkills` IPC contract that becomes a maintained surface. Updates `useContextPreview` to take `availableSkills` input. Restructures Skills tab render. Test coverage extends to IPC contract + tab grouping.
