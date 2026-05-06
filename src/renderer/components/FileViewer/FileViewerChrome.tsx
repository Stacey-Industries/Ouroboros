import type { Ref } from 'react';
import React, { memo, useCallback } from 'react';

import { useViewportBreakpoint } from '../../hooks/useViewportBreakpoint';
import { useMobilePrimaryFlag } from '../Layout/layoutPresets/LayoutPresetResolver';
import type { CodeViewProps } from './CodeView';
import type { CodeRow } from './codeViewTypes';
import { ContentRouter } from './ContentRouter';
import { DirtyBanner } from './DirtyBanner';
import type { FileViewerProps } from './FileViewer';
import { FileViewerToolbar } from './FileViewerToolbar';
import { StatusBar } from './StatusBar';
import { SymbolOutline } from './SymbolOutline';
import type { FileViewerState } from './useFileViewerState';
import { ViewModeBar } from './ViewModeBar';

const FOLD_GUTTER_WIDTH = 16;
const DIFF_GUTTER_WIDTH = 6;

// Wave 82.1 — `minWidth: 0` + `width: '100%'` make the chrome track the
// pane width instead of fitting to content; otherwise edit-mode toolbar
// growth pushes Edit past the pane's right edge and never recovers.
const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  minWidth: 0,
  width: '100%',
  height: '100%',
};

const bodyStyle: React.CSSProperties = { display: 'flex', flex: 1, minHeight: 0 };

interface FileViewerChromeProps extends FileViewerProps {
  s: FileViewerState;
  lines: string[];
  lineCount: number;
  gutterWidth: number;
  shikiLines: string[] | null;
  rows: CodeRow[];
}

interface CodeViewInput {
  s: FileViewerState;
  lines: string[];
  lineCount: number;
  gutterWidth: number;
  shikiLines: string[] | null;
  rows: CodeRow[];
}

function buildCodeViewProps(input: CodeViewInput): Omit<CodeViewProps, 'scrollRef' | 'codeRef'> {
  return {
    lines: input.lines,
    lineCount: input.lineCount,
    rows: input.rows,
    shikiLines: input.shikiLines,
    wordWrap: input.s.wordWrap,
    showMinimap: input.s.showMinimap,
    showSearch: input.s.showSearch,
    setShowSearch: input.s.setShowSearch,
    showGoToLine: input.s.showGoToLine,
    setShowGoToLine: input.s.setShowGoToLine,
    searchMatchLines: input.s.searchMatchLines,
    setSearchMatchLines: input.s.setSearchMatchLines,
    scrollMetrics: input.s.scrollMetrics,
    diffLines: input.s.diffLines,
    diffMap: input.s.diffMap,
    collapsedFolds: input.s.collapsedFolds,
    foldableLines: input.s.foldableLines,
    toggleFold: input.s.toggleFold,
    showBlame: input.s.showBlame,
    blameLines: input.s.blameLines,
    gutterWidth: input.gutterWidth,
    foldGutterWidth: FOLD_GUTTER_WIDTH,
    diffGutterWidth: DIFF_GUTTER_WIDTH,
  };
}

function OutlinePanel({ s }: { s: FileViewerState }): React.ReactElement | null {
  return (
    <SymbolOutline
      symbols={s.outlineSymbols}
      scrollContainer={s.scrollRef.current}
      codeContainer={s.codeRef.current}
      visible={s.showOutline && !s.editMode && !s.showHistory && s.viewMode === 'code'}
    />
  );
}

interface ChromeHeaderProps {
  projectRoot?: string | null;
  isDirtyOnDisk?: boolean;
  onReload?: () => void;
  currentContent?: string | null;
  isDirty?: boolean;
  onSave?: (content: string) => void;
  onCancelEdit?: () => void;
  s: FileViewerState;
}

function buildToolbarProps(input: {
  projectRoot: string | null | undefined;
  currentContent: string | null;
  isDirty: boolean | undefined;
  onSave: ((content: string) => void) | undefined;
  onCancelEdit: (() => void) | undefined;
  s: FileViewerState;
}): React.ComponentProps<typeof FileViewerToolbar> {
  const { projectRoot, currentContent, isDirty, onSave, onCancelEdit, s } = input;
  return {
    wordWrap: s.wordWrap,
    setWordWrap: s.setWordWrap,
    showMinimap: s.showMinimap,
    setShowMinimap: s.setShowMinimap,
    showBlame: s.showBlame,
    setShowBlame: s.setShowBlame,
    showOutline: s.showOutline,
    setShowOutline: s.setShowOutline,
    showHistory: s.showHistory,
    setShowHistory: s.setShowHistory,
    projectRoot,
    editMode: s.editMode,
    setEditMode: s.setEditMode,
    currentContent,
    isDirty,
    onSave,
    onCancelEdit,
    isClaudeMd: s.isClaudeMd,
    claudeMdEnhanced: s.claudeMdEnhanced,
    setClaudeMdEnhanced: s.setClaudeMdEnhanced,
  };
}

