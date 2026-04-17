/**
 * useGraphViewport.ts — zoom/pan state + pointer/wheel handlers.
 *
 * Exposes { transform, onWheel, onPointerDown, onPointerMove, onPointerUp,
 * resetView } so GraphCanvas can remain a pure drawing component.
 */

import { useCallback, useRef, useState } from 'react';

import type { ViewportTransform } from './GraphPanelTypes';
import { INITIAL_TRANSFORM, MAX_SCALE, MIN_SCALE } from './GraphPanelTypes';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DragState { startX: number; startY: number; originX: number; originY: number }

export interface GraphViewport {
  transform: ViewportTransform;
  onWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  resetView: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function zoomAround(current: ViewportTransform, delta: number, cx: number, cy: number): ViewportTransform {
  const factor = delta < 0 ? 1.1 : 0.9;
  const newScale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
  const ratio = newScale / current.scale;
  return { scale: newScale, x: cx - ratio * (cx - current.x), y: cy - ratio * (cy - current.y) };
}

// ── Pointer drag sub-hook ─────────────────────────────────────────────────────

function usePointerDrag(setTransform: React.Dispatch<React.SetStateAction<ViewportTransform>>) {
  const dragRef = useRef<DragState | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: 0, originY: 0 };
    setTransform((prev) => { if (dragRef.current) { dragRef.current.originX = prev.x; dragRef.current.originY = prev.y; } return prev; });
  }, [setTransform]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setTransform((prev) => ({ ...prev, x: dragRef.current!.originX + dx, y: dragRef.current!.originY + dy }));
  }, [setTransform]);

  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGraphViewport(): GraphViewport {
  const [transform, setTransform] = useState<ViewportTransform>(INITIAL_TRANSFORM);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setTransform((prev) => zoomAround(prev, e.deltaY, e.nativeEvent.offsetX, e.nativeEvent.offsetY));
  }, []);

  const resetView = useCallback(() => setTransform(INITIAL_TRANSFORM), []);
  const { onPointerDown, onPointerMove, onPointerUp } = usePointerDrag(setTransform);

  return { transform, onWheel, onPointerDown, onPointerMove, onPointerUp, resetView };
}
