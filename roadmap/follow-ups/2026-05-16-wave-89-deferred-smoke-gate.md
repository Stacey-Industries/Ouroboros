---
status: OPEN
created: 2026-05-16
updated: 2026-05-16
---

# Wave 89 — manual smoke gate deferred at ship time

## Context

Wave 89 (ChatOnlyShell Layout Overhaul + mid-wave terminal-first pivot) shipped as v2.18.0 on 2026-05-16. The manual smoke gate per `~/.claude/rules-deferred/manual-smoke-gate.md` was **deferred at Cole's call**:

> "Just defer to smoke, I need to fix the massive issue of the app freezing. Wrap the wave and add a follow up smoke for it."

The 152-second main-thread freeze (`roadmap/bugs/2026-05-16-main-thread-hang-on-context-rebuild.md`) became the immediate priority — walking a manual checklist when the app routinely freezes for 2.5 minutes mid-walk isn't practical until the hang is fixed.

## What WAS validated before ship

Pre-ship gates:
- `test:layout` — 1041/1044 pass (3 pre-existing skips, +27 from Phase 4c)
- `test:agentchat` — 945/945
- `test:shared` — 52/52
- `lint` — 0 errors (4 pre-existing warnings)
- `tsc --noEmit` — clean

Partial smoke walked before deferral:
- Phase 1 → triggered the runtime crash (`Cannot read properties of undefined (reading 'has')`) which was fixed in commit `e11ef53c`.
- Phase 4b → confirmed the "old chat pane was still showing" observation, which led to Decision 7 (terminal-first pivot).
- Phase 4c smoke (per-slot ▾/▴ collapse) was NOT walked.

## What needs to be walked

The full Phase 4c checklist (saved to this file for posterity, copied from the orchestrator's pre-ship brief):

```
- [ ] Light theme + dark theme

### Shell composition (post-pivot)
- [ ] No AgentChatWorkspace, no floating composer, no chip row below composer
- [ ] Body is `rail | dock-main-area` — WorkbenchRail on left, two-slot terminal dock fills entire main area
- [ ] Model + permission chips render in title bar between project label and exit button

### Per-slot collapse (Phase 4c)
- [ ] Each slot has ▾/▴ button in its header
- [ ] Click ▾ on primary — primary collapses to 28px header strip, secondary grows to fill
- [ ] Click ▴ — primary expands back, secondary returns to former height
- [ ] Collapse both — two stacked 28px strips, no terminals; expand buttons still functional
- [ ] +New stays visible when collapsed; Rec + ✕ hide
- [ ] Divider drag is no-op when either slot is collapsed
- [ ] Whole-dock close button is GONE (per-slot collapse replaces it)
- [ ] Close + relaunch — collapsed state restored

### Two-slot dock + tool-bridge (Phase 1)
- [ ] Spawn in both slots — independent sessions, distinct IDs
- [ ] Divider drag works (when both expanded); sum constant
- [ ] Sessions persist heights across restart
- [ ] Focus top slot, ask chat "what's in the terminal?" → returns top-slot content
- [ ] Focus bottom slot → returns bottom-slot content
- [ ] Close top → fallback to bottom slot content

### Overlays (Phase 2 + Phase 3)
- [ ] Trigger an approval → utility drawer overlay opens from right (anchored to dock-main-area)
- [ ] Trigger a diff → artifact overlay opens
- [ ] Both concurrent → tiled (artifact right, utility left)
- [ ] Backdrop dismiss works for both
- [ ] Chat composer is NOT under the overlays (it doesn't exist post-pivot)

### General
- [ ] Title bar drag + window controls still work
- [ ] Ctrl+, settings, Ctrl+/ shortcuts, Ctrl+K palette still reachable
- [ ] No debug labels visible, no fab-token borders, no console errors on cold boot
- [ ] WorkbenchRail session listing works (Wave 47)

Signed: <user> on <YYYY-MM-DD>
```

## Promotion criteria

Walk after the hang fix lands (the Lane B fix wave for `2026-05-16-main-thread-hang-on-context-rebuild.md`) so the smoke walk isn't interrupted by 2.5-minute freezes. Sign + fold the result into the next ship's HANDOFF or this file's resolution note. Close as RESOLVED when signed.

## Risk acceptance

Wave 89 ships v2.18.0 on local gates only (CI minutes also exhausted per Wave 93 HANDOFF). Visual-defect class regressions (fabricated tokens, debug labels, no-op buttons) — the kind the smoke gate exists to catch — were not eliminated by automated tests. The risk is real but bounded: Wave 89's surfaces (`OverlayDrawer`, `DockSlot`, `useDockSlotHeights`, `ChatWorkbenchOverlays`) are tightly scoped; visual issues should surface quickly in regular use and can be hotfixed.
