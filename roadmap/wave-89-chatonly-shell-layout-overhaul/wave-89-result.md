---
status: SHIPPED
created: 2026-05-16
updated: 2026-05-16
wave: 89
slug: chatonly-shell-layout-overhaul
tag: v2.18.0
---

# Wave 89 — Result Brief

## Summary

Started as "ChatOnlyShell Layout Overhaul" (two-slot stacked terminals + overlay drawers). Mid-Phase-4 manual smoke surfaced a strategic question — *"why have chat if subscription Claude forces a CLI-only substrate?"* — and the wave pivoted to **terminal-first**. The dock infrastructure (Phase 0/1) and overlay infrastructure (Phase 2/3) stayed; the AgentChat surface was removed from the ChatOnlyShell mount tree (code preserved for the IDE shell + future API-chat re-introduction). The Wave 89 layout the user actually got is structurally different from the one the locked plan described, but the underlying primitives are all the ones the plan built.

8 commits + 4 hotfixes/refinements + 1 pivot ADR + 5 follow-ups. Ships as **v2.18.0** (minor — material UI surface change).

## What shipped

### Phase 0 — `useResizable` sibling-stack + dock persistence schema (`dfa3acf9` + `7ceca999`)

- New `startSiblingResize` function in `useResizable` (separate from the existing positional `startResize`; existing fixed-edge consumers untouched).
- Pure sibling-stack math extracted to `useResizable.sibling.ts` to stay under 300-line file cap.
- `dockPersistenceSchema.ts` declares `terminalDockSlots: { primary, secondary }`, `overlayDrawerWidth`, `artifactOverlayWidth`. Forward-migration from legacy `dockHeight` via 60/40 split. Defaults `{ primary: 160, secondary: 100 }` (Phase 1 revision; superseded by Phase 4c when dock became full-height).
- 15 pure-math tests + 9 hook tests + 8 schema tests. Full `test:layout` 988/988 non-regression.

Phase 1 revision routed `useDockSlotHeights`'s bespoke drag through `startSiblingResize` via an additive `onCommit` callback — honors ADR Decision 1 (single resize source of truth).

### Phase 1 — Two-slot stacked terminal dock (`861343b4` + `7ceca999` + `e11ef53c`)

- `ChatWorkbenchTerminalDock` refactored from single-pane to two-slot stack: `primary` (Wave 90 home for interactive Claude) and `secondary` (dev shell).
- `DockSlot.tsx` per-slot component, each owning an independent `useTerminalSessions` instance (slot-agnostic registry, confirmed pre-Phase-1 by `haiku-explorer`).
- `useDockSlotHeights` orchestrates persistence + drag-via-`startSiblingResize`.
- `SPLIT_TERMINAL_EVENT` payload extended with `{ slot, sessionId }`; legacy dispatch sites default to `'primary'` via `?? 'primary'` fallback in `TerminalManager`. All sites enumerated + updated.
- Walking-skeleton 3-commit discipline was attempted but failed under session budget — Phase 1 squashed to one feature commit + one revision (chrome-accounting fix). 
- Phase 1 hotfix (`e11ef53c`): runtime crash on dock open — Phase 1 retained Wave 88's dead `useDockHandlers` helper called with a type-cast stub missing `recordingSessions`. Fix: inlined the only consumed handler (`handleResizePointerDown`), deleted the dead helper.

### Phase 2 — `OverlayDrawer` primitive (`2412b029`)

