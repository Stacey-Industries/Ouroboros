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
import {
  createDiffMap,
  createFileViewerState,
  createKeyboardInput,
  parseConflictContent,
  toggleCollapsedFold,
  type ViewerConflicts,
  type ViewerDerivedState,
  type ViewerFolds,
  type ViewerRefs,
  type ViewerToggles,
  type ViewerUiState,
  type ViewerUiResetters,
} from './useFileViewerState.helpers';

export interface FileViewerStateInput {
  filePath: string | null;
  content: string | null;
  originalContent?: string | null;
  projectRoot?: string | null;
}

export interface FileViewerState {
  codeRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  ideThemeId: string;
  highlightedHtml: string | null;
  highlightLang: string | null;
  wordWrap: boolean;
  setWordWrap: (v: boolean | ((prev: boolean) => boolean)) => void;
  showMinimap: boolean;
  setShowMinimap: (v: boolean | ((prev: boolean) => boolean)) => void;
  showBlame: boolean;
  setShowBlame: (v: boolean | ((prev: boolean) => boolean)) => void;
  showOutline: boolean;
  setShowOutline: (v: boolean | ((prev: boolean) => boolean)) => void;
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
  isClaudeMd: boolean;
  isMarkdown: boolean;
  hasDiff: boolean;
  diffBaseContent: string | null;
  diffLines: DiffLineInfo[];
  diffMap: Map<number, DiffLineInfo['kind']>;
  blameLines: Array<{ line: number; hash: string; author: string; date: string; summary: string }>;
  foldableLines: Map<number, FoldRange>;
  scrollMetrics: ScrollMetrics;
  outlineSymbols: ReturnType<typeof useSymbolOutline>;
  formatOnSave: boolean;
  setFormatOnSave: (v: boolean | ((prev: boolean) => boolean)) => void;
  toggleFold: (startLine: number) => void;
  handleConflictResolved: (newContent: string) => void;
}

interface ViewerData {
  highlightedHtml: string | null;
  highlightLang: string | null;
  diffBaseContent: string | null;
  diffLines: DiffLineInfo[];
  diffMap: Map<number, DiffLineInfo['kind']>;
  blameLines: Array<{ line: number; hash: string; author: string; date: string; summary: string }>;
  foldableLines: Map<number, FoldRange>;
  scrollMetrics: ScrollMetrics;
  outlineSymbols: ReturnType<typeof useSymbolOutline>;
}

/**
 * All state, refs, effects, and derived data for the FileViewer.
 * This is the single hook that owns the component's brain.
 */
export function useFileViewerState(input: FileViewerStateInput): FileViewerState {
  const { theme: ideTheme } = useTheme();
  const refs = useViewerRefs();
  const toggles = useViewerToggles();
  const ui = useViewerUiState();
  const data = useViewerData(input, ideTheme.id, refs.scrollRef, toggles.showBlame);
  const derived = useViewerDerivedState(input, data.diffBaseContent);
  const conflicts = useConflictState(input.filePath, input.content);
  const folds = useCollapsedFoldState(input.filePath, input.content);

  useScrollReset(input.filePath, refs.scrollRef);
  useLinkHandling(refs.codeRef, input.filePath, input.projectRoot);
  useResetViewerUi(input.filePath, useViewerUiResetters(ui));
  useExpandFoldsForSearch(ui.showSearch, folds.setCollapsedFolds);
  useScrollToLine(input.filePath, refs.scrollRef, refs.codeRef);
  useFileViewerKeyboard(
    createKeyboardInput({
      refs,
      foldableLines: data.foldableLines,
      hasDiff: derived.hasDiff,
      ui,
      folds,
      setWordWrap: toggles.setWordWrap,
    })
  );

  return createFileViewerState({
    refs,
    ideThemeId: ideTheme.id,
    toggles,
    ui,
    derived,
    data,
    conflicts,
    folds,
  });
}

