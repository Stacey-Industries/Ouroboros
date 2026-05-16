/**
 * useResizable.sibling.ts — Pure logic for sibling-stack resize mode.
 *
 * Extracted from useResizable.ts to keep that file under the 300-line ESLint
 * limit. No React imports here — only types and math functions.
 *
 * Do NOT import this file directly from outside the Layout directory.
 * Consume the sibling-stack API via `useResizable()` → `startSiblingResize`.
 */

import type { Dispatch, SetStateAction } from 'react';

import type { PanelId, PanelSizes } from './useResizable';

/** Minimum size enforced on each sibling in sibling-stack mode (px). */
export const SIBLING_MIN_SIZE = 60;

/** Options for the sibling-stack resize mode. */
export interface SiblingResizeOpts {
  topPanel: PanelId;
  bottomPanel: PanelId;
  parentExtent: number;
  startSizes: [number, number];
  startPos: number;
  /** 'vertical' = horizontal divider (clientY delta). Default. */
  direction?: 'horizontal' | 'vertical';
  /**
   * Optional commit callback. When provided, called instead of (not in addition
   * to) writing the committed sizes into the `PanelSizes` React state. Callers
   * that manage their own persistence (e.g. `useDockSlotHeights`) use this to
   * redirect the commit to their own store. Additive surface — existing callers
   * without this option behave exactly as before.
   */
  onCommit?: (sizes: [number, number]) => void;
}

export interface SiblingDragState {
  topPanel: PanelId;
  bottomPanel: PanelId;
  direction: 'horizontal' | 'vertical';
  parentExtent: number;
  startTopSize: number;
  startPos: number;
  /** Current sizes updated on every pointermove before commit. */
  currentSizes: [number, number];
  /** Forwarded from SiblingResizeOpts — see that interface for semantics. */
  onCommit?: (sizes: [number, number]) => void;
}

/**
 * Clamp the raw drag delta so neither sibling goes below SIBLING_MIN_SIZE.
 * topStart/bottomStart are the sizes at drag-start.
 */
export function clampSiblingDelta(
  delta: number,
  topStart: number,
  bottomStart: number,
): number {
  const maxUp = -(topStart - SIBLING_MIN_SIZE);
  const maxDown = bottomStart - SIBLING_MIN_SIZE;
  return Math.max(maxUp, Math.min(maxDown, delta));
}

/**
 * Compute new [topSize, bottomSize] from the current pointer event.
 * Sum is always equal to state.parentExtent.
 */
export function computeSiblingSizes(
  state: SiblingDragState,
  event: PointerEvent,
): [number, number] {
  const raw =
    state.direction === 'vertical'
      ? event.clientY - state.startPos
      : event.clientX - state.startPos;
  const bottomStart = state.parentExtent - state.startTopSize;
  const clamped = clampSiblingDelta(raw, state.startTopSize, bottomStart);
  const topSize = state.startTopSize + clamped;
  return [topSize, state.parentExtent - topSize];
}

/** Write committed sibling sizes into React state and persist. */
export function commitSiblingDrag(
  dragState: SiblingDragState | null,
  setSizes: Dispatch<SetStateAction<PanelSizes>>,
  saveSizes: (sizes: PanelSizes) => void,
): void {
  if (!dragState) return;
  if (dragState.onCommit) {
    dragState.onCommit(dragState.currentSizes);
    return;
  }
  const [topSize, bottomSize] = dragState.currentSizes;
  setSizes((prev) => {
    const committed = {
      ...prev,
      [dragState.topPanel]: topSize,
      [dragState.bottomPanel]: bottomSize,
    };
    saveSizes(committed);
    return committed;
  });
}

/** Build the initial SiblingDragState from caller opts. */
export function buildSiblingDragState(opts: SiblingResizeOpts): SiblingDragState {
  return {
    topPanel: opts.topPanel,
    bottomPanel: opts.bottomPanel,
    direction: opts.direction ?? 'vertical',
    parentExtent: opts.parentExtent,
    startTopSize: opts.startSizes[0],
    startPos: opts.startPos,
    currentSizes: [opts.startSizes[0], opts.startSizes[1]],
    onCommit: opts.onCommit,
  };
}
