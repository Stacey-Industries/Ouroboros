import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { FoldRange } from './useFoldRanges';

const LINE_HEIGHT = 20.8;
const PADDING_TOP = 16;

interface KeyboardConfig {
  containerRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  hasDiff: boolean;
  foldableLines: Map<number, FoldRange>;
  collapsedFolds: Set<number>;
  setCollapsedFolds: React.Dispatch<React.SetStateAction<Set<number>>>;
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>;
  setShowGoToLine: React.Dispatch<React.SetStateAction<boolean>>;
  setViewMode: React.Dispatch<React.SetStateAction<'code' | 'diff' | 'preview'>>;
  setWordWrap: React.Dispatch<React.SetStateAction<boolean>>;
}

function getCurrentLine(scrollEl: HTMLElement): number {
  const topLine = Math.floor(
    (scrollEl.scrollTop - PADDING_TOP + LINE_HEIGHT / 2) / LINE_HEIGHT
  );
  return Math.max(0, topLine);
}

function findContainingFold(
  lines: Iterable<[number, FoldRange]>,
  currentLine: number
): number | null {
  let best: number | null = null;
  for (const [startLine, range] of lines) {
    if (startLine > currentLine || range.end < currentLine) continue;
    if (best === null || startLine > best) best = startLine;
  }
  return best;
}

function findNearestAfter(
  lines: Iterable<number>,
  currentLine: number
): number | null {
  let best: number | null = null;
  for (const startLine of lines) {
    if (startLine < currentLine) continue;
    if (best === null || startLine < best) best = startLine;
  }
  return best;
}

function findNearestBefore(
  lines: Iterable<number>,
  currentLine: number
): number | null {
  let best: number | null = null;
  for (const startLine of lines) {
    if (startLine >= currentLine) continue;
    if (best === null || startLine > best) best = startLine;
  }
  return best;
}

function handleCollapseFold(cfg: KeyboardConfig): void {
  const scrollEl = cfg.scrollRef.current;
  if (!scrollEl) return;

  const currentLine = getCurrentLine(scrollEl);
  const entries = [...cfg.foldableLines.entries()];
  let bestFold = findContainingFold(entries, currentLine);

  if (bestFold === null) {
    bestFold = findNearestAfter(cfg.foldableLines.keys(), currentLine);
  }
  if (bestFold === null) return;

  const foldLine = bestFold;
  cfg.setCollapsedFolds((prev) => {
    const next = new Set(prev);
    next.add(foldLine);
    return next;
  });
}

function handleExpandFold(cfg: KeyboardConfig): void {
  const scrollEl = cfg.scrollRef.current;
  if (!scrollEl) return;

  const currentLine = getCurrentLine(scrollEl);

  // Build entries only from collapsed folds
  const collapsedEntries: Array<[number, FoldRange]> = [];
  for (const startLine of cfg.collapsedFolds) {
    const range = cfg.foldableLines.get(startLine);
    if (range) collapsedEntries.push([startLine, range]);
  }

  let bestFold = findContainingFold(collapsedEntries, currentLine);

  if (bestFold === null) {
    bestFold = findNearestAfter(cfg.collapsedFolds, currentLine);
  }
  if (bestFold === null) {
    bestFold = findNearestBefore(cfg.collapsedFolds, currentLine);
  }
  if (bestFold === null) return;

  const foldLine = bestFold;
  cfg.setCollapsedFolds((prev) => {
    const next = new Set(prev);
    next.delete(foldLine);
    return next;
  });
}

/**
 * Keyboard shortcuts for FileViewer:
 * - Ctrl+F: search
 * - Ctrl+G: go to line
 * - Ctrl+D: toggle diff
 * - Alt+Z: toggle word wrap
 * - Ctrl+Shift+[: collapse fold
 * - Ctrl+Shift+]: expand fold
 */
export function useFileViewerKeyboard(cfg: KeyboardConfig): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const container = cfg.containerRef.current;
      if (!container) return;

      const target = e.target as HTMLElement;
      const inside = container.contains(target);
      if (!inside && target !== document.body) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.shiftKey && e.key === '[') {
        e.preventDefault();
        handleCollapseFold(cfg);
        return;
      }
      if (mod && e.shiftKey && e.key === ']') {
        e.preventDefault();
        handleExpandFold(cfg);
        return;
      }
      if (mod && e.key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        cfg.setShowGoToLine(false);
        cfg.setShowSearch(true);
        return;
      }
      if (mod && e.key === 'g') {
        e.preventDefault();
        e.stopPropagation();
        cfg.setShowSearch(false);
        cfg.setShowGoToLine(true);
        return;
      }
      if (mod && e.key === 'd') {
        e.preventDefault();
        e.stopPropagation();
        if (cfg.hasDiff) {
          cfg.setViewMode((prev) => (prev === 'code' ? 'diff' : 'code'));
        }
        return;
      }
      if (e.altKey && e.key === 'z') {
        e.preventDefault();
        e.stopPropagation();
        cfg.setWordWrap((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [cfg]);
}
