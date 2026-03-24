import type React from 'react';
import { useCallback, useRef, useState } from 'react';

import type { TerminalSession } from './TerminalTabs';

export interface TabDragDropState {
  draggingId: string | null;
  dragOverId: string | null;
  handleDragStart: (id: string) => void;
  handleDragOver: (e: React.DragEvent, id: string) => void;
  handleDragLeave: () => void;
  handleDrop: (targetId: string) => void;
  handleDragEnd: () => void;
}

function applyReorder(
  sessions: TerminalSession[],
  sourceId: string,
  targetId: string,
  onReorder: (reordered: TerminalSession[]) => void,
): void {
  const reordered = [...sessions];
  const fromIdx = reordered.findIndex((s) => s.id === sourceId);
  const toIdx = reordered.findIndex((s) => s.id === targetId);
  if (fromIdx === -1 || toIdx === -1) return;
  const [item] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, item);
  onReorder(reordered);
}

interface DragCtx {
  ref: React.MutableRefObject<string | null>;
  setId: (id: string | null) => void;
  setOver: (id: string | null) => void;
}

function useDragStartEnd(ctx: DragCtx) {
  const handleDragStart = useCallback(
    (id: string) => {
      ctx.ref.current = id;
      ctx.setId(id);
    },
    [ctx],
  );
  const handleDragEnd = useCallback(() => {
    ctx.ref.current = null;
    ctx.setId(null);
    ctx.setOver(null);
  }, [ctx]);
  const handleDragLeave = useCallback(() => ctx.setOver(null), [ctx]);
  return { handleDragStart, handleDragEnd, handleDragLeave };
}

function useDragDropHandlers(
  ctx: DragCtx,
  sessions: TerminalSession[],
  onReorder?: (reordered: TerminalSession[]) => void,
) {
  const handleDragOver = useCallback(
    (e: React.DragEvent, id: string) => {
      e.preventDefault();
      if (ctx.ref.current !== id) ctx.setOver(id);
    },
    [ctx],
  );
  const handleDrop = useCallback(
    (targetId: string) => {
      const sourceId = ctx.ref.current;
      if (!sourceId || sourceId === targetId || !onReorder) {
        ctx.setOver(null);
        return;
      }
      applyReorder(sessions, sourceId, targetId, onReorder);
      ctx.setOver(null);
    },
    [ctx, sessions, onReorder],
  );
  return { handleDragOver, handleDrop };
}

export function useTabDragDrop(
  sessions: TerminalSession[],
  onReorder?: (reordered: TerminalSession[]) => void,
): TabDragDropState {
  const ref = useRef<string | null>(null) as React.MutableRefObject<string | null>;
  const [draggingId, setId] = useState<string | null>(null);
  const [dragOverId, setOver] = useState<string | null>(null);
  const ctx: DragCtx = { ref, setId, setOver };
  const startEnd = useDragStartEnd(ctx);
  const dropHandlers = useDragDropHandlers(ctx, sessions, onReorder);
  return { draggingId, dragOverId, ...startEnd, ...dropHandlers };
}
