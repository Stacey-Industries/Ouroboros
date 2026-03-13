import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useFoldRanges } from './useFoldRanges';
import { useGitDiff } from '../../hooks/useGitDiff';
import { useGitBlame } from '../../hooks/useGitBlame';
import { useSymbolOutline } from '../../hooks/useSymbolOutline';
import type { DiffLineInfo } from '../../types/electron';
import { ensureLinkStyles, attachLinkClickHandler } from './linkDetector';
import { hasConflictMarkers, parseConflictBlocks } from './ConflictResolver';
import type { ConflictBlock } from './ConflictResolver';
import { getLanguage } from './fileViewerUtils';
import { usePersistedToggle } from './usePersistedToggle';
import { useHighlighting } from './useHighlighting';
import { useScrollMetrics } from './useScrollMetrics';
import { useScrollToLine } from './useScrollToLine';
import { useFileViewerKeyboard } from './useFileViewerKeyboard';
import type { ScrollMetrics } from './useScrollMetrics';
import type { FoldRange } from './useFoldRanges';

export interface FileViewerStateInput {
  filePath: string | null;
  content: string | null;
  originalContent?: string | null;
  projectRoot?: string | null;
}

export interface FileViewerState {
  // Refs
  codeRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;

  // Theme
  ideThemeId: string;

  // Highlighting
  highlightedHtml: string | null;
  highlightLang: string | null;

  // Toggles
  wordWrap: boolean;
  setWordWrap: (v: boolean | ((prev: boolean) => boolean)) => void;
  showMinimap: boolean;
  setShowMinimap: (v: boolean | ((prev: boolean) => boolean)) => void;
  showBlame: boolean;
  setShowBlame: (v: boolean | ((prev: boolean) => boolean)) => void;
  showOutline: boolean;
  setShowOutline: (v: boolean | ((prev: boolean) => boolean)) => void;

  // UI state
  showSearch: boolean;
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>;
  showGoToLine: boolean;
  setShowGoToLine: React.Dispatch<React.SetStateAction<boolean>>;
  searchMatchLines: number[];
  setSearchMatchLines: (lines: number[]) => void;
  viewMode: 'code' | 'diff' | 'preview';
  setViewMode: React.Dispatch<React.SetStateAction<'code' | 'diff' | 'preview'>>;
  showHistory: boolean;
  setShowHistory: (v: boolean | ((prev: boolean) => boolean)) => void;
  editMode: boolean;
  setEditMode: (value: boolean) => void;
  claudeMdEnhanced: boolean;
  setClaudeMdEnhanced: (v: boolean | ((prev: boolean) => boolean)) => void;
  conflictBlocks: ConflictBlock[];
  collapsedFolds: Set<number>;

  // Derived
  isClaudeMd: boolean;
  isMarkdown: boolean;
  hasDiff: boolean;

  // Git data
  diffLines: DiffLineInfo[];
  diffMap: Map<number, DiffLineInfo['kind']>;
  blameLines: Array<{ line: number; hash: string; author: string; date: string; summary: string }>;
  foldableLines: Map<number, FoldRange>;
  scrollMetrics: ScrollMetrics;
  outlineSymbols: ReturnType<typeof useSymbolOutline>;

  // Actions
  toggleFold: (startLine: number) => void;
  handleConflictResolved: (newContent: string) => void;
}

/**
 * All state, refs, effects, and derived data for the FileViewer.
 * This is the single hook that owns the component's brain.
 */
