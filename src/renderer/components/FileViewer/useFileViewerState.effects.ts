/**
 * useFileViewerState side-effect hooks — git diff base, conflicts, folds, scroll, links, UI reset.
 */
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { DiffLineInfo } from '../../types/electron';
import type { ConflictBlock } from './ConflictResolver';
import { hasConflictMarkers, parseConflictBlocks } from './ConflictResolver.model';
import { attachLinkClickHandler, ensureLinkStyles } from './linkDetector';
import type { ViewerConflicts, ViewerFolds, ViewerUiResetters } from './useFileViewerState.helpers';
import { parseConflictContent, toggleCollapsedFold } from './useFileViewerState.helpers';

interface LoadGitDiffBaseContentInput {
  projectRoot: string;
  filePath: string;
  content: string;
  diffLines: DiffLineInfo[];
  setDiffBaseContent: (value: string | null) => void;
  isActive: () => boolean;
}

function shouldKeepGitDiffBaseContent(baseContent: string, content: string, diffLines: DiffLineInfo[]): boolean {
  return diffLines.length > 0 || baseContent !== content;
}

async function loadGitDiffBaseContent(input: LoadGitDiffBaseContentInput): Promise<void> {
  const { projectRoot, filePath, content, diffLines, setDiffBaseContent, isActive } = input;
  const clearIfActive = (): void => { if (isActive()) setDiffBaseContent(null); };
  try {
    const repoResult = await window.electronAPI.git.isRepo(projectRoot);
    if (!repoResult.success || !repoResult.isRepo) return clearIfActive();
    if (!isActive()) return;
    const baseResult = await window.electronAPI.git.fileAtCommit(projectRoot, 'HEAD', filePath);
    if (!isActive()) return;
    const baseContent = baseResult.success ? (baseResult.content ?? '') : null;
    if (baseContent == null) return clearIfActive();
    setDiffBaseContent(shouldKeepGitDiffBaseContent(baseContent, content, diffLines) ? baseContent : null);
  } catch {
    clearIfActive();
  }
}

export function useGitDiffBaseContent(
  projectRoot: string | null,
  filePath: string | null,
  content: string | null,
  diffLines: DiffLineInfo[],
): string | null {
  'use no memo';
  const [diffBaseContent, setDiffBaseContent] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!projectRoot || !filePath || content == null) {
      setDiffBaseContent(null);
      return () => { active = false; };
    }
    void loadGitDiffBaseContent({ projectRoot, filePath, content, diffLines, setDiffBaseContent, isActive: () => active });
    return () => { active = false; };
  }, [content, diffLines, filePath, projectRoot]);
  return diffBaseContent;
}

export function useConflictState(filePath: string | null, content: string | null): ViewerConflicts {
  'use no memo';
  const [conflictBlocks, setConflictBlocks] = useState<ConflictBlock[]>([]);
  useEffect(() => {
    setConflictBlocks(parseConflictContent(content, hasConflictMarkers, parseConflictBlocks));
  }, [content]);
  const handleConflictResolved = useCallback((newContent: string) => {
    setConflictBlocks(parseConflictContent(newContent, hasConflictMarkers, parseConflictBlocks));
    if (!filePath) return;
    window.dispatchEvent(new CustomEvent('agent-ide:reload-file', { detail: { filePath } }));
  }, [filePath]);
  return { conflictBlocks, handleConflictResolved };
}

export function useCollapsedFoldState(filePath: string | null, content: string | null): ViewerFolds {
  'use no memo';
  const [collapsedFolds, setCollapsedFolds] = useState<Set<number>>(new Set());
  useEffect(() => { setCollapsedFolds(new Set()); }, [filePath, content]);
  const toggleFold = useCallback((startLine: number) => {
    setCollapsedFolds((previous) => toggleCollapsedFold(previous, startLine));
  }, []);
  return { collapsedFolds, setCollapsedFolds, toggleFold };
}

export function useScrollReset(filePath: string | null, scrollRef: React.RefObject<HTMLDivElement | null>): void {
  'use no memo';
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [filePath, scrollRef]);
}

export function useLinkHandling(
  codeRef: React.RefObject<HTMLDivElement | null>,
  filePath: string | null,
  projectRoot?: string | null,
): void {
  'use no memo';
  useEffect(() => { ensureLinkStyles(); }, []);
  useEffect(() => {
    const element = codeRef.current;
    if (!element) return;
    return attachLinkClickHandler(element, () => filePath, () => projectRoot ?? null);
  }, [codeRef, filePath, projectRoot]);
}

export function useResetViewerUi(filePath: string | null, resetters: ViewerUiResetters): void {
  'use no memo';
  useEffect(() => {
    resetters.setShowSearch(false);
    resetters.setShowGoToLine(false);
    resetters.setViewMode('code');
    resetters.setShowHistory(false);
    resetters.setEditMode(false);
  }, [filePath, resetters]);
}

export function useExpandFoldsForSearch(
  showSearch: boolean,
  setCollapsedFolds: React.Dispatch<React.SetStateAction<Set<number>>>,
): void {
  'use no memo';
  useEffect(() => {
    if (showSearch) setCollapsedFolds((previous) => (previous.size === 0 ? previous : new Set()));
  }, [showSearch, setCollapsedFolds]);
}
