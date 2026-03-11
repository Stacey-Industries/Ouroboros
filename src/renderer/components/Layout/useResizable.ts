import { useState, useCallback, useRef, useEffect } from 'react';

export type PanelId = 'leftSidebar' | 'rightSidebar' | 'terminal';

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
 * During drag the panels stay frozen — only this 2px line moves with the mouse.
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

function showPreviewLine(direction: 'horizontal' | 'vertical', pos: number): void {
  const el = getPreviewLine();
  if (direction === 'vertical') {
    // Vertical divider → line tracks clientX
    el.style.top = '0';
    el.style.bottom = '0';
    el.style.left = `${pos}px`;
    el.style.width = '2px';
    el.style.height = '';
  } else {
    // Horizontal divider → line tracks clientY
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
  startResize: (panel: PanelId, direction: 'horizontal' | 'vertical', startValue: number, startPos: number) => void;
  resetSize: (panel: PanelId) => void;
}

export function useResizable(): UseResizableReturn {
  const [sizes, setSizes] = useState<PanelSizes>(loadSizes);
  const dragStateRef = useRef<{
    panel: PanelId;
    direction: 'horizontal' | 'vertical';
    startValue: number;
    startPos: number;
    currentSize: number;
  } | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const state = dragStateRef.current;
    if (!state) return;

    const { panel, direction, startValue, startPos } = state;

    const delta =
      direction === 'vertical'
        ? e.clientX - startPos
        : e.clientY - startPos;

    const sign =
      panel === 'rightSidebar' || panel === 'terminal' ? -1 : 1;

    const raw = startValue + sign * delta;
    const clamped = Math.max(MIN_SIZES[panel], Math.min(MAX_SIZES[panel], raw));
    state.currentSize = clamped;

    // Only move the lightweight preview line — panels stay frozen
    const pos = direction === 'vertical' ? e.clientX : e.clientY;
    showPreviewLine(direction, pos);
  }, []);

  const handleMouseUp = useCallback(() => {
    hidePreviewLine();

    if (dragStateRef.current) {
      const { panel, currentSize } = dragStateRef.current;
      setSizes(prev => {
        const committed = { ...prev, [panel]: currentSize };
        saveSizes(committed);
        return committed;
      });
    }
    dragStateRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const startResize = useCallback(
    (panel: PanelId, direction: 'horizontal' | 'vertical', startValue: number, startPos: number) => {
      dragStateRef.current = { panel, direction, startValue, startPos, currentSize: startValue };
      document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [handleMouseMove, handleMouseUp],
  );

  const resetSize = useCallback(
    (panel: PanelId) => {
      const next = { ...sizes, [panel]: DEFAULT_SIZES[panel] };
      setSizes(next);
      saveSizes(next);
    },
    [sizes],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      hidePreviewLine();
    };
  }, [handleMouseMove, handleMouseUp]);

  return { sizes, startResize, resetSize };
}