function useViewerUiResetters(ui: ViewerUiState): ViewerUiResetters {
  return useMemo(
    () => ({
      setShowSearch: ui.setShowSearch,
      setShowGoToLine: ui.setShowGoToLine,
      setViewMode: ui.setViewMode,
      setShowHistory: ui.setShowHistory,
      setEditMode: ui.setEditMode,
    }),
    [ui.setEditMode, ui.setShowGoToLine, ui.setShowHistory, ui.setShowSearch, ui.setViewMode]
  );
}

function useViewerRefs(): ViewerRefs {
  return {
    codeRef: useRef<HTMLDivElement>(null),
    scrollRef: useRef<HTMLDivElement>(null),
    containerRef: useRef<HTMLDivElement>(null),
  };
}

function useViewerToggles(): ViewerToggles {
  const [wordWrap, setWordWrap] = usePersistedToggle('fileviewer:wordWrap', false);
  const [showMinimap, setShowMinimap] = usePersistedToggle('fileviewer:minimap', true);
  const [showBlame, setShowBlame] = usePersistedToggle('fileviewer:blame', false);
  const [showOutline, setShowOutline] = usePersistedToggle('fileviewer:outline', false);
  const [formatOnSave, setFormatOnSave] = usePersistedToggle('fileviewer:formatOnSave', false);

  return {
    wordWrap,
    setWordWrap,
    showMinimap,
    setShowMinimap,
    showBlame,
    setShowBlame,
    showOutline,
    setShowOutline,
    formatOnSave,
    setFormatOnSave,
  };
}

function useViewerUiState(): ViewerUiState {
  const [showSearch, setShowSearch] = useState(false);
  const [showGoToLine, setShowGoToLine] = useState(false);
  const [searchMatchLines, setSearchMatchLines] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<'code' | 'diff' | 'preview'>('code');
  const [showHistory, setShowHistory] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [claudeMdEnhanced, setClaudeMdEnhanced] = useState(true);

  return {
    showSearch,
    setShowSearch,
    showGoToLine,
    setShowGoToLine,
    searchMatchLines,
    setSearchMatchLines,
    viewMode,
    setViewMode,
    showHistory,
    setShowHistory,
    editMode,
    setEditMode,
    claudeMdEnhanced,
    setClaudeMdEnhanced,
  };
}

function useViewerDerivedState({
  filePath,
  content,
  originalContent,
}: FileViewerStateInput, gitDiffBaseContent: string | null): ViewerDerivedState {
  const diffBaseContent =
    originalContent != null && content != null && originalContent !== content
      ? originalContent
      : gitDiffBaseContent;

  return {
    isClaudeMd: filePath != null && /(?:^|[\\/])CLAUDE\.md$/i.test(filePath),
    isMarkdown: filePath != null && /\.(md|markdown)$/i.test(filePath),
    hasDiff: diffBaseContent != null && content != null && diffBaseContent !== content,
    diffBaseContent,
  };
}

function useViewerData(
  input: FileViewerStateInput,
  ideThemeId: string,
  scrollRef: React.RefObject<HTMLDivElement | null>,
  showBlame: boolean
): ViewerData {
  const { highlightedHtml, highlightLang } = useHighlighting(
    input.filePath,
    input.content,
    ideThemeId
  );
  const { diffLines } = useGitDiff(input.projectRoot ?? null, input.filePath, input.content);
  const diffBaseContent = useGitDiffBaseContent(
    input.projectRoot ?? null,
    input.filePath,
    input.content,
    diffLines,
  );
  const effectiveDiffLines = useMemo(
    () => buildEffectiveDiffLines(diffLines, diffBaseContent, input.content),
    [diffBaseContent, diffLines, input.content],
  );
  const { blameLines } = useGitBlame(input.projectRoot ?? null, input.filePath, showBlame);
  const { foldableLines } = useFoldRanges(input.content);
  const scrollMetrics = useScrollMetrics(scrollRef);
  const outlineSymbols = useSymbolOutline(input.content, input.filePath ? getLanguage(input.filePath) : 'text');
  const diffMap = useMemo(() => createDiffMap(effectiveDiffLines), [effectiveDiffLines]);

  return {
    highlightedHtml,
    highlightLang,
    diffBaseContent,
    diffLines: effectiveDiffLines,
    diffMap,
    blameLines,
    foldableLines,
    scrollMetrics,
    outlineSymbols,
  };
}

