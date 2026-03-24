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

export function useTabDragDrop(
  sessions: TerminalSession[],
  onReorder?: (reordered: TerminalSession[]) => void,
): TabDragDropState {
  const draggingIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = useCallback((id: string) => {
    draggingIdRef.current = id;
    setDraggingId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggingIdRef.current !== id) setDragOverId(id);
  }, []);

  const handleDrop = useCallback(
    (targetId: string) => {
      const sourceId = draggingIdRef.current;
      if (!sourceId || sourceId === targetId || !onReorder) {
        setDragOverId(null);
        return;
      }
      applyReorder(sessions, sourceId, targetId, onReorder);
      setDragOverId(null);
    },
    [sessions, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleDragLeave = useCallback(() => setDragOverId(null), []);

  return {
    draggingId,
    dragOverId,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  };
}