- Non-modal slide-in drawer anchored to nearest positioned ancestor (NOT viewport).
- Z-index 200 (chosen after enumerating existing overlays: in-layout 10-20, mobile overlays 150-201, modals 900+).
- Backdrop `rgba(0,0,0,0.35)` inline — mica/vibrancy-safe override of ADR Decision 4's token tint per renderer rule.
- Escape bound at window with `{ capture: true }` + `stopPropagation` (jsdom div-scoped handlers don't propagate reliably; non-modal contract honored — composer Escape works when drawer closed).
- 16/16 tests pass across visibility / backdrop / escape / non-modal scoping / width / drag.

### Phase 3 — Utility drawer + artifact pane overlay migration (`5e1697b7`)

- Both `ChatWorkbenchUtilityDrawer` AND `ChatWorkbenchArtifactPane` migrated from fixed-flex body siblings to `OverlayDrawer` instances (ADR Decision 3 → Option A, Cole's call).
- New `useOverlayDrawerWidths` hook for per-surface width persistence.
- `ChatWorkbenchOverlays.tsx` mount point. Tile layout: artifact right-anchored, utility tiled to its left when both open.
- `ChatWorkbenchBody`'s desktop flex tree simplified to `rail | chat-area | terminal-dock`.
- `useChatWorkbenchLayout` mutual-exclusion removed (both can be concurrently open). `useWorkbenchSurfacePolicy` unchanged.
- `WorkbenchSidePanels` removed. Mobile path (`MobileOverlay`-wrapped surfaces) unchanged.

### Phase 4 + 4b — The pivot (`e20cd8a3` + `a5fccc64` + `1dd718d0` + `df70495d` + `5fc033b1`)

Phase 4 doc cleanup (`e20cd8a3`) landed before the pivot — described the chat + overlay composition that **never shipped**.

ADR Decision 7 (`a5fccc64`) captured the pivot: subscription Claude (OAuth, CLI-managed tokens, no API key) → terminal-first is the only authorized driving path → the chat-bubble UI becomes vestigial post-Wave-90 substrate swap. Cole's call: rescope mid-wave rather than halt+reset.

Phase 4b (3 commits) executed the pivot:
- Removed `AgentChatWorkspace`, `FloatingComposerContainer`, `ChatStatusChipRow`, `WorkbenchApprovalSurface`-in-chat, `ChatWorkbenchComparePane`, `ChatHistorySidebar` from the chat-only shell.
- Restructured `ChatWorkbenchBody`'s desktop path to `rail | dock-main-area` (dock fills full height via `flex-1`).
- Relocated model + permission chips from `ChatStatusChipRow` to `ChatOnlyTitleBar` as a `WorkbenchModelChips` component (Cole's call, Option 2).
- `AgentChat/` code stayed in place — IDE shell still consumes it.
- Migrated Phase 3's `position: relative` anchor from chat-area row to the new dock-main-area wrapper.
- Adjusted slot-height defaults `{ primary: 280, secondary: 180 }` for the full-height main area (pragmatic 60/40 split; superseded by Phase 4c's collapse-aware computation).

### Phase 4c — Per-slot open/close (`18fbfa03` + `6b52c908` + `208a1168`)

Surfaced during the second smoke walk: full-height dock with no way to hide one slot independently.

- `▾`/`▴` button per slot in the slot header. Click collapses to 28px header strip; sibling grows to fill via `computeSlotDisplayHeights`. Both slots can be collapsed simultaneously (you see two stacked headers + empty space).
- Collapsed state persists via `terminalDockSlotsCollapsed: { primary, secondary }` schema field with forward-migration.
- `+New` stays visible when collapsed (clicking opens the slot); `Rec` + `✕` hide when collapsed.
- Divider drag is no-op when either slot is collapsed (divider still renders to avoid layout shift).
- Closed the Tier 3 follow-up `2026-05-16-wave-89-phase-4b-dock-visible-semantic-drift.md` by removing `dock.visible` / `onToggleTerminal` / `DockCloseButton` / `DockHeader` from the workbench shell (whole-dock toggle was dead; per-slot replaces it).
- `useTerminalDockState.visible` still serves the IDE-shell `TerminalPane` — untouched.
- 27 net-new tests across 3 files: `useDockSlotHeights` (22), `DockSlot` (20), `ChatWorkbenchTerminalDock` (7).

## Final test counts

- `test:layout` — 1041/1044 pass (3 pre-existing skips)
- `test:agentchat` — 945/945
- `test:shared` — 52/52
- `lint` — 0 errors (4 pre-existing warnings, unchanged from Wave 93 baseline)
- `tsc --noEmit` — clean

## Architectural decisions (per `wave-89-decisions.md`)

7 decisions locked. The first 6 were upfront; Decision 7 was the mid-wave pivot. See the ADR for the full Industry-standard / Emerging-best-practice / Experimental spectrum framing for each.

1. Sibling-stack resize: extend `useResizable`, not a separate hook.
2. Stacked terminals: two distinct slots, each with its own `TerminalManager` session.
3. Overlay scope: BOTH utility drawer AND artifact pane migrate to `OverlayDrawer`.
4. Overlay positioning: non-modal, chat-area-anchored (later: dock-main-area-anchored post-pivot).
5. Persistence: extend `dockPersistenceSchema` with `terminalDockSlots` + `overlayDrawerWidth` + `artifactOverlayWidth`.
6. Migration UX: auto-switch silently (no opt-in toggle).
7. **Terminal-first pivot** (2026-05-16): drop AgentChat from the ChatOnlyShell mount tree; archive-move deferred.

## Open follow-ups

In `roadmap/follow-ups/`:
- `2026-05-16-wave-89-deferred-smoke-gate.md` — **manual smoke gate deferred** at ship time per Cole's call (real priority is the hang fix). Walk after the hang lands.
- `2026-05-16-wave-89-tool-bridge-runtime-smoke.md` — tool-bridge routing (focus slot N → bridge returns slot N output) needs runtime confirmation; structurally wired and unit-tested.
- `2026-05-16-wave-89-stacked-dock-integration-test.md` — `ChatWorkbenchTerminalDock.stacked.test.tsx` component-level pointer-event drag flow deferred; math is unit-tested.
- `2026-05-16-wave-89-dead-useWorkbenchCompare-hook.md` — `useWorkbenchCompare` is now a dead call in `ChatWorkbenchBody.model.ts` post-pivot. Harmless, mechanical cleanup.

In `roadmap/bugs/`:
- `2026-05-16-main-thread-hang-on-context-rebuild.md` — **2.5-minute UI freeze**. Pre-existing (not Wave 89). Diagnostician identified `generateRepoMap`'s ~200 synchronous SQLite queries as root cause. Instrumentation partial-landed (3/5 files); 2 deferred (queryEngine.ts, repoMapGenerator.ts hit max-lines:300 cap — need helper extraction). **Next Lane B fix wave**.

Vendor knowledge: `/promote-vendor-lessons 89` likely no-op — no new vendor SDK touched.

## Risk acceptance

Shipped on:
- Local gates only (Windows). CI minutes still exhausted from Wave 92/93 burst (refresh expected ~2026-06-01).
- **No manual smoke gate**. The renderer rule explicitly requires this for `src/renderer/components/Layout/**` changes; deferral filed at `2026-05-16-wave-89-deferred-smoke-gate.md`. Risk: visual-defect class regressions (fabricated tokens, debug labels, no-op buttons) not eliminated by tests.

Bounded risk: Wave 89's surfaces (`OverlayDrawer`, `DockSlot`, `useDockSlotHeights`, `ChatWorkbenchOverlays`, `WorkbenchModelChips`) are tightly scoped; visual issues should surface immediately in regular use and can be hotfixed.

## What's next

1. **Lane B fix wave: main-thread hang.** Top priority. `generateRepoMap` async/yield refactor. Bug file has the full diagnosis + repro + suggested fix paths.
2. **Wave 89 deferred smoke walk** — after the hang fix.
3. **Wave 90 — interactive `claude` substrate swap.** Wire `primary` slot to a long-running interactive `claude` session (replaces the old per-turn `claude -p` substrate).
4. **Wave 91 — substrate cleanup.** Remove the dead `-p` path entirely (Wave 89's pivot turns this into a removal, not a coexistence question per ADR Decision 7).
