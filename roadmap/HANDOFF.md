# Session Handoff — 2026-05-16 (Wave 89 SHIPPED, hang-fix next)

**Audience:** the next Claude Code session.

---

## TL;DR

**Wave 89 (ChatOnlyShell Terminal-First Pivot) is shipped** — released as **v2.18.0**, tagged. Started as a chat-shell layout overhaul; mid-wave the strategic direction shifted to terminal-first (subscription Claude → CLI-only substrate → chat-bubble UI becomes vestigial post-Wave-90). The dock infrastructure (Phase 0/1) and overlay infrastructure (Phase 2/3) stayed; the AgentChat surface was removed from the ChatOnlyShell mount tree (code preserved for the IDE shell + future API-chat re-introduction). 8 commits + 4 hotfixes + 1 pivot ADR.

Full story in `roadmap/wave-89-chatonly-shell-layout-overhaul/wave-89-result.md`.

**⚠️ Two open obligations before next user-visible work:**
1. **Manual smoke gate DEFERRED** at ship time (Cole's call — the hang interrupts smoke walks). Filed at `roadmap/follow-ups/2026-05-16-wave-89-deferred-smoke-gate.md`. Walk after the hang fix lands.
2. **CI bypassed for v2.18.0.** GitHub Actions minutes still exhausted from the Wave 92/93 burst (~refresh expected 2026-06-01). Local gates only:
   - typecheck: clean
   - lint: 0 errors, 4 pre-existing warnings (unchanged)
   - `test:layout`: 1041/1044 (3 pre-existing skips)
   - `test:agentchat`: 945/945
   - `test:shared`: 52/52

Risk surface is bounded: Wave 89's surfaces (`OverlayDrawer`, `DockSlot`, `useDockSlotHeights`, `ChatWorkbenchOverlays`, `WorkbenchModelChips`) are tightly scoped; visual issues should surface immediately in regular use and can be hotfixed.

**Next wave: Lane B fix — `roadmap/bugs/2026-05-16-main-thread-hang-on-context-rebuild.md`** (Cole's explicit next priority).

---

## What's the hang in 30 seconds

**2.5-minute UI freeze** during cold-graph-rebuild startup. Looks like a crash from outside; process is actually fine, just unresponsive. Diagnostician (Sonnet) identified the root cause precisely:

`triggerContextLayerRebuildAfterGraphReady` → `forceRebuild` → `generateRepoMap` fires ~200 synchronous SQLite Cypher queries on the main thread with NO yield points across three phases:
- `enrichSummariesWithGraphSignatures` (~50 calls)
- `buildCrossModuleDependenciesFromGraph` (~100 calls, 2 per module)
- `computeAllModuleHotspotScores` (~50 calls)

At ~0.75s per query against the 23.4K-node graph = ~150s = the observed 152s block.

Wave 89 confirmed NOT a contributor — Phase 1's dual `useTerminalSessions` operates entirely in the renderer; no path to the main-thread SQLite fan-out.

**Suggested fix paths** (Lane B wave's call):
1. Yield-between-queries via `await new Promise(setImmediate)` or microtask scheduling.
2. Move the entire fan-out to a worker thread.
3. Batch all Cypher queries into a single multi-statement query with proper SQLite indexing.

Instrumentation partially landed (3/5 files via Phase 4c's commit sweep at `6b52c908`). 2 files (`queryEngine.ts`, `repoMapGenerator.ts`) hit max-lines:300 — re-add per-phase timing after extracting `buildRepoMapPhases` helpers. Reproduction steps + diagnostician findings in the bug file.

---

## Wave 89 — what shipped (v2.18.0)

### Phase 0 — `useResizable` sibling-stack + dock persistence schema (`dfa3acf9` + `7ceca999`)
- `startSiblingResize` function alongside existing `startResize`. Pure math in `useResizable.sibling.ts`.
- `dockPersistenceSchema.ts` declares `terminalDockSlots`, `overlayDrawerWidth`, `artifactOverlayWidth`. Forward-migrate legacy `dockHeight` via 60/40.
- Phase 1 revision (`7ceca999`) routes `useDockSlotHeights` drag through `startSiblingResize` via additive `onCommit` callback — honors ADR Decision 1.

### Phase 1 — Two-slot stacked terminal dock (`861343b4` + `7ceca999` + `e11ef53c`)
- `DockSlot.tsx` per-slot component, each with own `useTerminalSessions` instance.
- `SPLIT_TERMINAL_EVENT` payload extended with `{ slot, sessionId }`; legacy sites default to `'primary'`.
- Hotfix `e11ef53c`: removed dead `useDockHandlers` helper that crashed on dock open via a type-cast stub missing `recordingSessions`.

### Phase 2 — `OverlayDrawer` primitive (`2412b029`)
- Non-modal slide-in, anchored to nearest positioned ancestor (not viewport). Z-index 200. Mica-safe `rgba(0,0,0,0.35)` backdrop. Window-scoped Escape with `stopPropagation`.
- 16/16 tests pass.

### Phase 3 — Utility drawer + artifact pane overlay migration (`5e1697b7`)
- Both surfaces migrated to `OverlayDrawer` instances (ADR Decision 3 → Option A).
- `useOverlayDrawerWidths` for per-surface width persistence.
- `ChatWorkbenchOverlays.tsx` mount point. Tile layout: artifact right-anchored, utility left of artifact.

### Phase 4 + 4b — The pivot (`e20cd8a3` + `a5fccc64` + `1dd718d0` + `df70495d` + `5fc033b1`)
- ADR Decision 7 (`a5fccc64`): subscription Claude → terminal-first is the only authorized driving path.
- Phase 4b (3 commits): removed `AgentChatWorkspace`, `FloatingComposerContainer`, `ChatStatusChipRow`, `WorkbenchApprovalSurface`-in-chat, `ChatWorkbenchComparePane`, `ChatHistorySidebar` from the chat-only shell. Restructured body to `rail | dock-main-area`. Dock fills full height via `flex-1`. Model + permission chips relocated to title bar as `WorkbenchModelChips`.
- AgentChat code stays in place (IDE shell still consumes it).

### Phase 4c — Per-slot open/close (`18fbfa03` + `6b52c908` + `208a1168`)
- `▾`/`▴` button per slot in header. Collapses to 28px header strip; sibling grows to fill.
- Both slots collapsible simultaneously. Collapsed state persists.
- Removed dead `dock.visible` / `onToggleTerminal` / `DockCloseButton` / `DockHeader` from workbench shell.
- 27 net-new tests.

### Wave-wrap (this commit)
- `wave-89-result.md` written; `CHANGELOG.md [2.18.0]` entry; this HANDOFF.

---

## Open follow-ups (post-Wave-89)

In `roadmap/follow-ups/`:
- **`2026-05-16-wave-89-deferred-smoke-gate.md`** — manual smoke gate deferred at ship time. **Highest-priority follow-up** — walk after the hang fix.
- `2026-05-16-wave-89-tool-bridge-runtime-smoke.md` — tool-bridge routing runtime confirmation deferred.
- `2026-05-16-wave-89-stacked-dock-integration-test.md` — divider-drag component-level pointer integration test deferred.
- `2026-05-16-wave-89-dead-useWorkbenchCompare-hook.md` — dead hook call in `ChatWorkbenchBody.model.ts` post-pivot. Mechanical cleanup.
- `2026-05-16-wave-89-phase-4b-dock-visible-semantic-drift.md` — **RESOLVED** by Phase 4c (kept for history).
- (Pre-existing follow-ups in folder; see listing for the long-tail.)

In `roadmap/bugs/`:
- **`2026-05-16-main-thread-hang-on-context-rebuild.md`** — TRIAGED + diagnosed. **Next Lane B fix wave.**
- `2026-05-15-e2e-teardown-hang.md` — still open (Wave 93 carry-over). Re-enabling e2e blocked on this.

In `roadmap/deferred/`: unchanged from Wave 93.

---

## What to do next

1. **Lane B fix wave: main-thread hang.** Top priority per Cole. Start with `roadmap/bugs/2026-05-16-main-thread-hang-on-context-rebuild.md`. Likely shape: `/define` the contract → extract helpers in `repoMapGenerator.ts` + `queryEngine.ts` to bring them under max-lines:300 → re-add per-phase trace logging (the deferred 2/5 files of instrumentation) → reproduce with the new traces → pick a fix path (yield / worker / batch) → B3 → smoke gate that proves the 152s freeze is gone.

2. **Walk Wave 89's deferred smoke** — after the hang fix. Full checklist preserved in `roadmap/follow-ups/2026-05-16-wave-89-deferred-smoke-gate.md`.

3. **Wave 90 — interactive `claude` substrate.** Wire `primary` slot to a long-running interactive `claude` session. Wave 89's Phase 1 + 4b ship the layout home; Wave 90 fills it with the substrate.

4. **Wave 91 — `-p` substrate cleanup.** Remove the dead per-turn `claude -p` substrate code (ADR Decision 7 turns this from a coexistence question into a removal).

5. **CI minutes restoration.** GitHub Actions refresh expected ~2026-06-01. When minutes return, push any tiny change (or `gh run rerun`) to validate the v2.18.0 commits on Linux + macOS.

## Stashed work (preserved)

- `stash@{0}` — "pre-pivot WIP: wave-87 chat-orchestration + wave-m5 docs" (untouched).
- `wave-87-chat-orchestration-cleanup` branch — 16 local-only commits, untouched. Wave 88→89 supersedes substrate goals; resurrect or abandon — Cole's call.

## Vendor knowledge

`/promote-vendor-lessons 89` — likely no-op. No new vendor SDK touched in this wave.