function ChromeHeader({
  projectRoot,
  isDirtyOnDisk,
  onReload,
  currentContent,
  isDirty,
  onSave,
  onCancelEdit,
  s,
}: ChromeHeaderProps): React.ReactElement {
  const toolbarProps = buildToolbarProps({
    projectRoot,
    currentContent: currentContent ?? null,
    isDirty,
    onSave,
    onCancelEdit,
    s,
  });
  return (
    <>
      {isDirtyOnDisk && <DirtyBanner onReload={onReload} />}
      <FileViewerToolbar {...toolbarProps} />
      {(s.hasDiff || s.isMarkdown || s.isHtml) && (
        <ViewModeBar
          viewMode={s.viewMode}
          setViewMode={s.setViewMode}
          hasDiff={s.hasDiff}
          isMarkdown={s.isMarkdown}
          isHtml={s.isHtml}
        />
      )}
    </>
  );
}

interface ChromeBodyProps {
  filePath: string | null;
  content: string | null;
  projectRoot?: string | null;
  originalContent?: string | null;
  diffBaseContent?: string | null;
  onSave?: (content: string) => void;
  onContentChange?: (content: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  codeViewProps: Omit<CodeViewProps, 'scrollRef' | 'codeRef'>;
  s: FileViewerState;
  viewport: ReturnType<typeof useViewportBreakpoint>;
  mobilePrimaryFlag: boolean;
}

function buildRouterStateProps(s: FileViewerState) {
  return {
    viewMode: s.viewMode,
    editMode: s.editMode,
    isClaudeMd: s.isClaudeMd,
    claudeMdEnhanced: s.claudeMdEnhanced,
    ideThemeId: s.ideThemeId,
    showHistory: s.showHistory,
    isMarkdown: s.isMarkdown,
    isHtml: s.isHtml,
    hasDiff: s.hasDiff,
    conflictBlocks: s.conflictBlocks,
    handleConflictResolved: s.handleConflictResolved,
    scrollRef: s.scrollRef,
    codeRef: s.codeRef,
    wordWrap: s.wordWrap,
    showMinimap: s.showMinimap,
    showBlame: s.showBlame,
    formatOnSave: s.formatOnSave,
  };
}

function buildContentRouterProps(p: ChromeBodyProps) {
  const {
    filePath,
    content,
    projectRoot,
    originalContent,
    diffBaseContent,
    onSave,
    onContentChange,
    onDirtyChange,
    codeViewProps,
    s,
    viewport,
    mobilePrimaryFlag,
  } = p;
  return {
    ...buildRouterStateProps(s),
    filePath,
    content,
    projectRoot,
    onSave,
    onContentChange,
    onDirtyChange,
    originalContent,
    diffBaseContent,
    codeViewProps,
    viewport,
    mobilePrimaryFlag,
  };
}

function ChromeBody(p: ChromeBodyProps): React.ReactElement {
  return (
    <div style={bodyStyle}>
      <ContentRouter {...buildContentRouterProps(p)} />
      <OutlinePanel s={p.s} />
    </div>
  );
}

function StatusFooter({
  filePath,
  lineCount,
  s,
}: {
  filePath: string;
  lineCount: number;
  s: FileViewerState;
}): React.ReactElement {
  return (
    <StatusBar
      filePath={filePath}
      lineCount={lineCount}
      collapsedFoldCount={s.collapsedFolds.size}
      highlightLang={s.highlightLang}
    />
  );
}

function useChromeSetup(p: FileViewerChromeProps) {
  const viewport = useViewportBreakpoint();
  const mobilePrimaryFlag = useMobilePrimaryFlag();
  const { setEditMode } = p.s;
  const handleEditorSave = useCallback(
    (c: string) => {
      p.onSave?.(c);
      setEditMode(false);
    },
    [p.onSave, setEditMode],
  );
  const codeViewProps = buildCodeViewProps({
    s: p.s,
    lines: p.lines,
    lineCount: p.lineCount,
    gutterWidth: p.gutterWidth,
    shikiLines: p.shikiLines,
    rows: p.rows,
  });
  return { viewport, mobilePrimaryFlag, handleEditorSave, codeViewProps };
}

export const FileViewerChrome = memo(function FileViewerChrome(
  p: FileViewerChromeProps,
): React.ReactElement {
  const { viewport, mobilePrimaryFlag, handleEditorSave, codeViewProps } = useChromeSetup(p);
  return (
    <div ref={p.s.containerRef as Ref<HTMLDivElement>} style={rootStyle}>
      <ChromeHeader
        projectRoot={p.projectRoot}
        isDirtyOnDisk={p.isDirtyOnDisk}
        onReload={p.onReload}
        currentContent={p.content}
        isDirty={p.isDirty}
        onSave={p.onSave}
        onCancelEdit={p.onCancelEdit}
        s={p.s}
      />
      <ChromeBody
        filePath={p.filePath}
        content={p.content}
        projectRoot={p.projectRoot}
        originalContent={p.originalContent}
        diffBaseContent={p.s.diffBaseContent}
        onSave={handleEditorSave}
        onContentChange={p.onContentChange}
        onDirtyChange={undefined}
        codeViewProps={codeViewProps}
        s={p.s}
        viewport={viewport}
        mobilePrimaryFlag={mobilePrimaryFlag}
      />
      {p.filePath && <StatusFooter filePath={p.filePath} lineCount={p.lineCount} s={p.s} />}
    </div>
  );
});
