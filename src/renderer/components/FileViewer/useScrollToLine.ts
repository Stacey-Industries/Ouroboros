import { useEffect } from 'react';
import type { RefObject } from 'react';

const LINE_HEIGHT = 20.8;
const PADDING_TOP = 16;
const HIGHLIGHT_DURATION = 1200;
const HIGHLIGHT_OPACITY_TRANSITION = 'opacity 0.8s ease-out';

function createHighlightOverlay(top: number, height: number): HTMLDivElement {
  const el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.left = '0';
  el.style.right = '0';
  el.style.top = `${top}px`;
  el.style.height = `${height}px`;
  el.style.backgroundColor = 'var(--accent)';
  el.style.opacity = '0.25';
  el.style.pointerEvents = 'none';
  el.style.transition = HIGHLIGHT_OPACITY_TRANSITION;
  el.style.zIndex = '5';
  return el;
}

function flashHighlight(container: HTMLElement, line: number): void {
  const top = PADDING_TOP + (line - 1) * LINE_HEIGHT;
  const overlay = createHighlightOverlay(top, LINE_HEIGHT);

  const contentRow = container.firstElementChild as HTMLElement | null;
  if (contentRow) {
    contentRow.style.position = 'relative';
    contentRow.appendChild(overlay);
  } else {
    container.appendChild(overlay);
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.opacity = '0';
    });
  });
  setTimeout(() => overlay.remove(), HIGHLIGHT_DURATION);
}

/**
 * Listen for `agent-ide:scroll-to-line` DOM events and scroll
 * the file viewer to the requested line with a brief highlight flash.
 */
export function useScrollToLine(
  filePath: string | null,
  scrollRef: RefObject<HTMLDivElement | null>,
  codeRef: RefObject<HTMLDivElement | null>
): void {
  useEffect(() => {
    function onScrollToLine(e: Event): void {
      const detail = (e as CustomEvent<{ filePath: string; line: number }>).detail;
      if (detail.filePath !== filePath) return;
      if (!scrollRef.current || !codeRef.current) return;

      const container = scrollRef.current;
      const gutterLines = container.querySelectorAll('[aria-hidden="true"] > div');
      const lineHeight = gutterLines.length > 0
        ? (gutterLines[0] as HTMLElement).offsetHeight
        : LINE_HEIGHT;

      const scrollTarget = PADDING_TOP + (detail.line - 1) * lineHeight;
      container.scrollTo({
        top: scrollTarget - container.clientHeight / 3,
        behavior: 'smooth',
      });

      flashHighlight(container, detail.line);
    }

    window.addEventListener('agent-ide:scroll-to-line', onScrollToLine);
    return () => window.removeEventListener('agent-ide:scroll-to-line', onScrollToLine);
  }, [filePath, scrollRef, codeRef]);
}
