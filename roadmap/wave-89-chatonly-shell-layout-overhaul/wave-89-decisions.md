---
status: PLANNED
created: 2026-05-16
updated: 2026-05-16
---

# Wave 89 — Architecture Decisions

## Decision 1: Sibling-stack resize mechanism

**Context:** Wave 88 replaced `useDockResize` with `useResizable` (fixed-edge mode only — single panel against a container boundary). Wave 89 needs a divider between two stacked terminals that drags both heights against each other within a fixed parent envelope. Choice: extend `useResizable` or introduce a sibling `useSiblingStackResize` hook.

**Options considered:**
- *Industry standard:* Two hooks, one per pattern. Common in React UI libraries (react-resizable, react-split-pane) — separate primitives for "panel-vs-container" and "panel-vs-sibling."
- *Emerging best practice:* Single composable hook with mode parameter. Newer libraries (Allotment, react-resizable-panels) unify under a single API with mode/orientation/group props because the underlying drag math is largely shared.
- *Experimental / cutting-edge:* CSS-only resize via `resize: both` + container queries. Not viable here — needs persistence, sibling coordination, snap behavior.

**Pick:** Single composable hook with mode parameter — extend `useResizable` with a `'sibling-stack'` mode alongside the existing fixed-edge mode. **Tier:** emerging best practice.

**Rationale:** Wave 88 just stabilized `useResizable` as the single resize source of truth — splitting into two hooks immediately would undo that gain. The shared logic (pointer capture, accent preview line, persistence write-back, min-clamp) is significant. The Wave 88 ADR explicitly anticipated this extension (Wave 88 plan, Out of scope: "useResizable sibling-stack extension (Wave 89 Phase 0)").

**Consequences:** `useResizable.ts` grows in API surface. Tests grow with new cases. Existing fixed-edge consumers (left/right sidebar, dock-as-whole) MUST remain untouched — Phase 0's review axis explicitly checks non-regression. If the unified-API grows past ~250 lines or its complexity becomes hard to reason about, future waves may revisit the split. Commits us to: this hook is the single resize primitive for the renderer.

## Decision 2: Stacked-terminal model

**Context:** Top slot is the Wave 90 home for interactive `claude`. Bottom slot is a dev shell. Need to decide: two distinct slots each with its own session, or one container with internal tabs/multiplexing.

**Options considered:**
- *Industry standard:* Tabbed single-container (VS Code, JetBrains terminal panel). One mount, multiple sessions, one visible at a time.
- *Emerging best practice:* Two distinct slots with independent session lifecycles (Warp, Wave terminal, modern split-pane terminals). Each slot is a first-class surface.
- *Experimental:* Dynamic grid (split horizontally + vertically arbitrarily). Out of proportion for this wave.

**Pick:** Two distinct slots, each with its own `TerminalManager` session. **Tier:** emerging best practice.

**Rationale:** The slots serve semantically different purposes — top is the interactive Claude (eventually), bottom is the dev shell. Tabs would conflate them. Wave 90 needs the top slot to be a stable mount point for the interactive-`claude` PTY substrate; tabs would make slot identity fluid. Two slots also match the user's mental model from the HANDOFF brief.

**Consequences:** Higher integration risk at `useTerminalSessions` (does it assume single-dock-single-active?) — flagged as a Phase 1 risk with Tier 3 escalation if the assumption breaks. Two `TerminalManager` mounts means double the xterm initialization cost on dock first-open (negligible — both load WebGL after-open per Wave 88 lifecycle). Commits us to: two-slot is the dock model going forward; rejecting tabs means future per-slot tab support would be a re-architecture.

## Decision 3: Artifact pane → overlay migration

**Context:** The HANDOFF brief says "overlay drawers floating full-height over the right portion" (plural). The utility drawer is clearly an overlay candidate (auto-open from triggers, short-lived interaction). The artifact pane is different — long-running content review, often kept open across many turns. Overlay semantics (backdrop click closes) may be more disruptive than helpful for artifact workflow.

**Options considered:**
- *Option A — Migrate artifact pane to overlay too.* Consistency with utility drawer. Simpler body flex tree (chat-area only, no fixed right-side flex slot). Risk: backdrop-click-dismisses interrupts artifact review.
- *Option B — Leave artifact pane fixed-flex.* Preserves current artifact workflow. Body flex tree retains a single right-side flex slot (artifact pane) but drops the utility drawer slot. Less consistent.
- *Option C — Artifact pane gets a different primitive (e.g., dockable side-panel with explicit close button, no backdrop-dismiss).* Hybrid. More work; introduces a third pattern.