export function useFileViewerState(input: FileViewerStateInput): FileViewerState {
  const { filePath, content, originalContent, projectRoot } = input;
  const { theme: ideTheme } = useTheme();

  const codeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Highlighting
  const { highlightedHtml, highlightLang } = useHighlighting(
    filePath, content, ideTheme.id
  );

  // Persisted toggles
  const [wordWrap, setWordWrap] = usePersistedToggle('fileviewer:wordWrap', false);
  const [showMinimap, setShowMinimap] = usePersistedToggle('fileviewer:minimap', true);
  const [showBlame, setShowBlame] = usePersistedToggle('fileviewer:blame', false);
  const [showOutline, setShowOutline] = usePersistedToggle('fileviewer:outline', false);

  // UI state
  const [showSearch, setShowSearch] = useState(false);
  const [showGoToLine, setShowGoToLine] = useState(false);
  const [searchMatchLines, setSearchMatchLines] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<'code' | 'diff' | 'preview'>('code');
  const [showHistory, setShowHistory] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [claudeMdEnhanced, setClaudeMdEnhanced] = useState(true);
  const [conflictBlocks, setConflictBlocks] = useState<ConflictBlock[]>([]);
  const [collapsedFolds, setCollapsedFolds] = useState<Set<number>>(new Set());

  // Derived
  const isClaudeMd = filePath != null && /(?:^|[\\/])CLAUDE\.md$/i.test(filePath);
  const isMarkdown = filePath != null && /\.(md|markdown)$/i.test(filePath);
  const hasDiff = originalContent != null && content != null && originalContent !== content;

  // Git data
  const { diffLines } = useGitDiff(projectRoot ?? null, filePath, content);
  const { blameLines } = useGitBlame(projectRoot ?? null, filePath, showBlame);
  const { foldableLines } = useFoldRanges(content);
  const scrollMetrics = useScrollMetrics(scrollRef);
  const outlineLanguage = filePath ? getLanguage(filePath) : 'text';
  const outlineSymbols = useSymbolOutline(content, outlineLanguage);

  useScrollToLine(filePath, scrollRef, codeRef);

  const diffMap = useMemo(() => {
    const map = new Map<number, DiffLineInfo['kind']>();
    for (const dl of diffLines) map.set(dl.line, dl.kind);
    return map;
  }, [diffLines]);

  // Effects
  useEffect(() => { ensureLinkStyles(); }, []);

  useEffect(() => {
    const el = codeRef.current;
    if (!el) return;
    return attachLinkClickHandler(el, () => filePath, () => projectRoot ?? null);
  });

  useEffect(() => {
    setShowSearch(false);
    setShowGoToLine(false);
    setViewMode('code');
    setShowHistory(false);
    setEditMode(false);
  }, [filePath]);

  useEffect(() => {
    if (!content || !hasConflictMarkers(content)) {
      setConflictBlocks([]);
      return;
    }
    setConflictBlocks(parseConflictBlocks(content.split('\n')));
  }, [content]);

  useEffect(() => {
    setCollapsedFolds(new Set());
  }, [filePath, content]);

  useEffect(() => {
    if (showSearch && collapsedFolds.size > 0) {
      setCollapsedFolds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSearch]);

  const toggleFold = useCallback((startLine: number) => {
    setCollapsedFolds((prev) => {
      const next = new Set(prev);
      if (next.has(startLine)) next.delete(startLine);
      else next.add(startLine);
      return next;
    });
  }, []);

  const handleConflictResolved = useCallback((newContent: string) => {
    if (!hasConflictMarkers(newContent)) {
      setConflictBlocks([]);
    } else {
      setConflictBlocks(parseConflictBlocks(newContent.split('\n')));
    }
    if (filePath) {
      window.dispatchEvent(
        new CustomEvent('agent-ide:reload-file', { detail: { filePath } })
      );
    }
  }, [filePath]);

  useFileViewerKeyboard({
    containerRef, scrollRef, hasDiff,
    foldableLines, collapsedFolds, setCollapsedFolds,
    setShowSearch, setShowGoToLine, setViewMode, setWordWrap,
  });

  return {
    codeRef, scrollRef, containerRef,
    ideThemeId: ideTheme.id,
    highlightedHtml, highlightLang,
    wordWrap, setWordWrap, showMinimap, setShowMinimap,
    showBlame, setShowBlame, showOutline, setShowOutline,
    showSearch, setShowSearch, showGoToLine, setShowGoToLine,
    searchMatchLines, setSearchMatchLines,
    viewMode, setViewMode,
    showHistory, setShowHistory,
    editMode, setEditMode,
    claudeMdEnhanced, setClaudeMdEnhanced,
    conflictBlocks, collapsedFolds,
    isClaudeMd, isMarkdown, hasDiff,
    diffLines, diffMap, blameLines, foldableLines,
    scrollMetrics, outlineSymbols,
    toggleFold, handleConflictResolved,
  };
}
