import type { Ref } from 'react';
import React, { memo, useCallback } from 'react';

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

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  height: '100%',
  backgroundColor: 'transparent',
};

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
};

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
    wordWrap: s.wordWrap, setWordWrap: s.setWordWrap,
    showMinimap: s.showMinimap, setShowMinimap: s.setShowMinimap,
    showBlame: s.showBlame, setShowBlame: s.setShowBlame,
    showOutline: s.showOutline, setShowOutline: s.setShowOutline,
    showHistory: s.showHistory, setShowHistory: s.setShowHistory,
    projectRoot, editMode: s.editMode, setEditMode: s.setEditMode,
    currentContent, isDirty, onSave, onCancelEdit,
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
  const toolbarProps = buildToolbarProps({ projectRoot, currentContent: currentContent ?? null, isDirty, onSave, onCancelEdit, s });
  return (
    <>
      {isDirtyOnDisk && <DirtyBanner onReload={onReload} />}
      <FileViewerToolbar {...toolbarProps} />
      {(s.hasDiff || s.isMarkdown) && (
        <ViewModeBar
          viewMode={s.viewMode}
          setViewMode={s.setViewMode}
          hasDiff={s.hasDiff}
          isMarkdown={s.isMarkdown}
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
}

function ChromeBody({
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
}: ChromeBodyProps): React.ReactElement {
  return (
    <div style={bodyStyle}>
      <ContentRouter
        viewMode={s.viewMode}
        editMode={s.editMode}
        isClaudeMd={s.isClaudeMd}
        claudeMdEnhanced={s.claudeMdEnhanced}
        filePath={filePath}
        content={content}
        ideThemeId={s.ideThemeId}
        projectRoot={projectRoot}
        onSave={onSave}
        onContentChange={onContentChange}
        onDirtyChange={onDirtyChange}
        showHistory={s.showHistory}
        isMarkdown={s.isMarkdown}
        hasDiff={s.hasDiff}
        originalContent={originalContent}
        diffBaseContent={diffBaseContent}
        conflictBlocks={s.conflictBlocks}
        handleConflictResolved={s.handleConflictResolved}
        codeViewProps={codeViewProps}
        scrollRef={s.scrollRef}
        codeRef={s.codeRef}
        wordWrap={s.wordWrap}
        showMinimap={s.showMinimap}
        formatOnSave={s.formatOnSave}
      />
      <OutlinePanel s={s} />
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

export const FileViewerChrome = memo(function FileViewerChrome({
  filePath,
  content,
  projectRoot,
  originalContent,
  onSave,
  onContentChange,
  onCancelEdit,
  isDirtyOnDisk,
  onReload,
  isDirty,
  s,
  lines,
  lineCount,
  gutterWidth,
  shikiLines,
  rows,
}: FileViewerChromeProps): React.ReactElement {
  const codeViewProps = buildCodeViewProps({ s, lines, lineCount, gutterWidth, shikiLines, rows });
  // Wrap onSave so that Ctrl+S from Monaco also exits edit mode
  const handleEditorSave = useCallback((c: string) => {
    onSave?.(c);
    s.setEditMode(false);
  }, [onSave, s.setEditMode]);
  return (
    <div ref={s.containerRef as Ref<HTMLDivElement>} style={rootStyle}>
      <ChromeHeader projectRoot={projectRoot} isDirtyOnDisk={isDirtyOnDisk} onReload={onReload} currentContent={content} isDirty={isDirty} onSave={onSave} onCancelEdit={onCancelEdit} s={s} />
      <ChromeBody filePath={filePath} content={content} projectRoot={projectRoot} originalContent={originalContent} diffBaseContent={s.diffBaseContent} onSave={handleEditorSave} onContentChange={onContentChange} onDirtyChange={undefined} codeViewProps={codeViewProps} s={s} />
      {filePath && <StatusFooter filePath={filePath} lineCount={lineCount} s={s} />}
    </div>
  );
});
