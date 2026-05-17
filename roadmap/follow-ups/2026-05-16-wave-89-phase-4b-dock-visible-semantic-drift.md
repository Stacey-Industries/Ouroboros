---
status: OPEN
created: 2026-05-16
updated: 2026-05-16
---

# Wave 89 Phase 4b — `dock.visible` semantic drift after terminal-first pivot

## Context

Phase 4b (commits `1dd718d0` + `df70495d` + `5fc033b1`) pivoted ChatOnlyShell to terminal-first. The two-slot dock now fills the entire main area instead of being a bottom strip below chat.

The `dock.visible` state and the `onToggleTerminal` title-bar control predate the pivot. They were Wave 46/88 affordances that let the user collapse the bottom dock to reveal more chat space. With chat removed and the dock now the whole main area, "hide the dock" would leave a blank shell — the affordance is semantically broken.

The Phase 4b subagent flagged this; the workaround it left in place is that `dock.visible` retains meaning via the `DockCloseButton` inside the dock header (still there for chrome consistency), but `onToggleTerminal` in the title bar should be removed or repurposed.

## What to do

Pick one:

1. **Remove both** — drop `dock.visible` from the layout state, drop `onToggleTerminal` from the title bar, drop `DockCloseButton` from the dock header. Terminal-first means the dock is permanent; no toggle.
2. **Repurpose `onToggleTerminal` as a fullscreen-toggle** — single-slot focus mode that hides one slot (primary or secondary) to give the other the full main area. Useful for "I just want the interactive Claude visible" or "show me only the dev shell."
3. **Repurpose as a sidebar-pin-style cycle** — three states: both slots visible (default) / primary only / secondary only.

Option 1 is the easiest; options 2 and 3 add UX value but require new state. Recommend option 1 for now; UX-iterate later if dual-slot is too crowded.

## Why this is OPEN not BLOCKING

The current state is functional — `dock.visible` defaults to true and there's no obvious way for the user to toggle it off (the title-bar control may have been removed by Phase 4b; verify). If a user finds it and hides the dock, they see blank. Edge-case visual bug; no data loss; recoverable by relaunching.

## Promotion criteria

Fold into the next chat-only shell UX wave (likely the same wave that wires interactive `claude` substrate — Wave 90), OR file as a Phase 4c hotfix if Cole's smoke catches a path to trigger it.