**Pick:** Option A — migrate artifact pane to `OverlayDrawer` too. **Tier:** emerging best practice (matches the utility-drawer treatment).

**Rationale:** Cole's call, 2026-05-16. The body flex tree simplification (`rail | chat-area | terminal-dock`) is the structural win; keeping the artifact pane as a fixed-flex sibling would preserve the same kind of "permanent flex space" friction Wave 89 exists to remove. The backdrop-dismiss concern is mitigated by the artifact pane getting its own width persistence (`artifactOverlayWidth`, default 480px — wider than the utility drawer's 380px to reflect its content-review purpose) and by using the same dismissal-tracking pattern as the utility drawer (once dismissed, does not re-open until the trigger key — the diff identifier — changes).

**Consequences:** Phase 3 covers BOTH surfaces (utility drawer + artifact pane). Two `OverlayDrawer` instances may be open simultaneously — Phase 2's primitive must support this (each instance manages its own state; no global "drawer is open" singleton). Phase 0's schema adds `artifactOverlayWidth` alongside `overlayDrawerWidth`. If the backdrop-click-dismisses-during-review pain emerges post-ship, the fix is a per-drawer `dismissOnBackdropClick` prop addition — not a re-architecture. Commits us to: no fixed-flex right-side surfaces in ChatOnlyShell going forward; overlay is the pattern.

## Decision 4: Overlay drawer positioning + modality

**Context:** Where does the overlay drawer anchor (viewport vs chat-area), and is it modal (focus trap, blocks underneath) or non-modal (allows pass-through interaction)?

**Options considered:**
- *Industry standard:* Modal drawer anchored to viewport edge (Material UI Drawer in temporary variant, Chakra Drawer). Focus-trap, click-outside dismisses, blocks underneath input.
- *Emerging best practice:* Non-modal sliding sheet anchored to layout region, allowing pass-through (Linear's command palette, Notion's right-panel comments). Click-outside still dismisses but doesn't block keyboard input underneath.
- *Experimental:* Detachable / floatable drawer (drag-out into separate window). Out of proportion for this wave.

**Pick:** Non-modal sliding sheet anchored to the chat area's right edge, with non-modal backdrop. **Tier:** emerging best practice.

**Rationale:** The utility drawer's typical workflow is "auto-opens from a trigger, user reads/acts, dismisses." Modal semantics would interrupt the chat composer mid-typing — the user might be drafting a response when an approval auto-opens; locking focus is hostile. Non-modal lets the composer remain focused; backdrop is for click-dismiss affordance, not focus blocking. Anchoring to chat-area (not viewport) means the rail and sidebar are NOT covered by the drawer — they remain available for session navigation.

**Consequences:** No focus trap means `OverlayDrawer` is NOT a substitute for full-screen modals (settings, diff overlay) — those keep their existing modal primitives. Z-index must sit BELOW full-screen modals; Phase 2 documents the chosen value. Commits us to: this primitive is non-modal forever; if a workflow needs modal semantics, a separate `ModalDrawer` primitive gets built.

## Decision 5: Persistence schema extensions

**Context:** Two new persisted layout values (per-slot terminal heights, overlay drawer width) need to land in `dockPersistenceSchema.ts`. Legacy `dockHeight` from Wave 88 needs forward-migration.

**Options considered:**
- *Industry standard:* Add new keys, leave legacy in place indefinitely. Lazy migration on read.
- *Emerging best practice:* Add new keys, one-time forward migration on first read post-upgrade, drop legacy on next write. Matches Wave 88's dock-height migration pattern.
- *Experimental:* Schema versioning with explicit migration scripts (Zod-style `v1 → v2 → v3`). Overkill for a config schema with no breaking-change history.

**Pick:** One-time forward migration on first read post-upgrade, drop legacy on next write. **Tier:** emerging best practice (also matches Wave 88 precedent).

**Rationale:** Consistent with Wave 88's migration. Avoids accumulating dead keys. Avoids the complexity of a versioning system that isn't justified by the schema's stability.

**Consequences:** If a user downgrades to a pre-Wave-89 build after upgrading, their dock heights reset to the Wave 88 default (the legacy key is gone). Acceptable — downgrade is not a supported flow. Commits us to: the same migration pattern for future schema extensions.

## Decision 7: Mid-wave pivot — terminal-first ChatOnlyShell

**Context (added 2026-05-16, mid-Phase-4):** Surfaced during manual smoke gate. Cole's framing: *"Why would we still have chat if it is useless soon? ... terminal first is the only way I can drive it properly moving forward with subscription claude."* Subscription Claude (OAuth, CLI-managed tokens, no API key per [[user_auth_subscription]]) means the `spawnClaude` CLI pattern is the only authorized substrate. The current chat composer (one-shot `claude -p` per turn) is more limited than interactive `claude` for tool-use streaming, multi-turn context, and hooks. Wave 90 was scoped to swap the substrate; this wave catches that the *surface* (chat-bubble UI) should also pivot in the same direction.

