import type { RefObject } from 'react';
import { useEffect } from 'react';

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
    (scrollEl.scrollTop - PADDING_TOP + LINE_HEIGHT / 2) / LINE_HEIGHT,
  );
  return Math.max(0, topLine);
}

function findContainingFold(
  lines: Iterable<[number, FoldRange]>,
  currentLine: number,
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
  currentLine: number,
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
  currentLine: number,
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

  cfg.setCollapsedFolds((prev) => {
    const next = new Set(prev);
    next.add(bestFold);
    return next;
  });
}

function handleExpandFold(cfg: KeyboardConfig): void {
  const scrollEl = cfg.scrollRef.current;
  if (!scrollEl) return;

  const currentLine = getCurrentLine(scrollEl);
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

  cfg.setCollapsedFolds((prev) => {
    const next = new Set(prev);
    next.delete(bestFold);
    return next;
  });
}

function isViewerShortcutTarget(
  cfg: KeyboardConfig,
  target: EventTarget | null,
): target is HTMLElement {
  const container = cfg.containerRef.current;
  if (!container || !(target instanceof HTMLElement)) return false;
  return container.contains(target) || target === document.body;
}

/**
 * Returns true when the event target is inside a Monaco editor instance.
 * When Monaco is active, Ctrl+F and Ctrl+H should be handled by Monaco's
 * built-in find/replace widget instead of the legacy Shiki SearchBar.
 */
function isInsideMonacoEditor(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest('.monaco-editor') !== null;
}

function stopHandledShortcut(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function isModifierPressed(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

function handleFoldShortcut(cfg: KeyboardConfig, event: KeyboardEvent): boolean {
  if (!isModifierPressed(event) || !event.shiftKey) return false;

  if (event.key === '[') {
    event.preventDefault();
    handleCollapseFold(cfg);
    return true;
  }

  if (event.key === ']') {
    event.preventDefault();
    handleExpandFold(cfg);
    return true;
  }

  return false;
}

function handleSearchShortcut(cfg: KeyboardConfig, event: KeyboardEvent): boolean {
  if (!isModifierPressed(event) || event.key !== 'f') return false;
  // When Monaco is active, let its built-in find widget handle Ctrl+F
  if (isInsideMonacoEditor(event.target)) return false;
  stopHandledShortcut(event);
  cfg.setShowGoToLine(false);
  cfg.setShowSearch(true);
  return true;
}

function handleReplaceShortcut(_cfg: KeyboardConfig, event: KeyboardEvent): boolean {
  if (!isModifierPressed(event) || event.key !== 'h') return false;
  // When Monaco is active, let its built-in find/replace widget handle Ctrl+H
  if (isInsideMonacoEditor(event.target)) return false;
  // For the legacy code view, Ctrl+H is not supported — do nothing but consume
  return false;
}

function handleGoToLineShortcut(cfg: KeyboardConfig, event: KeyboardEvent): boolean {
  if (!isModifierPressed(event) || event.key !== 'g') return false;
  // When Monaco is active, let its built-in Go To Line handle Ctrl+G
  if (isInsideMonacoEditor(event.target)) return false;
  stopHandledShortcut(event);
  cfg.setShowSearch(false);
  cfg.setShowGoToLine(true);
  return true;
}

function handleDiffShortcut(cfg: KeyboardConfig, event: KeyboardEvent): boolean {
  if (!isModifierPressed(event) || event.key !== 'd') return false;
  stopHandledShortcut(event);

  if (cfg.hasDiff) {
    cfg.setViewMode((prev) => (prev === 'code' ? 'diff' : 'code'));
  }

  return true;
}

function handleWordWrapShortcut(cfg: KeyboardConfig, event: KeyboardEvent): boolean {
  if (!event.altKey || event.key !== 'z') return false;
  stopHandledShortcut(event);
  cfg.setWordWrap((prev) => !prev);
  return true;
}

function handleFileViewerKeyDown(
  cfg: KeyboardConfig,
  event: KeyboardEvent,
): void {
  if (!isViewerShortcutTarget(cfg, event.target)) return;
  if (handleFoldShortcut(cfg, event)) return;
  if (handleSearchShortcut(cfg, event)) return;
  if (handleReplaceShortcut(cfg, event)) return;
  if (handleGoToLineShortcut(cfg, event)) return;
  if (handleDiffShortcut(cfg, event)) return;
  handleWordWrapShortcut(cfg, event);
}

/**
 * Keyboard shortcuts for FileViewer:
 * - Ctrl+F: search (legacy CodeView) / find widget (Monaco)
 * - Ctrl+H: replace — delegated to Monaco's built-in find/replace widget
 * - Ctrl+G: go to line
 * - Ctrl+D: toggle diff
 * - Alt+Z: toggle word wrap
 * - Ctrl+Shift+[: collapse fold
 * - Ctrl+Shift+]: expand fold
 *
 * When Monaco is the active editor, Ctrl+F and Ctrl+H are NOT intercepted
 * here — they pass through to Monaco's built-in find/replace widget.
 */
export function useFileViewerKeyboard(cfg: KeyboardConfig): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      handleFileViewerKeyDown(cfg, event);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [cfg]);
}
