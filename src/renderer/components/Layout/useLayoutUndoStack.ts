/**
 * useLayoutUndoStack.ts — Ring-buffer undo stack for layout mutations (Wave 28 Phase D).
 *
 * Depth capped at 10. push() stores the pre-mutation tree. pop() returns and
 * removes the most recent entry. canUndo is true when the stack is non-empty.
 */

import { useCallback, useRef, useState } from 'react';

import type { SerializedSlotNode } from '../../types/electron-layout';

const MAX_DEPTH = 10;

export interface LayoutUndoStack {
  canUndo: boolean;
  push: (tree: SerializedSlotNode) => void;
  pop: () => SerializedSlotNode | null;
}

export function useLayoutUndoStack(): LayoutUndoStack {
  const stackRef = useRef<SerializedSlotNode[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const push = useCallback((tree: SerializedSlotNode) => {
    stackRef.current = [...stackRef.current, tree].slice(-MAX_DEPTH);
    setCanUndo(true);
  }, []);

  const pop = useCallback((): SerializedSlotNode | null => {
    if (stackRef.current.length === 0) return null;
    const next = [...stackRef.current];
    const top = next.pop() ?? null;
    stackRef.current = next;
    setCanUndo(next.length > 0);
    return top;
  }, []);

  return { canUndo, push, pop };
}
