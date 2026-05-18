---
status: OPEN
created: 2026-05-18
updated: 2026-05-18
source: Wave 94 wave-wrap smoke
severity: low
---

# Secondary dock slot — collapsed-empty chrome (28px bar visible)

Surfaced during Wave 94 wave-wrap smoke (Cole, 2026-05-18). Cole flagged
"the bar under the bottom terminal is now back for some reason" while
running claude in the primary slot with the secondary slot collapsed and
empty.

## Current state (post Wave 94)

Looking at the DOM Cole pasted:

```html
<div data-testid="dock-slot-secondary" data-collapsed="true" style="height: 28px;">
  <div class="... border-b ..." style="height: 28px;">
    <button data-testid="dock-slot-secondary-spawn">+ New</button>
    <div><button aria-label="Expand slot">▴</button></div>
  </div>
</div>
```

So the secondary slot, when collapsed AND empty, shows a 28px header
with `+ New` on the left and `▴ expand` on the right. This matches the
Wave 89 Phase 4c design: "+New stays visible when collapsed (so spawning
re-opens); Rec/✕ hide."

## Question to resolve

What is Cole comparing to when he says "back for some reason"? Two
possibilities:

1. **Wave 94 polish commit `1ae44fda` changed the empty-state chrome**
   by removing the "Primary" / "Shell" label and moving `+ New` to the
   left. The COLLAPSED chrome shape is unchanged, but the chrome content
   is different than it was an hour ago. If Cole's mental "should be"
   was the pre-1ae44fda state, this is just visual unfamiliarity, not
   a regression.

2. **Earlier in the smoke walk the secondary slot was hidden entirely
   (height: 0)** because of some other state (e.g., when no project
   was active, or when both slots were uncollapsed). If true, the
   collapsed-empty 28px bar is a regression somewhere.

## Investigation steps

- Confirm with Cole: at the prior comparison point, was the secondary
  slot completely invisible, or did it show different chrome?
- If invisible: trace what gated the secondary slot's render. Likely
  candidate: `ChatWorkbenchTerminalDock.tsx` or `useDockSlotHeights`.
- If different chrome: it's the Wave 94 polish change (`1ae44fda`),
  not a regression — discuss whether collapsed-empty should hide
  entirely OR show a minimal `+ New` affordance.

## Design options if "hide collapsed-empty" is the call

- **Option A:** Always render both slots' 28px chrome (current Wave 89
  + 94 behavior). Pro: discoverable; user always sees "I can have a
  second terminal." Con: 28px of chrome consumed even when never used.
- **Option B:** Hide the secondary slot entirely when collapsed AND
  empty (no sessions in either slot AND collapsed). Reclaims 28px,
  but the user has no entry point to expand the slot once it's hidden.
  Would need a "show secondary slot" affordance on the primary slot's
  header or in the title bar.
- **Option C:** Render a thin 12–16px "tab" affordance instead of full
  chrome — clickable to expand, no `+ New` button. Compact discovery.

## Pointers

- `src/renderer/components/Layout/ChatOnlyShell/DockSlot.tsx`
  `SlotHeader` (empty state) and `SlotCollapseButton`.
- `src/renderer/components/Layout/ChatOnlyShell/ChatWorkbenchTerminalDock.tsx`
  for the slot mounting / conditional render.

Estimate: investigation 15min, fix 1–2 hours depending on chosen option.
