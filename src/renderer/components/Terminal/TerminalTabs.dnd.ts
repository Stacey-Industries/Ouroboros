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

export function getTabClasses(
  isActive: boolean,
  isExited: boolean,
  isDragging: boolean,
  isDragOver: boolean,
): string {
  const base =
    'relative flex items-center gap-1.5 px-3 h-full cursor-pointer select-none text-xs font-mono border-r border-border-semantic shrink-0 transition-all duration-150';
  const dragOver =
    isDragOver && !isDragging
      ? 'bg-surface-raised border-l-2 border-l-[var(--interactive-accent)]'
      : '';
  const dragging = isDragging ? 'opacity-40' : '';
  const state = isActive
    ? 'bg-[var(--term-bg,var(--surface-base))] text-text-semantic-primary after:absolute after:bottom-0 after:inset-x-0 after:h-[2px] after:bg-interactive-accent'
    : isExited
      ? 'bg-surface-panel text-text-semantic-muted opacity-60 hover:opacity-80 hover:bg-surface-raised'
      : 'bg-surface-panel text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-raised';
  return [base, dragOver, dragging, state].filter(Boolean).join(' ');
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
