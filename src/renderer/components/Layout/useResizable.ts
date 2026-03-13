import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

export type PanelId = 'leftSidebar' | 'rightSidebar' | 'terminal';
type ResizeDirection = 'horizontal' | 'vertical';

export interface PanelSizes {
  leftSidebar: number;
  rightSidebar: number;
  terminal: number;
}

const DEFAULT_SIZES: PanelSizes = {
  leftSidebar: 220,
  rightSidebar: 300,
  terminal: 280,
};

const MIN_SIZES: PanelSizes = {
  leftSidebar: 140,
  rightSidebar: 200,
  terminal: 120,
};

const MAX_SIZES: PanelSizes = {
  leftSidebar: 480,
  rightSidebar: 600,
  terminal: 600,
};

function loadSizes(): PanelSizes {
  try {
    const stored = localStorage.getItem('agent-ide:panel-sizes');
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<PanelSizes>;
      return { ...DEFAULT_SIZES, ...parsed };
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_SIZES };
}

function saveSizes(sizes: PanelSizes): void {
  try {
    localStorage.setItem('agent-ide:panel-sizes', JSON.stringify(sizes));
  } catch {
    // ignore storage errors
  }
  if (typeof window !== 'undefined' && window.electronAPI?.config?.set) {
    window.electronAPI.config.set('panelSizes', sizes).catch(() => {});
  }
}

/**
 * Creates (or reuses) a lightweight DOM element that acts as a drag preview line.
 * During drag the panels stay frozen - only this 2px line moves with the mouse.
 * On mouseup the line is hidden and the panel snaps to the final position.
 */
let previewLine: HTMLDivElement | null = null;

function getPreviewLine(): HTMLDivElement {
  if (!previewLine) {
    previewLine = document.createElement('div');
    previewLine.style.cssText =
      'position:fixed;z-index:9999;pointer-events:none;display:none;' +
      'background:var(--accent, #58a6ff);opacity:0.6;transition:none;';
    document.body.appendChild(previewLine);
  }
  return previewLine;
}

function showPreviewLine(direction: ResizeDirection, pos: number): void {
  const el = getPreviewLine();
  if (direction === 'vertical') {
    // Vertical divider tracks clientX.
    el.style.top = '0';
    el.style.bottom = '0';
    el.style.left = `${pos}px`;
    el.style.width = '2px';
    el.style.height = '';
  } else {
    // Horizontal divider tracks clientY.
    el.style.left = '0';
    el.style.right = '0';
    el.style.top = `${pos}px`;
    el.style.height = '2px';
    el.style.width = '';
  }
  el.style.display = 'block';
}

function hidePreviewLine(): void {
  if (previewLine) previewLine.style.display = 'none';
}

export interface UseResizableReturn {
  sizes: PanelSizes;
  startResize: (panel: PanelId, direction: ResizeDirection, startValue: number, startPos: number) => void;
  resetSize: (panel: PanelId) => void;
  /** Apply a complete set of panel sizes (used by workspace layout switching) */
  applySizes: (newSizes: PanelSizes) => void;
}

interface DragState {
  panel: PanelId;
  direction: ResizeDirection;
  startValue: number;
  startPos: number;
  currentSize: number;
}

function clampPanelSize(panel: PanelId, value: number): number {
  return Math.max(MIN_SIZES[panel], Math.min(MAX_SIZES[panel], value));
}

function getResizeDelta(direction: ResizeDirection, event: MouseEvent, startPos: number): number {
  return direction === 'vertical' ? event.clientX - startPos : event.clientY - startPos;
}

function getResizeSign(panel: PanelId): number {
  return panel === 'rightSidebar' || panel === 'terminal' ? -1 : 1;
}

function updatePreviewLine(direction: ResizeDirection, event: MouseEvent): void {
  showPreviewLine(direction, direction === 'vertical' ? event.clientX : event.clientY);
}

function commitDragSize(
  dragState: DragState | null,
  setSizes: Dispatch<SetStateAction<PanelSizes>>,
): void {
  if (!dragState) return;

  setSizes((prev) => {
    const committed = { ...prev, [dragState.panel]: dragState.currentSize };
    saveSizes(committed);
    return committed;
  });
}

function resetDocumentDragState(): void {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

function removeDragListeners(
  handleMouseMove: (event: MouseEvent) => void,
  handleMouseUp: () => void,
): void {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
}

function useResizeDrag(
  setSizes: Dispatch<SetStateAction<PanelSizes>>,
  dragStateRef: MutableRefObject<DragState | null>,
): UseResizableReturn['startResize'] {
  const handleMouseMove = useCallback((event: MouseEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    dragState.currentSize = clampPanelSize(
      dragState.panel,
      dragState.startValue + getResizeSign(dragState.panel) * getResizeDelta(dragState.direction, event, dragState.startPos),
    );
    updatePreviewLine(dragState.direction, event);
  }, [dragStateRef]);

  const handleMouseUp = useCallback(() => {
    hidePreviewLine();
    commitDragSize(dragStateRef.current, setSizes);
    dragStateRef.current = null;
    resetDocumentDragState();
    removeDragListeners(handleMouseMove, handleMouseUp);
  }, [dragStateRef, handleMouseMove, setSizes]);

  const startResize = useCallback(
    (panel: PanelId, direction: ResizeDirection, startValue: number, startPos: number) => {
      dragStateRef.current = { panel, direction, startValue, startPos, currentSize: startValue };
      document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [dragStateRef, handleMouseMove, handleMouseUp],
  );

  useEffect(() => {
    return () => {
      dragStateRef.current = null;
      hidePreviewLine();
      resetDocumentDragState();
      removeDragListeners(handleMouseMove, handleMouseUp);
    };
  }, [dragStateRef, handleMouseMove, handleMouseUp]);

  return startResize;
}

export function useResizable(): UseResizableReturn {
  const [sizes, setSizes] = useState<PanelSizes>(loadSizes);
  const dragStateRef = useRef<DragState | null>(null);
  const startResize = useResizeDrag(setSizes, dragStateRef);

  const resetSize = useCallback((panel: PanelId) => {
    setSizes((prev) => {
      const next = { ...prev, [panel]: DEFAULT_SIZES[panel] };
      saveSizes(next);
      return next;
    });
  }, []);

  const applySizes = useCallback((newSizes: PanelSizes) => {
    setSizes(newSizes);
    saveSizes(newSizes);
  }, []);

  return { sizes, startResize, resetSize, applySizes };
}
