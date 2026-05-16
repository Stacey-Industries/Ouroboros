---
status: PLANNED
created: 2026-05-16
updated: 2026-05-16
wave: 89
slug: chatonly-shell-layout-overhaul
tag: v2.18.0
---

# Wave 89 — ChatOnlyShell Layout Overhaul

## Context

Wave 88 (Terminal Foundation, SHIPPED 2026-05-14) closed the IDE↔ChatOnlyShell parity gap and replaced bespoke `useDockResize` with `useResizable` — but only proved the **fixed-edge** consumer pattern (a panel resizing against a container boundary). The dock-vs-container case is a poor proxy for what Wave 89 needs: **sibling-stack** resize, where two stacked terminals drag against each other within a fixed parent envelope. The Wave 88 wave plan explicitly deferred the sibling extension to this wave's Phase 0.

Wave 89 is also a layout refactor. The current ChatOnlyShell composition (grounded in this session via `haiku-explorer`):

- `ChatWorkbenchTerminalDock.tsx:293-332` mounts a **single-terminal** dock — one active `TerminalManager` session, fixed-edge resize from the top edge against the body. No stacking.
- `ChatWorkbenchUtilityDrawer.tsx` is a **fixed-layout** tabbed panel in `ChatWorkbenchBody`'s flex row (approvals / review / rules / monitor / activity tabs). Occupies real width permanently when open.
- `ChatWorkbenchArtifactPane.tsx` is similarly **fixed-layout** on the right side of body.
- `useWorkbenchSurfacePolicy.ts:90-119` orchestrates open/close + tab selection for the drawer + artifact pane based on triggers (approvals count, diff key, subagent monitor event). State-only; no layout/resize concerns.
- `useResizable.ts:242` exposes `{ sizes, startResize, resetSize, applySizes }` with `PanelId = 'leftSidebar' | 'rightSidebar' | 'terminal'` and `direction = 'horizontal' | 'vertical'`. Zero sibling-stack support — every panel resizes against its container edge.

The HANDOFF.md brief from Wave 93 ship: *"stacked terminals (interactive Claude on top, dev shell below) + overlay drawers floating full-height over the right portion."* The interactive-Claude-on-top slot is the **layout home** for Wave 90's interactive-`claude` substrate swap; Wave 89 builds the home without yet wiring the substrate. Bottom slot hosts a generic dev terminal (same `TerminalManager` model as today's single dock).

This is a foundation wave for the chat-substrate migration: 88 → 89 → 90 → 91. Wave 89 is the layout slot; Wave 90 fills it with interactive `claude`; Wave 91 cleans up the dead `-p` substrate. Getting the layout right now matters because Wave 90 depends on a stable two-terminal-slot host.

## Goal