function useGitDiffBaseContent(
  projectRoot: string | null,
  filePath: string | null,
  content: string | null,
  diffLines: DiffLineInfo[],
): string | null {
  const [diffBaseContent, setDiffBaseContent] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!projectRoot || !filePath || content == null) {
      setDiffBaseContent(null);
      return () => { active = false; };
    }

    void (async () => {
      try {
        const repoResult = await window.electronAPI.git.isRepo(projectRoot);
        if (!active || !repoResult.success || !repoResult.isRepo) {
          if (active) setDiffBaseContent(null);
          return;
        }

        const baseResult = await window.electronAPI.git.fileAtCommit(projectRoot, 'HEAD', filePath);
        if (!active) return;

        const baseContent = baseResult.success ? (baseResult.content ?? '') : null;
        const hasGitDiff = baseContent != null && (diffLines.length > 0 || baseContent !== content);
        setDiffBaseContent(hasGitDiff ? baseContent : null);
      } catch {
        if (active) setDiffBaseContent(null);
      }
    })();

    return () => { active = false; };
  }, [content, diffLines, filePath, projectRoot]);

  return diffBaseContent;
}

function buildEffectiveDiffLines(
  diffLines: DiffLineInfo[],
  diffBaseContent: string | null,
  content: string | null,
): DiffLineInfo[] {
  if (diffLines.length > 0) {
    return diffLines;
  }

  if (diffBaseContent !== '' || content == null || content.length === 0) {
    return diffLines;
  }

  return content.split('\n').map((_, index) => ({
    line: index + 1,
    kind: 'added',
  }));
}

function useConflictState(
  filePath: string | null,
  content: string | null
): ViewerConflicts {
  const [conflictBlocks, setConflictBlocks] = useState<ConflictBlock[]>([]);

  useEffect(() => {
    setConflictBlocks(
      parseConflictContent(content, hasConflictMarkers, parseConflictBlocks)
    );
  }, [content]);

  const handleConflictResolved = useCallback((newContent: string) => {
    setConflictBlocks(
      parseConflictContent(newContent, hasConflictMarkers, parseConflictBlocks)
    );
    if (!filePath) return;
    window.dispatchEvent(
      new CustomEvent('agent-ide:reload-file', { detail: { filePath } })
    );
  }, [filePath]);

  return { conflictBlocks, handleConflictResolved };
}

function useCollapsedFoldState(
  filePath: string | null,
  content: string | null
): ViewerFolds {
  const [collapsedFolds, setCollapsedFolds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setCollapsedFolds(new Set());
  }, [filePath, content]);

  const toggleFold = useCallback((startLine: number) => {
    setCollapsedFolds((previous) => toggleCollapsedFold(previous, startLine));
  }, []);

  return { collapsedFolds, setCollapsedFolds, toggleFold };
}

function useScrollReset(
  filePath: string | null,
  scrollRef: React.RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [filePath, scrollRef]);
}

function useLinkHandling(
  codeRef: React.RefObject<HTMLDivElement | null>,
  filePath: string | null,
  projectRoot?: string | null
): void {
  useEffect(() => {
    ensureLinkStyles();
  }, []);

  useEffect(() => {
    const element = codeRef.current;
    if (!element) return;
    return attachLinkClickHandler(element, () => filePath, () => projectRoot ?? null);
  }, [codeRef, filePath, projectRoot]);
}

function useResetViewerUi(
  filePath: string | null,
  resetters: ViewerUiResetters
): void {
  useEffect(() => {
    resetters.setShowSearch(false);
    resetters.setShowGoToLine(false);
    resetters.setViewMode('code');
    resetters.setShowHistory(false);
    resetters.setEditMode(false);
  }, [filePath, resetters]);
}

function useExpandFoldsForSearch(
  showSearch: boolean,
  setCollapsedFolds: React.Dispatch<React.SetStateAction<Set<number>>>
): void {
  useEffect(() => {
    if (!showSearch) return;
    setCollapsedFolds((previous) => (previous.size === 0 ? previous : new Set()));
  }, [showSearch, setCollapsedFolds]);
}
