import type { DiffLineInfo } from '../../types/electron';
import type { ConflictBlock } from './ConflictResolver';
import type { ScrollMetrics } from './useScrollMetrics';
import type { FoldRange } from './useFoldRanges';

export interface ViewerRefs {
  codeRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export interface ViewerToggles {
  wordWrap: boolean;
  setWordWrap: (value: boolean | ((prev: boolean) => boolean)) => void;
  showMinimap: boolean;
  setShowMinimap: (value: boolean | ((prev: boolean) => boolean)) => void;
  showBlame: boolean;
  setShowBlame: (value: boolean | ((prev: boolean) => boolean)) => void;
  showOutline: boolean;
  setShowOutline: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export interface ViewerUiState {
  showSearch: boolean;
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>;
  showGoToLine: boolean;
  setShowGoToLine: React.Dispatch<React.SetStateAction<boolean>>;
  searchMatchLines: number[];
  setSearchMatchLines: React.Dispatch<React.SetStateAction<number[]>>;
  viewMode: 'code' | 'diff' | 'preview';
  setViewMode: React.Dispatch<React.SetStateAction<'code' | 'diff' | 'preview'>>;
  showHistory: boolean;
  setShowHistory: React.Dispatch<React.SetStateAction<boolean>>;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  claudeMdEnhanced: boolean;
  setClaudeMdEnhanced: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export interface ViewerDerivedState {
  isClaudeMd: boolean;
  isMarkdown: boolean;
  hasDiff: boolean;
}

export interface ViewerConflicts {
  conflictBlocks: ConflictBlock[];
  handleConflictResolved: (newContent: string) => void;
}

export interface ViewerFolds {
  collapsedFolds: Set<number>;
  setCollapsedFolds: React.Dispatch<React.SetStateAction<Set<number>>>;
  toggleFold: (startLine: number) => void;
}

export interface ViewerUiResetters {
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>;
  setShowGoToLine: React.Dispatch<React.SetStateAction<boolean>>;
  setViewMode: React.Dispatch<React.SetStateAction<'code' | 'diff' | 'preview'>>;
  setShowHistory: React.Dispatch<React.SetStateAction<boolean>>;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
}

interface CreateKeyboardInputArgs {
  refs: ViewerRefs;
  foldableLines: Map<number, FoldRange>;
  hasDiff: boolean;
  ui: Pick<ViewerUiState, 'setShowSearch' | 'setShowGoToLine' | 'setViewMode'>;
  folds: Pick<ViewerFolds, 'collapsedFolds' | 'setCollapsedFolds'>;
  setWordWrap: ViewerToggles['setWordWrap'];
}

export function createKeyboardInput({
  refs,
  foldableLines,
  hasDiff,
  ui,
  folds,
  setWordWrap,
}: CreateKeyboardInputArgs) {
  return {
    containerRef: refs.containerRef,
    scrollRef: refs.scrollRef,
    hasDiff,
    foldableLines,
    collapsedFolds: folds.collapsedFolds,
    setCollapsedFolds: folds.setCollapsedFolds,
    setShowSearch: ui.setShowSearch,
    setShowGoToLine: ui.setShowGoToLine,
    setViewMode: ui.setViewMode,
    setWordWrap,
  };
}

interface CreateFileViewerStateArgs<TOutlineSymbols> {
  refs: ViewerRefs;
  ideThemeId: string;
  toggles: ViewerToggles;
  ui: ViewerUiState;
  derived: ViewerDerivedState;
  data: {
    highlightedHtml: string | null;
    highlightLang: string | null;
    diffLines: DiffLineInfo[];
    diffMap: Map<number, DiffLineInfo['kind']>;
    blameLines: Array<{ line: number; hash: string; author: string; date: string; summary: string }>;
    foldableLines: Map<number, FoldRange>;
    scrollMetrics: ScrollMetrics;
    outlineSymbols: TOutlineSymbols;
  };
  conflicts: ViewerConflicts;
  folds: ViewerFolds;
}

export function createFileViewerState<TOutlineSymbols>({
  refs,
  ideThemeId,
  toggles,
  ui,
  derived,
  data,
  conflicts,
  folds,
}: CreateFileViewerStateArgs<TOutlineSymbols>) {
  return {
    ...createViewerFrameState({ refs, ideThemeId, conflicts, folds, derived }),
    ...createViewerToggleState(toggles, ui),
    ...createViewerDataState(data),
  };
}

function createViewerFrameState({
  refs,
  ideThemeId,
  conflicts,
  folds,
  derived,
}: {
  refs: ViewerRefs;
  ideThemeId: string;
  conflicts: ViewerConflicts;
  folds: ViewerFolds;
  derived: ViewerDerivedState;
}
) {
  return {
    codeRef: refs.codeRef,
    scrollRef: refs.scrollRef,
    containerRef: refs.containerRef,
    ideThemeId,
    conflictBlocks: conflicts.conflictBlocks,
    collapsedFolds: folds.collapsedFolds,
    isClaudeMd: derived.isClaudeMd,
    isMarkdown: derived.isMarkdown,
    hasDiff: derived.hasDiff,
    toggleFold: folds.toggleFold,
    handleConflictResolved: conflicts.handleConflictResolved,
  };
}

function createViewerToggleState(
  toggles: ViewerToggles,
  ui: ViewerUiState
) {
  return {
    wordWrap: toggles.wordWrap,
    setWordWrap: toggles.setWordWrap,
    showMinimap: toggles.showMinimap,
    setShowMinimap: toggles.setShowMinimap,
    showBlame: toggles.showBlame,
    setShowBlame: toggles.setShowBlame,
    showOutline: toggles.showOutline,
    setShowOutline: toggles.setShowOutline,
    showSearch: ui.showSearch,
    setShowSearch: ui.setShowSearch,
    showGoToLine: ui.showGoToLine,
    setShowGoToLine: ui.setShowGoToLine,
    searchMatchLines: ui.searchMatchLines,
    setSearchMatchLines: ui.setSearchMatchLines,
    viewMode: ui.viewMode,
    setViewMode: ui.setViewMode,
    showHistory: ui.showHistory,
    setShowHistory: ui.setShowHistory,
    editMode: ui.editMode,
    setEditMode: ui.setEditMode,
    claudeMdEnhanced: ui.claudeMdEnhanced,
    setClaudeMdEnhanced: ui.setClaudeMdEnhanced,
  };
}

function createViewerDataState<TOutlineSymbols>(data: CreateFileViewerStateArgs<TOutlineSymbols>['data']) {
  return {
    highlightedHtml: data.highlightedHtml,
    highlightLang: data.highlightLang,
    diffLines: data.diffLines,
    diffMap: data.diffMap,
    blameLines: data.blameLines,
    foldableLines: data.foldableLines,
    scrollMetrics: data.scrollMetrics,
    outlineSymbols: data.outlineSymbols,
  };
}

export function createDiffMap(diffLines: DiffLineInfo[]): Map<number, DiffLineInfo['kind']> {
  const map = new Map<number, DiffLineInfo['kind']>();
  for (const diffLine of diffLines) map.set(diffLine.line, diffLine.kind);
  return map;
}

export function parseConflictContent(
  content: string | null,
  hasConflictMarkers: (content: string) => boolean,
  parseConflictBlocks: (lines: string[]) => ConflictBlock[]
): ConflictBlock[] {
  return content && hasConflictMarkers(content)
    ? parseConflictBlocks(content.split('\n'))
    : [];
}

export function toggleCollapsedFold(previous: Set<number>, startLine: number): Set<number> {
  const next = new Set(previous);
  if (next.has(startLine)) next.delete(startLine);
  else next.add(startLine);
  return next;
}
