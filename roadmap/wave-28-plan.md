# Wave 28 — Drag-and-Drop Pane Composition
## Implementation Plan

**Version target:** v1.9.0 (minor)
**Feature flag:** `layout.dragAndDrop` (default `true`)
**Dependencies:** Wave 17 (preset engine + slots — `LayoutPreset`, `SlotName`, `componentRegistry`)

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | DnD scaffolding — config flag, `DndContext` wrapper, drag handles on pane headers, `DragOverlay` ghost | `useDragAndDrop.ts` (new), `PaneDragHandle.tsx` (new), `AppLayout.tsx`, `configSchemaTail.ts` |
| B | Drop targets on the 6 existing slots; swap-on-drop updates active `LayoutPreset.slots` in state | `useDropTargets.ts` (new), `DroppableSlot.tsx` (new), `layoutPresets/types.ts` (extend), `AppLayout.tsx` |
| C | Edge-split drop zones — top/bottom/left/right thirds of each slot trigger a horizontal or vertical split; slot model extended to tree | `slotTree.ts` (new), `splitSlot.ts` (new), `layoutPresets/types.ts`, `AppLayout.tsx` |
| D | Per-session custom-layout persistence — save derived `LayoutPreset` to config keyed by session ID; promote-to-global via LayoutSwitcher; undo stack (depth 10) | `useCustomLayoutPersistence.ts` (new), `LayoutSwitcher.tsx`, `configSchemaTail.ts` |
| E | UX polish — reset-to-preset action, touch long-press drag (Wave 32 pre-wire), drag perf guard (placeholder preview; content re-renders only on drop) | `PaneDragHandle.tsx`, `useDragAndDrop.ts`, `AppLayout.tsx` |

---

## Feature flag

`layout.dragAndDrop` (default `true`). When `false`, drag handles are not rendered and
`DndContext` is not mounted — presets and resize dividers behave exactly as today.
Flag lives in `configSchemaTail.ts` under the existing `layout` namespace.

---

## Architecture notes

**dnd-kit is already installed** (`@dnd-kit/core`, `@dnd-kit/sortable`).
Use `@dnd-kit/core` only — sortable is not needed; slots are unordered.

**Slot swap (Phase B)** operates on the in-memory `LayoutPreset.slots` override map tracked
in the `useLayoutPreset` context. Wave 17's `LayoutPresetResolver` already exposes a mutable
preset; Phase B adds a `setSlotOverride(slot, descriptor)` mutation to the context value.
No changes to the core `LayoutPreset` type are needed for swap — slots already accept
`Partial<Record<SlotName, ComponentDescriptor>>`.

**Split slots (Phase C)** require extending the slot model to a binary tree
(`SlotNode = LeafSlot | SplitNode`). This is a contained change — `slotTree.ts` owns the
tree type; `AppLayout.tsx` renders it recursively. The six named slots become the initial
leaves; splits produce anonymous children. The tree is JSON-serialisable (string component
keys, no React refs) so it persists via the same `LayoutPreset` mechanism.

**ESLint split points** to anticipate:
- `AppLayout.tsx` is already at ~317 lines. Phase A adds ~30 lines of DndContext wiring —
  extract `renderPanelColumn` helpers before Phase A lands to create headroom.
- `useDragAndDrop.ts` must stay under 40 lines per function; split into
  `useDragState` + `useDragHandlers` if needed.
- `slotTree.ts` (Phase C) will approach 300 lines — split traversal logic into
  `slotTreeOps.ts` if needed.

**Design tokens only** — drag handle chrome uses `bg-surface-raised`,
`border-border-accent`, `text-text-semantic-muted`. `DragOverlay` ghost uses
`bg-surface-overlay` with `opacity-70`. No hex or rgb.

---

## Risks

- **`AppLayout.tsx` line budget** — already near 300 lines; DnD wiring will exceed it
  without pre-splitting. Pre-split in Phase A before adding DnD code. (Not flagged in
  roadmap.)
- **Unusable layout state** → one-click reset-to-preset in Phase D undo stack.
- **Drag perf on large diffs** → Phase E placeholder preview; component re-renders only
  on `onDragEnd`, not `onDragMove`.
- **`DndContext` + xterm pointer capture conflict** — xterm uses `setPointerCapture` for
  selection. Wrap terminal slot in `<NoDragZone>` (DnD kit's `useDraggable` with
  `disabled` prop when pointer is inside the xterm canvas). (Not flagged in roadmap.)
- **Split-slot tree serialisation round-trip** — `SlotNode` must survive JSON
  `stringify → parse`. Validate in Phase C unit tests before wiring persistence.

---

## Acceptance

- Drag the terminal pane header onto `editorContent` slot → slots swap live without data loss.
- Edge-drop on `editorContent` → splits horizontally; both sub-panes are independently populated.
- Session reopen restores custom slot arrangement.
- Undo (Ctrl+Z in layout context, or toolbar button) reverts last drag; up to 10 steps.
- Reset-to-preset restores `ide-primary` slot assignments without losing open files or terminal sessions.
- Feature flag off → no drag handles visible; all existing resize and collapse behaviour unchanged.
- Touch long-press (≥500 ms) on pane header initiates drag on web build (validation target: Wave 32).