**Options considered:**
- *Halt Wave 89, reset, re-plan as "Terminal-First Shell" from scratch.* Architecturally cleanest. Cost: re-planning overhead; commits get cherry-picked.
- *Land Wave 89 as a transitional intermediate (chat + dock), then pivot in Wave 90.* Preserves the locked plan. Cost: ships a layout shape known to be wrong for one wave-cycle.
- *Rescope Wave 89 in-flight.* Add Phase 4b: deactivate chat surface in the ChatOnlyShell, restructure body to be dock-first, move chat affordances (model + permission chips) to the title bar. Cost: wave grows; planning artifact gets a Decision 7 addendum; doc commits get rewritten.

**Pick:** Rescope in-flight (Cole's call, 2026-05-16). **Tier:** pragmatic mid-wave correction.

**Rationale:** The Phase 0/1/2 commits already shipped (`useResizable.sibling-stack`, two-slot dock, `OverlayDrawer` primitive) keep their value under terminal-first — they ARE the terminal-first substrate. Phase 3's overlay migration also keeps value (approvals + diff + artifact still need a UI home; terminal can't render them). Only the chat-area-as-positioned-ancestor wrapper and the `AgentChatWorkspace` mount are obsolete. The actual delta is contained: remove ~6 mounts from the shell, restructure the body, move chip-row to title bar, archive-move deferred. Halting + re-planning would discard zero code and burn ~30 min on ceremony.

**Consequences:**
- **`AgentChat/` code stays in place** (no archive-move this wave). The IDE shell (`InnerAppLayout` / `RightSidebarTabs`) still consumes it. Future work could relocate to `src/renderer/components/_archive-chat-api/` if/when API-based chat becomes a target — preserves optionality.
- **ChatOnlyShell body becomes `rail | dock-main-area`** (no chat sibling). Two-slot dock fills the entire main area, not just the bottom. The dock-vs-body resize handle (`DockResizeHandle`) becomes unreachable in this shell — slot divider stays.
- **Deactivated in chat-only shell:** `AgentChatWorkspace`, `FloatingComposerContainer`, `ChatStatusChipRow`, `WorkbenchApprovalSurface`-inside-chat, `ChatWorkbenchComparePane`, `ChatHistorySidebar` (replaced by `WorkbenchRail`'s session-list groups from Wave 47).
- **Model + permission chips relocate to title bar** (Cole's call, Option 2). Two compact chips between project label and exit button. Cleanest non-Piebald layout that preserves discoverability.
- **Phase 3's chat-area `position: relative` wrapper migrates** from the chat-area row to the dock-main-area wrapper. Overlays now anchor to the dock-main-area's right edge.
- **Wave 89 scope grows** — adds Phase 4b. Phase 4 doc commit (`e20cd8a3`) gets rewritten in Phase 4b. Phase 5 still ships as v2.18.0.
- Commits us to: terminal-first as the ChatOnlyShell's default. Wave 90 wires interactive `claude` into the primary slot; Wave 91 cleans up the dead `claude -p` substrate. The chat composer (per-turn `-p`) is now a Wave-91-removal target, not a Wave-90-coexistence question.

## Decision 6: Migration UX (auto-switch vs opt-in toggle)

**Context:** Wave 89 changes the visible layout (stacked terminals, overlay drawer). Do users see the new layout on first launch post-upgrade, or do they opt in via a toggle?

**Options considered:**
- *Industry standard:* Opt-in toggle via Settings. Conservative. Surfaces the change.
- *Emerging best practice:* Auto-switch silently, surface only if regression. Matches the Wave 88 dock-persistence migration pattern.
- *Experimental:* A/B rollout. Out of proportion.

**Pick:** Auto-switch silently. **Tier:** emerging best practice (also matches Wave 88 precedent).

**Rationale:** A toggle would mean maintaining BOTH layout paths indefinitely, which doubles the maintenance burden for every Wave 89+ change. The Wave 88 dock-persistence migration set the precedent of silent forward-migrate. The new layout is strictly more capable (two terminals vs one; overlay drawer doesn't steal flex space) — there's no UX regression worth a toggle.

**Consequences:** Users see the new layout immediately on upgrade. Any regression surfaces as a bug report and gets fixed forward. No toggle UI to maintain. Commits us to: layout decisions in this wave are durable — reversing them would itself be a wave.