After Wave 89, ChatOnlyShell ships with two stacked terminals in the bottom dock — top slot (reserved for Wave 90's interactive Claude; populated with a generic terminal in this wave) and bottom slot (dev shell) — separated by a sibling-resizable horizontal divider. Both heights persist to electron-store across app restart. `useResizable` exposes a sibling-stack mode alongside its existing fixed-edge mode; the dock divider is the first consumer. The utility drawer and artifact pane no longer occupy permanent flex space in `ChatWorkbenchBody`; instead they render as full-height overlays floating over the right portion of the chat area, dismissible via backdrop click or close button, surfaced via `useWorkbenchSurfacePolicy`'s existing triggers. `ChatWorkbenchBody` is structurally simpler — the body is `rail | chat-area | terminal-dock`, with the chat area receiving overlay drawers on top of itself rather than fixed-flex siblings.

## Locked decisions (Phase 0 — ADR)

ADR file: `roadmap/wave-89-chatonly-shell-layout-overhaul/wave-89-decisions.md`.

1. **Sibling-stack resize: extend `useResizable`, do NOT introduce a separate hook.** Add a second mode (`'sibling-stack'`) that drives two adjacent panel sizes against each other within a fixed parent, instead of a single panel against a container edge. Keeps one resize-state source of truth, preserves the accent-preview-line UX already proven in Wave 88, avoids the bespoke-resize collision that Wave 88 explicitly closed.
2. **Stacked-terminal model: two distinct slots, each with its own `TerminalManager` session.** Not a tabs-within-one-dock model. Top slot is `slot: 'primary'` (Wave 90's interactive-claude home; generic terminal in this wave). Bottom slot is `slot: 'secondary'` (dev shell). Both slots route through the existing `useTerminalSessions` orchestration; spawn/close/recording controls live per-slot in a slot-scoped `DockHeaderActions`.
3. **Overlay drawer scope:** BOTH utility drawer (`ChatWorkbenchUtilityDrawer`) AND artifact pane (`ChatWorkbenchArtifactPane`) become overlays. Locked 2026-05-16 (Cole's call, Option A in ADR Decision 3). Body flex tree simplifies to `rail | chat-area | terminal-dock`; no fixed-flex right-side surfaces remain.
4. **Overlay positioning: full-height over the right portion of the chat area.** Width persisted in electron-store (`overlayDrawerWidth`, default 380px). Backdrop is non-modal (clicking outside dismisses the drawer but does not block chat-area input — the chat composer remains keyboard-focusable underneath). Backdrop tint is `var(--surface-scroll-track)` at 30% opacity to preserve theming.
5. **Persistence schema extensions:** add `terminalDockSlots: { primary: number, secondary: number }`, `overlayDrawerWidth: number` (utility, default 380), and `artifactOverlayWidth: number` (artifact, default 480 — wider for content review) to the existing `dockPersistenceSchema.ts`. One-time forward migration reads the old `dockHeight` value and seeds `primary = dockHeight * 0.6, secondary = dockHeight * 0.4` (rough split). No backwards migration — Wave 89 is a forward-only layout change.
6. **Migration UX:** auto-switch to the new layout on first launch post-upgrade. No user-facing toggle to revert (matches the Wave 88 dock-persistence migration pattern). The Wave 88 result brief sets the precedent: forward-migrate silently, surface only if regression.

## Scope

**In scope:**

- **Phase 0** — Extend `useResizable` with a second mode supporting sibling-stack pair drag (two `PanelId`s + a shared parent extent). Add schema fragments in `src/shared/config/dockPersistenceSchema.ts` for `terminalDockSlots`, `overlayDrawerWidth`, and `artifactOverlayWidth` with the forward-migration shim from the old `dockHeight`. Unit-test the new mode's drag math (3-4 cases).
- **Phase 1** — Refactor `ChatWorkbenchTerminalDock.tsx` from single-pane to two-slot stacked dock. Mount two `TerminalManager` instances (or one with two-slot routing — implementer's call, document in commit). Wire sibling-stack `useResizable` mode to the divider between slots. Per-slot `DockHeaderActions` (spawn / close / recording). Both slot heights persist via Phase 0's schema additions.
- **Phase 2** — Build new `OverlayDrawer.tsx` primitive in `src/renderer/components/Layout/ChatOnlyShell/`: full-height, slides in from the right, props `{ open, onClose, width, children, dataTestId }`. Backdrop is a sibling element with `pointer-events: auto` + click-to-dismiss. Width is consumer-controlled (persisted by consumer, not the primitive). Escape-key dismiss. Focus-trap NOT included (non-modal by Decision 4).
- **Phase 3** — Migrate BOTH `ChatWorkbenchUtilityDrawer` AND `ChatWorkbenchArtifactPane` consumers to render inside `OverlayDrawer` instances. Utility width sourced from `overlayDrawerWidth`; artifact width from `artifactOverlayWidth`. Remove both fixed-flex slots from `ChatWorkbenchBody` (and its parts files). Update `useWorkbenchSurfacePolicy` if its auto-open triggers need any adjustment for either surface (likely none — it's state-only and already handles both). Verify two overlays can be open simultaneously without z-index or backdrop interference; the artifact pane sits to the LEFT of the utility drawer when both are open, or both anchor to the right edge and stack (implementer's call — document in commit).
- **Phase 4** — Layout cleanup: simplify `ChatWorkbenchBody` flex tree to `rail | chat-area | terminal-dock`. Update CLAUDE.md files in `ChatOnlyShell/`. Manual smoke gate (per `~/.claude/rules-deferred/manual-smoke-gate.md` — this is a `src/renderer/components/Layout/**` change). Delete any utility-drawer slot styles that are no longer reachable.
- **Phase 5** — Wave wrap: scoped suites (`test:layout`, `test:renderer`, `test:agentchat`), full lint + typecheck + formatter, `/review`, `wave-89-result.md`, `CHANGELOG.md [2.18.0]` (minor — UI surface change), tag `v2.18.0` post-CI, `HANDOFF.md` flip, `/promote-vendor-lessons 89` (likely no-op — no new vendor SDK).

**Out of scope:**

- **Interactive `claude` substrate** — Wave 90. This wave only builds the top-slot LAYOUT HOME; the slot hosts a generic `TerminalManager` session in 89.
- **Drawer-stacking / multi-drawer support beyond utility + artifact** — only utility drawer and artifact pane become overlays in this wave (per locked Decision 3). Both may be open simultaneously. Additional concurrent overlays (e.g., approvals + monitor side-by-side as separate drawers) are a follow-up if UX demand emerges.
- **Sidebar rework** — `ChatHistorySidebar` and `ChatOnlySessionDrawer` are untouched. The three modes (pinned 280px / collapsed 48px / hidden) remain.
- **Status bar / title bar changes** — out of scope.
- **Per-slot terminal-tool-bridge routing** — `ChatOnlyTerminalToolBridge` from Wave 88 routes to `terminal.activeId` (the currently-focused session). The bridge should naturally extend to the two-slot model because both slots register through the same `useTerminalSessions` orchestration; verify no changes needed during Phase 1. If routing breaks, file as Tier 3 follow-up.
- **Command palette / keybind changes** — `Ctrl+J` collapses the dock as a whole (Wave 88). No new per-slot keybinds in this wave.

## Phases

| Phase | Topic | Implementer | Boundary | Scope | Notes |
| ----- | ----- | ----------- | -------- | ----- | ----- |
| 0 | `useResizable` sibling-stack extension + schema | sonnet-implementer | internal-only | M | Extend `src/renderer/components/Layout/useResizable.ts` with a sibling-stack mode. New signature shape (rough — implementer decides exact API): `startResize({ mode: 'sibling-stack', pair: [PanelIdA, PanelIdB], parentExtent: number, startSizes: [number, number], startPos: number })`. The existing fixed-edge mode (single `PanelId`) MUST remain unchanged — all current consumers (left/right sidebar, dock-as-whole) keep working. Add `dockPersistenceSchema.ts` fragments: `terminalDockSlots: { primary: number; secondary: number }` (default `{ primary: 200, secondary: 140 }`) and `overlayDrawerWidth: number` (default 380). Forward-migrate from legacy `dockHeight`: if present, seed `primary = round(dockHeight * 0.6)`, `secondary = dockHeight - primary`, then drop the legacy key on next write. Unit tests: 3-4 cases for sibling-stack math (drag-up grows top, drag-down grows bottom, hits min-clamp, sums to parentExtent). Test shape: **pyramid** (pure logic). |
| 1 | Stacked-terminal dock | sonnet-implementer | internal-only (renderer-only; `useTerminalSessions` is a soft seam, not a process boundary) | L | **Pre-Phase-1 discovery (2026-05-16, haiku-explorer) confirmed slot-agnostic architecture.** Two Tier-1 extensions are REQUIRED and must land in commit 1 of the walking-skeleton: (a) instantiate `useTerminalSessions` twice (one per slot) — each gets its own `sessions[]` / `activeSessionId`, no collision because session IDs are flat-array unique; (b) the existing `SPLIT_TERMINAL_EVENT` is a global window event — both dock instances will receive it and both will fire. Scope the payload: `dispatchEvent(new CustomEvent(SPLIT_TERMINAL_EVENT, { detail: { slot: 'primary' | 'secondary', sessionId } }))`, and have each instance filter on its own slot before acting. No other terminal-orchestration changes needed. Refactor `ChatWorkbenchTerminalDock.tsx` into a two-slot stack. Each slot owns a session lifecycle (mount/spawn/close/recording). The divider between slots uses Phase 0's sibling-stack mode. Slot heights persist via the new schema. The dock-as-whole still resizes against the body top edge via the existing fixed-edge mode (unchanged from Wave 88). Per-slot header actions live in a small refactor of `DockHeaderActions` (probably `DockSlotHeader` + the existing dock-wide `DockHeaderActions` for close-dock / collapse). Confirm Wave 88's `ChatOnlyTerminalToolBridge` still routes correctly to whichever slot has focus (likely yes — both slots register through `useTerminalSessions`); if it doesn't, file as Tier 3 follow-up and document in the phase commit. Test shape: **honeycomb** (multi-component integration: `TerminalManager` × 2 + resize hook + persistence + tool bridge). |
| 2 | `OverlayDrawer` primitive | sonnet-implementer | internal-only | M | **Prerequisite read (HARD):** grep `z-\[|z-index|zIndex` across `src/renderer/components/Layout/ChatOnlyShell/` and `src/renderer/styles/tokens.css` to enumerate existing overlay z-index values (`ChatOnlyDiffOverlay`, `ChatOnlySettingsOverlay`, `KeyboardShortcutCheatSheet`, `CommandPalette`); pick a value BELOW full-screen modals but ABOVE in-layout content and document it inline. New file `src/renderer/components/Layout/ChatOnlyShell/OverlayDrawer.tsx`. Props: `{ open: boolean; onClose: () => void; width: number; onWidthChange?: (w: number) => void; children: ReactNode; dataTestId?: string }`. Renders: a fixed-position container anchored to the right edge of the chat area (NOT the viewport — anchored to its nearest positioned ancestor), full-height, width from props. Slide-in transition (translateX) on open. A non-modal backdrop sibling (semi-transparent, `pointer-events: auto`, click → `onClose`) overlays only the area to the LEFT of the drawer within the chat area. Escape key triggers `onClose` when `open` — bind the keydown listener at the drawer container (or use a scoped React handler on the drawer's wrapper), NOT at `window` level, to avoid stealing Escape from the chat composer underneath (composer uses Escape for clear/blur affordances). NO focus trap. Width drag-handle on the left edge (consumer-supplied via `onWidthChange` — primitive renders the handle but caller persists). Standalone test exercising open/close, backdrop click, escape key, width change. Test shape: **trophy** (UI primitive with state + behavior + accessibility). |
| 3 | Utility drawer + artifact pane overlay migration | sonnet-implementer | internal-only | L | Update BOTH `ChatWorkbenchUtilityDrawer.tsx` AND `ChatWorkbenchArtifactPane.tsx` consumers (in `ChatWorkbenchBody`) to render inside `OverlayDrawer` instances. Utility width from `overlayDrawerWidth`; artifact width from `artifactOverlayWidth`. Each `onWidthChange` writes to its respective persistence key. Remove both fixed-flex slots from `ChatWorkbenchBody` (and its parts files: `ChatWorkbenchBody.rails.tsx` / `.parts.tsx` — exact locations to be determined by reading). `useWorkbenchSurfacePolicy` likely needs zero changes (state-only — `setUtilityOpen(true)` and the diff-key open path for artifact both still work), but verify by reading the policy hook end-to-end before claiming done. Update the body's flex tree to `rail | chat-area | terminal-dock` (chat-area is where both overlays anchor). Decide and document concurrent-overlay layout: when utility AND artifact are both open, do they stack (one in front of the other), tile (utility right, artifact to its left), or auto-dismiss the older? Default recommendation: tile (artifact to the LEFT of utility, both anchored to the chat-area right edge), but implementer's judgment. Test shape: **trophy** (two integration tests: trigger an approval → utility overlay opens / click backdrop / closes; trigger a diff → artifact overlay opens / click backdrop / closes; bonus: trigger both → confirm both visible without z-index collision). |
| 4 | Layout cleanup + smoke | haiku-implementer + orchestrator | internal-only | S | Haiku scope: remove dead utility-drawer-slot styles, update CLAUDE.md in `src/renderer/components/Layout/ChatOnlyShell/` to document new two-slot dock + overlay drawer pattern, update root `CLAUDE.md` only if a Key Files entry changed. Brief: "Your tools are Read/Edit/Write. You CANNOT run tests, lint, or git. After editing, report DONE." Orchestrator scope: run the manual smoke checklist per `~/.claude/rules-deferred/manual-smoke-gate.md` and `roadmap/docs/manual-smoke-gate-checklist.md`. Test shape: **n/a** (cleanup + smoke). |
| 5 | Wave wrap | orchestrator | n/a | S | Scoped suites: `test:layout`, `test:renderer`, `test:agentchat`. Then `npm test` if time permits. `npm run lint`, `npm run typecheck`, formatter. `/review`. Orchestrator diff review. `wave-89-result.md`. `CHANGELOG.md [2.18.0]`. `git push`, await CI, squash-merge on green. `git tag v2.18.0` + push tag. `HANDOFF.md` flip (Wave 89 SHIPPED; next per Cole — Wave 90 interactive-claude substrate or e2e-teardown). `/promote-vendor-lessons 89`. Test shape: **n/a**. |

### Phase ordering

```
Phase 0 (useResizable extension + schema)
   |
   v
Phase 1 (stacked-terminal dock — consumes Phase 0)
   |
   |   Phase 2 (OverlayDrawer primitive — independent of 0/1, parallel)
   |        |
   +--------+
            |
            v
       Phase 3 (utility drawer migration — consumes Phase 2)
            |
            v
       Phase 4 (cleanup + smoke — consumes 1 and 3)
            |
            v
       Phase 5 (wave wrap)
```

**Blocking phases:** Phase 1 blocks on Phase 0 (sibling-stack mode + schema). Phase 3 blocks on Phase 2 (primitive). Phase 4 blocks on 1 AND 3 (cleanup spans both surfaces). Phase 5 blocks on all.

**Parallelization:** Phase 2 has no shared files with Phase 0 or Phase 1 — can dispatch in parallel with Phase 0, and continue while Phase 1 runs. Phase 1 and Phase 2 together cover both surfaces independently.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| `useResizable` sibling-stack mode breaks existing fixed-edge consumers (left/right sidebar, dock-as-whole). | Phase 0's API change is additive — the existing single-`PanelId` `startResize` signature stays. New mode is keyed off the call shape (object vs positional, or an explicit `mode` field). Phase 0's unit tests AND existing consumer tests (left/right sidebar, terminal dock) both run in Phase 0's gate. |
| Forward migration from legacy `dockHeight` to `terminalDockSlots` corrupts users' persisted dock state on first launch. | Phase 0's migration is "if legacy key present, split 60/40 and drop legacy on next write." Unit-test the migration with three fixture cases: (a) legacy present, (b) legacy absent, (c) both present (new wins, legacy dropped). Default fallback if no legacy: `{ primary: 200, secondary: 140 }` (sensible split). |
| Two `TerminalManager` instances in one dock causes session-ID collisions in the global `useTerminalSessions` registry. | Phase 1 must verify session registration treats slots as separate-but-equal — each spawn produces a distinct session ID. If `useTerminalSessions` assumes single-dock-single-active, that surfaces as a Tier 3 architectural follow-up; the implementer must report this in the Phase 1 dispatch result, not paper over it. |
| `ChatOnlyTerminalToolBridge` routes `getTerminalOutput` to the wrong slot when both have active sessions. | Phase 1's gate includes a smoke check: spawn a session in each slot, focus the top slot, ask the chat agent for terminal output, confirm it returns the top slot's output. If not, the bridge needs slot-aware routing — file as Tier 3 if scope-creep, fix in-phase if the routing is a one-line change. |
| `OverlayDrawer` backdrop interferes with chat-composer focus / keyboard input. | Phase 2's primitive is explicitly non-modal (Decision 4) — backdrop has `pointer-events: auto` for click-to-dismiss but does NOT trap focus or capture keyboard. Phase 3's integration test exercises: open drawer, type in chat composer underneath, confirm input lands in composer (not eaten by backdrop). |
| Utility drawer's `useWorkbenchSurfacePolicy` auto-open triggers behave differently as an overlay (e.g., user closes overlay → policy re-opens on next trigger key change → user annoyed). | The policy's existing dismissal-tracking (line 41, 99-100 per the haiku-explorer report) carries forward unchanged — once dismissed, does not re-open until trigger key changes. Phase 3's integration test exercises the dismissal-key cycle. Applies symmetrically to artifact pane (diff-key dismissal-tracking already in policy). |
| Artifact pane's backdrop-click-dismiss interrupts long-running content review (the Decision 3 concern). | Artifact overlay uses the same dismissal-tracking as the utility drawer — once dismissed for diff-key X, it does not re-open until diff-key changes. Combined with the wider default width (480 vs 380) and per-surface width persistence, the workflow approximates the prior fixed-flex experience. Phase 3 manual smoke confirms an opened artifact stays put across multiple chat turns until the user explicitly dismisses it or a new diff arrives. If the pain emerges post-ship, the fix is a per-drawer `dismissOnBackdropClick` prop addition (Decision 3 Consequences). |
| Two simultaneous overlays (utility + artifact) collide visually or in z-index. | Phase 3 picks and documents a concurrent-overlay layout (tile vs stack); Phase 2's `OverlayDrawer` primitive supports multiple instances by design (no global singleton). Manual smoke in Phase 4 confirms: open both, both visible and individually dismissible, neither covers the chat composer. |
| Overlay drawer's z-index collides with existing overlays (`ChatOnlyDiffOverlay`, `ChatOnlySettingsOverlay`, `KeyboardShortcutCheatSheet`, `CommandPalette`). | Phase 2 must pick a z-index BELOW full-screen modals but ABOVE in-layout content. Read existing overlay z-indexes first; document the chosen value in `tokens.css` or `useResizable.ts`-adjacent style file. Manual smoke (Phase 4) confirms: open utility-drawer overlay, open settings modal, confirm settings overlays the drawer. |
| Manual smoke gate (Phase 4) reveals layout regression in a non-Layout subsystem (e.g., `WorkbenchRail` width math depends on the old body flex tree). | Phase 4's smoke checklist explicitly covers rail + chat composer + dock + drawer + artifact pane combos. Any regression surfaces as Tier 3 follow-up filed at `roadmap/follow-ups/{date}-{slug}.md`; if structurally fatal, blocks merge. |
| `OverlayDrawer` backdrop tint (`var(--surface-scroll-track)` at 30% opacity per Decision 4) renders incorrectly over mica/vibrancy always-on transparency. Per `.claude/rules/renderer.md` "Glass / always-on transparency" — `--bg` is forced transparent at runtime; a semi-transparent backdrop over a transparent base bleeds the desktop through. | Phase 2 picks a backdrop value that survives mica/vibrancy. Default revised: use `var(--bg-solid)` at 25-30% opacity OR `rgba(0,0,0,0.35)` (per the renderer rule's allowed exception for scrim opacity). Phase 2's manual mount in dev MUST be on a mica/vibrancy-enabled window (default for the project on Windows); confirm the drawer is legible and chat content is still readable underneath. If visually broken on mica, that's a Phase 2 in-scope fix, not a follow-up. |
| Two `xterm` WebGL contexts (one per slot) hit the browser's WebGL context limit (Chromium caps at ~16 active contexts) or compound the WebGL-renderer-after-open double-cursor bug noted in `.claude/rules/terminal.md`. | Two contexts is safely under the 16 cap. The per-slot mounts MUST follow the existing rule: load `@xterm/addon-webgl` BEFORE `term.open()`, not after, for each slot independently. Phase 1's integration test exercises both slots spawning a session and confirms no double-cursor in either. If WebGL fails on either slot, fall back to canvas renderer for that slot (per-slot, not global). |
| `useResizable`'s existing keydown/escape handling (if any) collides with the new `OverlayDrawer` Escape handler. Both bind on overlap if the resize hook ever attached at window level. | Phase 0 verification: read `useResizable.ts` end-to-end; if it binds keyboard listeners at `window` (it likely doesn't — it's pointer-only), document. Phase 2 binds drawer Escape at the drawer container, never at window, so even if the hook does grab window keys the surfaces don't conflict. |

## Test coverage by phase

| Phase | Unit | Integration | Notes |
| ----- | ---- | ----------- | ----- |
| 0 | `useResizable.test.ts` — extend with 3-4 sibling-stack cases (drag-up, drag-down, min-clamp, sum-preserves-parent). `dockPersistenceSchema.test.ts` — migration cases (legacy present / absent / both). | none new | Pyramid. Pure logic — the hook math and schema migration. |
| 1 | none new | Stacked-dock integration test in `src/renderer/components/Layout/ChatOnlyShell/__tests__/`: mount the dock with both slots, spawn a session in each, drag the divider, assert both slot heights updated and persisted. Existing `test:layout` and `test:agentchat` suites re-run to catch any regression. | Honeycomb. The seams (two `TerminalManager`s + sibling-resize + persistence + tool bridge) are where failures live. |
| 2 | `OverlayDrawer.test.tsx` — open/close, backdrop click, escape key, width-change callback, non-modal focus pass-through. | none | Trophy. UI primitive — type-check + unit + manual smoke at Phase 4. |
| 3 | none new | Utility-drawer overlay integration test: trigger `approvalCount > 0`, assert utility drawer overlay-opens with `tab: 'approvals'`, click backdrop, assert closed, confirm dismissal-tracking prevents re-open for same trigger. Artifact-pane overlay integration test: trigger a diff event, assert artifact overlay-opens, click backdrop, assert closed, confirm dismissal-tracking prevents re-open for same diff-key. Concurrent-overlay test: trigger both, assert both visible and individually dismissible. | Trophy. Integration carries the load — two surfaces, three tests. |
| 4 | none | Existing `test:layout` re-runs for regression. | Cleanup + smoke. The manual smoke checklist IS the integration test. |
| 5 | n/a | n/a | Wrap. |

## Acceptance criteria

- [ ] `useResizable` exports a sibling-stack mode; existing fixed-edge mode unchanged.
- [ ] `useResizable.test.ts` includes ≥ 3 new sibling-stack cases; all pass.
- [ ] `dockPersistenceSchema.ts` declares `terminalDockSlots: { primary: number; secondary: number }`, `overlayDrawerWidth: number`, and `artifactOverlayWidth: number`.
- [ ] Forward migration from legacy `dockHeight` → `terminalDockSlots` is unit-tested with 3 fixture cases.
- [ ] `ChatWorkbenchTerminalDock.tsx` renders two stacked terminal slots, separated by a sibling-resizable divider.
- [ ] Spawning a session in either slot produces a distinct entry in `useTerminalSessions`'s registry (verified by `grep` of session IDs in a manual smoke).
- [ ] `ChatOnlyTerminalToolBridge` returns the focused slot's output when queried (confirmed by smoke: focus top slot, ask agent for terminal output, observe top slot's content).
- [ ] `OverlayDrawer.tsx` exists with props `{ open, onClose, width, onWidthChange?, children, dataTestId? }`.
- [ ] `OverlayDrawer.test.tsx` covers open/close, backdrop click, escape key, width change, non-modal pass-through.
- [ ] `ChatWorkbenchUtilityDrawer` renders inside `OverlayDrawer`; no longer occupies fixed-flex space in `ChatWorkbenchBody`.
- [ ] `ChatWorkbenchArtifactPane` renders inside `OverlayDrawer`; no longer occupies fixed-flex space in `ChatWorkbenchBody`.
- [ ] Utility drawer width persists in electron-store via `overlayDrawerWidth`; artifact pane width via `artifactOverlayWidth`.
- [ ] `useWorkbenchSurfacePolicy` auto-open triggers (approvals / diff / monitor) still fire and open the respective overlay; dismissal-tracking still prevents re-open for same trigger key (across both surfaces).
- [ ] Utility drawer and artifact pane can be open simultaneously without z-index collision or backdrop interference.
- [ ] `ChatWorkbenchBody`'s flex tree is `rail | chat-area | terminal-dock`; no fixed utility-drawer slot AND no fixed artifact-pane slot.
- [ ] `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` reflects the new two-slot dock + overlay drawer pattern.
- [ ] Manual smoke checklist (per `roadmap/docs/manual-smoke-gate-checklist.md`) is completed and signed in `wave-89-result.md`.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test:layout`, `npm run test:renderer`, `npm run test:agentchat` all pass at wrap.
- [ ] `/review` returns PASS or FLAG-with-flags-addressed.
- [ ] `CHANGELOG.md` has a `[2.18.0]` entry; `git tag v2.18.0` exists post-CI.
- [ ] `roadmap/HANDOFF.md` flipped to "Wave 89 SHIPPED" with Wave 90 next.

## Verification

### Per-phase experiential observation

| Phase | Observation point | Path to it | What "working" looks like there |
| ----- | ----------------- | ---------- | ------------------------------- |
| 0 | Internal — no observation point | n/a | n/a (pure-logic + schema; no user-facing surface until Phase 1 consumes it) |
| 1 | Bottom terminal dock in a running ChatOnlyShell session | `npm run dev` → Electron launches → user clicks ChatOnlyShell tab → `ChatWorkbenchTerminalDock` mounts → two slots render, both empty initially → user clicks spawn in top slot → top slot shows a shell prompt → user clicks spawn in bottom slot → bottom slot shows a separate shell prompt → user drags divider → both slot heights change, sum is constant | Two terminals visible stacked in the dock. Dragging the divider smoothly redistributes vertical space between them. Each slot's spawn/close/recording controls work independently. Closing the app and re-launching restores both slot heights from electron-store. |
| 2 | `OverlayDrawer` rendered in an isolated test harness (or Storybook-like mount) | Test mounts `<OverlayDrawer open width={380}>...</OverlayDrawer>` → component renders → backdrop visible → drawer slides in from right → user clicks backdrop → `onClose` fires → drawer slides out | Drawer renders at the specified width, full-height, anchored to the right. Click-outside fires close. Escape fires close. Chat composer underneath is keyboard-focusable through the backdrop (non-modal). |
| 3 | Utility drawer + artifact pane in a running ChatOnlyShell, triggered by an approval and a diff | User starts a chat session → agent requests a tool that needs approval → `approvalCount` increments → utility overlay opens from right with `tab: 'approvals'` → user approves → utility dismissed via backdrop click → agent later produces a diff → artifact overlay opens from right → user reviews → artifact dismissed via close button → bonus: trigger both concurrently and confirm both visible | Both drawers float over the right portion of the chat area. Chat content is still visible underneath (semi-transparent backdrop). Approval + diff-review workflows complete as before. Closing either doesn't shift the chat-area width (the win — both fixed-flex slots are gone). When both are open, neither covers the chat composer; user can dismiss either independently. |
| 4 | Full ChatOnlyShell render + manual smoke checklist | Cole or orchestrator walks through the smoke checklist: open shell → spawn both terminals → drag divider → trigger approval → open utility drawer → trigger diff review → open monitor → resize drawer width → close drawer → spawn another session → close shell → relaunch → verify persistence | Every checklist item passes. No layout shifts, no z-index collisions with existing overlays (settings modal, command palette), no broken keyboard focus. |
| 5 | Wave-end CI run + tag push | `git push` → CI workflow runs on 3-OS matrix → all green → orchestrator squash-merges → `git tag v2.18.0` → push tag | All gates green. PR merged. Tag visible at `git tag -l v2.18.0`. `wave-89-result.md` on master. |

### Data-shape probes

```bash
# Phase 0 — sibling-stack mode + schema
npx vitest run src/renderer/components/Layout/useResizable.test.ts
npx vitest run src/shared/config/dockPersistenceSchema.test.ts

# Phase 1 — stacked dock
npx vitest run src/renderer/components/Layout/ChatOnlyShell/__tests__/ChatWorkbenchTerminalDock.stacked.test.tsx
# Verify schema usage in code
grep -rn "terminalDockSlots" src/renderer/  # expect: ≥1 hit in ChatWorkbenchTerminalDock
grep -rn "terminalDockSlots" src/main/      # expect: ≥1 hit in config schema

# Phase 2 — OverlayDrawer primitive exists and tests pass
test -f src/renderer/components/Layout/ChatOnlyShell/OverlayDrawer.tsx && echo "exists"
npx vitest run src/renderer/components/Layout/ChatOnlyShell/OverlayDrawer.test.tsx

# Phase 3 — utility drawer AND artifact pane are overlays, not fixed-flex
grep -rn "ChatWorkbenchUtilityDrawer\|ChatWorkbenchArtifactPane" src/renderer/components/Layout/ChatOnlyShell/
# Expect: both mounted inside OverlayDrawer instances, NOT as flex siblings in ChatWorkbenchBody*.tsx
grep -rn "artifactOverlayWidth" src/renderer/ src/main/  # expect: ≥1 hit each (consumer + schema)

# Phase 4 — cleanup
grep -rn "utility-drawer-slot\|utilityDrawerSlot\|artifact-pane-slot\|artifactPaneSlot" src/renderer/components/Layout/ChatOnlyShell/
# Expect: zero hits (both slot styles removed)

# Phase 5 — version + tag
git tag -l v2.18.0
grep "## \[2.18.0\]" CHANGELOG.md
```

## Files the next agent should read first

1. `roadmap/wave-89-chatonly-shell-layout-overhaul/wave-89-decisions.md` — ADR with 6 decisions (5 locked, 1 pending Cole's call on artifact-pane); read first.
2. `roadmap/wave-88-terminal-foundation/waveplan-88.md` — exemplar wave shape AND prerequisite context (Wave 88's fixed-edge `useResizable` consumer pattern is what Phase 0 extends).
3. `roadmap/wave-88-terminal-foundation/wave-88-result.md` — what actually shipped in Wave 88; any deviations from its plan that Wave 89 needs to know about.
4. `src/renderer/components/Layout/useResizable.ts` — Phase 0 target. Read end-to-end before extending; the existing fixed-edge API MUST remain unchanged.
5. `src/shared/config/dockPersistenceSchema.ts` — Phase 0 target. Wave 88 added this; Phase 0 extends.
6. `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchTerminalDock.tsx` (lines 293-332 are the current dock entry) — Phase 1 target.
7. `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchBody.tsx` + `.rails.tsx` + `.parts.tsx` — Phase 3 + 4 site; the body flex tree restructure.
8. `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchUtilityDrawer.tsx` — Phase 3 migration target.
8b. `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchArtifactPane.tsx` — Phase 3 migration target (second surface, locked Decision 3).
9. `src/renderer/components/Layout/ChatOnlyShell/useWorkbenchSurfacePolicy.ts` (lines 90-119) — Phase 3 verification site (likely no code change, but read to confirm).
10. `src/renderer/components/Layout/ChatOnlyShell/ChatOnlyTerminalToolBridge.tsx` — Phase 1 verification site (does it still route correctly with two slots?).
11. `src/renderer/hooks/useTerminalSessions.ts` (or wherever the orchestration lives) — Phase 1 risk source: does it assume single-dock?
12. `src/renderer/components/Layout/ChatOnlyShell/CLAUDE.md` — Phase 4 doc update.
13. `roadmap/docs/manual-smoke-gate-checklist.md` — Phase 4 checklist template.
14. `~/.claude/rules-deferred/manual-smoke-gate.md` — the rule itself; Phase 4 enforcement.

## Note to the implementer

This wave is layout refactor. The spirit is: make the dock house two terminals cleanly, make the utility drawer stop stealing fixed flex space, set up the layout slot that Wave 90 will fill with interactive `claude`. Do NOT extend scope by also rewriting the rail, the sidebar, the artifact pane (unless ADR Decision 3 resolves to "yes, artifact pane overlay too" — and even then, that's a separate phase added in revision, not a creep).

The seductive trap is the `useResizable` extension. It is genuinely the foundation for Wave 89 and could grow into a small refactor of the whole resize architecture. Don't. The Phase 0 extension is **additive** — leave the existing fixed-edge API and consumers untouched. If you see an opportunity to "unify" or "simplify" the existing API while you're there, file it as a Tier 3 follow-up. Wave 88 just proved the fixed-edge consumer; destabilizing it for Wave 89 is wave-creep.

The other trap is the `OverlayDrawer` primitive (Phase 2). It is tempting to make it a fully-featured modal system (focus trap, ARIA dialog roles, route blocking, etc.). Decision 4 explicitly makes it non-modal — the chat composer underneath must remain keyboard-focusable. Resist adding modal semantics; if a future workflow truly needs a modal, it'll get a separate `ModalDrawer` primitive.

Phase 1 has a real architectural seam at the `useTerminalSessions` integration. If the existing orchestration assumes "one dock, one active session," that surfaces during Phase 1 and is genuinely Tier 3 — file it, commit what you have, surface to Cole. Do NOT silently work around it by hot-patching `useTerminalSessions`; that's exactly the mental-model divergence that boundary-phase discipline is supposed to catch.

> Before declaring a phase complete, restate the observation point from the Verification table in your own words and describe what you actually observed there. If you could not observe it directly — no live IDE, no triggered chat session, no rendered panel — say so explicitly. Do not substitute "tests pass" for runtime observation. Tests passing at the unit boundary is necessary but not sufficient.

For Phase 1 specifically: the observation is "two stacked terminals, dragging the divider redistributes vertical space, both slot heights persist across restart." If you have not run `npm run dev`, mounted the shell, spawned both terminals, dragged the divider, and restarted the app — say so. Phase 4's manual smoke gate is the second-layer catch, but per-phase observation is the first.

**Walking-skeleton discipline for Phase 1.** This phase introduces a new architectural pattern (multi-session-per-dock). Land it as THREE intra-phase commits, not one:
1. **Skeleton:** two slots mount, one of them spawns a session, basic header. No divider drag yet, no persistence. Confirm in `npm run dev` that both slots exist and one is interactive.
2. **Resize + persistence:** wire the sibling-stack `useResizable` divider; both heights persist via Phase 0's schema. Confirm drag works, sums constant, restart restores.
3. **Per-slot controls + tool-bridge verification:** slot-scoped `DockHeaderActions` (spawn/close/recording), and the `ChatOnlyTerminalToolBridge` smoke from the Risks table (focus top slot, ask agent for terminal output, observe top-slot content).

If commit 1 reveals `useTerminalSessions` assumes single-dock-single-active, that's a Tier 3 surface AT commit 1, not buried under three commits' worth of additions. Cheaper to surface early.

## Orchestrator dispatch checklist

A green per-phase gate with nothing Tier 3 means the orchestrator dispatches the next phase in the same turn. The turn ends between phases only for a Tier 3 discovery needing a user call, a genuine user-judgment decision the grounding doesn't determine, or wave-end. See the Phase-boundary protocol in `~/.claude/notes/wave-process.md`.

1. **Verify ADR exists at `roadmap/wave-89-chatonly-shell-layout-overhaul/wave-89-decisions.md`** with all 6 decisions locked (Decision 3 resolved 2026-05-16: Option A — artifact pane also migrates to `OverlayDrawer`).
2. **Phase 0** (`sonnet-implementer`) — extend `useResizable` with sibling-stack mode + schema fragments + migration shim + unit tests. Gate: `npx vitest run src/renderer/components/Layout/useResizable.test.ts` AND `npx vitest run src/shared/config/dockPersistenceSchema.test.ts` both pass; existing consumer tests (left/right sidebar, terminal dock fixed-edge) still pass. Conceptually risky (resize API extension that must not break existing consumers) — `sonnet-phase-reviewer` dispatch on the diff before declaring the gate green, with the existing-consumer-non-regression check as an explicit review axis.
3. **Phase 2** (`sonnet-implementer`) — `OverlayDrawer` primitive + tests. **Can dispatch in parallel with Phase 0** (no shared files). Gate: `npx vitest run src/renderer/components/Layout/ChatOnlyShell/OverlayDrawer.test.tsx` passes; manual mount in dev session shows slide-in / backdrop / escape / non-modal pass-through. Trivial-ish (new primitive, clean surface) — orchestrator's own diff glance, no reviewer dispatch.
3b. **Pre-Phase-1 discovery dispatch** — BEFORE Phase 1 dispatch, send a `haiku-explorer` (or read directly if already in context) to answer: does `useTerminalSessions` and the upstream `TerminalManager` API treat sessions as slot-agnostic (multiple distinct sessions can be registered and queried independently), or does it assume single-dock-single-active? Return file:line references for the registration path and any singleton/active-id assumptions. This pre-resolves the wave's largest hidden-architecture risk; if the answer is "single-dock-assumed," that's a Tier 3 escalation BEFORE Phase 1 dispatch, not mid-implementation.

4. **Phase 1** (`sonnet-implementer`) — stacked-terminal dock. **Blocks on Phase 0.** Gate: `npm run test:layout` AND `npm run test:agentchat` pass; the new stacked-dock integration test passes; manual smoke confirms two slots spawn distinct sessions and divider drag redistributes space and persists. Conceptually risky (multi-`TerminalManager` integration, possible `useTerminalSessions` assumption break) — `sonnet-phase-reviewer` dispatch with the spec-alignment + integrity axes as primary focus.
5. **Phase 3** (`sonnet-implementer`) — utility drawer + artifact pane overlay migration. **Blocks on Phase 2** (primitive) AND Phase 0 (schema for `overlayDrawerWidth` + `artifactOverlayWidth`). Gate: both overlay integration tests pass (utility AND artifact); concurrent-overlay test passes; `useWorkbenchSurfacePolicy` triggers still fire correctly for both surfaces; manual smoke confirms approval / diff / monitor auto-open AND the two-overlay-open case. Boundary-adjacent (touches the body flex tree that other surfaces depend on; two surfaces migrating in one phase) — `sonnet-phase-reviewer` dispatch with cross-cutting integrity AND spec-alignment (artifact-pane parity with utility-drawer treatment) as the focus axes.
6. **Phase 4** (`haiku-implementer` for cleanup + `orchestrator` for smoke) — haiku scope dispatched with the explicit "you cannot run tests, lint, or git" brief; orchestrator runs the manual smoke checklist and signs it in the result-brief stub. Gate: smoke checklist completed and signed; cleanup diff has zero `utility-drawer-slot` references.
7. **Phase 5** (`orchestrator`) — wave wrap. Run scoped suites (`test:layout`, `test:renderer`, `test:agentchat`), `npm run lint`, `npm run typecheck`, formatter. `/review` mechanical gap-check — verdict gates merge. Orchestrator diff review of the whole wave. Run the data-shape probes from the Verification section. Write `wave-89-result.md` (include the signed smoke checklist from Phase 4). `CHANGELOG.md [2.18.0]` entry. `git push`, await CI, squash-merge on green. `git tag v2.18.0` post-CI; push tag. `HANDOFF.md` flip (Wave 89 SHIPPED; next per Cole — Wave 90 interactive-claude substrate is the natural sequel; e2e-teardown bug-wave is the alternative). `/promote-vendor-lessons 89` — likely no-op (no new vendor SDK touched). **Manual smoke gate: REQUIRED** — this wave touches `src/renderer/components/Layout/**`; the signed checklist from Phase 4 is the artifact.
