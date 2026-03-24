/**
 * EditorSplitView — Split-pane editor components.
 * Extracted from EditorContent.tsx to stay under file line limits.
 */

import React, { useCallback, useRef, useState } from 'react';

import type { OpenFile } from '../FileViewer';
import { FileViewer } from '../FileViewer';
import { SplitDivider } from './EditorSplitDivider';

export type ActiveFile = {
  path: string;
  content: string | null;
  isLoading: boolean;
  error: string | null;
  isDirtyOnDisk: boolean;
  originalContent: string | null;
  isImage?: boolean;
  isPdf?: boolean;
  isBinary?: boolean;
  binaryContent?: Uint8Array;
  isDirty: boolean;
} | null;

export interface FileViewState {
  path: string | null;
  content: string | null;
  isLoading: boolean;
  error: string | null;
  isDirtyOnDisk: boolean;
  originalContent: string | null;
  isImage: boolean;
  isPdf: boolean;
  isBinary: boolean;
  binaryContent?: Uint8Array;
  isDirty: boolean;
}

export const EMPTY_FILE_VIEW: FileViewState = {
  path: null,
  content: null,
  isLoading: false,
  error: null,
  isDirtyOnDisk: false,
  originalContent: null,
  isImage: false,
  isPdf: false,
  isBinary: false,
  isDirty: false,
};

export function normalizeFileView(activeFile: ActiveFile): FileViewState {
  if (!activeFile) return EMPTY_FILE_VIEW;
  return {
    path: activeFile.path,
    content: activeFile.content,
    isLoading: activeFile.isLoading,
    error: activeFile.error,
    isDirtyOnDisk: activeFile.isDirtyOnDisk,
    originalContent: activeFile.originalContent,
    isImage: activeFile.isImage ?? false,
    isPdf: activeFile.isPdf ?? false,
    isBinary: activeFile.isBinary ?? false,
    binaryContent: activeFile.binaryContent,
    isDirty: activeFile.isDirty,
  };
}

// ── Close Split Button ─────────────────────────────────────────────────────

const CLOSE_SPLIT_BUTTON_BASE: React.CSSProperties = {
  position: 'absolute',
  top: '4px',
  right: '4px',
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  borderRadius: '3px',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  transition: 'opacity 150ms ease, background-color 150ms ease',
};

export function CloseSplitButton({ onClick }: { onClick: () => void }): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const style: React.CSSProperties = {
    ...CLOSE_SPLIT_BUTTON_BASE,
    background: isHovered ? 'var(--surface-raised)' : 'transparent',
    color: isHovered ? 'var(--text-primary)' : 'var(--text-faint)',
  };
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title="Close split pane"
      aria-label="Close split pane"
      style={style}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}

// ── Pane Styles ─────────────────────────────────────────────────────────────

const SPLIT_PANE_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  minWidth: 0,
  position: 'relative',
};

const ACTIVE_SPLIT_BORDER: React.CSSProperties = {
  boxShadow: 'inset 0 2px 0 0 var(--interactive-accent)',
};

export interface SplitFileActions {
  handleReload: () => Promise<void>;
  handleSave: (content: string) => Promise<void>;
  handleContentChange: (content: string) => void;
  handleCancelEdit: () => void;
}

// ── File Pane ───────────────────────────────────────────────────────────────

function FilePaneView({
  view,
  projectRoot,
  actions,
  isActive,
  onClick,
}: {
  view: FileViewState;
  projectRoot: string | null;
  actions: SplitFileActions;
  isActive: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <div
      style={{ ...SPLIT_PANE_STYLE, ...(isActive ? ACTIVE_SPLIT_BORDER : {}) }}
      onClick={onClick}
    >
      <FileViewer
        filePath={view.path}
        content={view.content}
        isLoading={view.isLoading}
        error={view.error}
        isDirtyOnDisk={view.isDirtyOnDisk}
        onReload={actions.handleReload}
        originalContent={view.originalContent}
        projectRoot={projectRoot}
        isImage={view.isImage}
        isPdf={view.isPdf}
        isBinary={view.isBinary}
        binaryContent={view.binaryContent}
        onSave={actions.handleSave}
        onContentChange={actions.handleContentChange}
        onCancelEdit={actions.handleCancelEdit}
        isDirty={view.isDirty}
      />
    </div>
  );
}

// ── Split Content View ───────────────────────────────────────────────────────

export interface SplitContentViewProps {
  leftFile: ActiveFile;
  rightFile: OpenFile | null;
  projectRoot: string | null;
  splitRatio: number;
  activeSplit: 'left' | 'right';
  onFocusLeft: () => void;
  onFocusRight: () => void;
  onDrag: (deltaX: number) => void;
  onResetRatio: () => void;
  onCloseSplit: () => void;
  leftActions: SplitFileActions;
  rightActions: SplitFileActions;
}

function SplitPane({
  view,
  projectRoot,
  actions,
  isActive,
  onClick,
  width,
  children,
}: {
  view: FileViewState;
  projectRoot: string | null;
  actions: SplitFileActions;
  isActive: boolean;
  onClick: () => void;
  width: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      style={{ ...SPLIT_PANE_STYLE, width, ...(isActive ? ACTIVE_SPLIT_BORDER : {}) }}
      onClick={onClick}
    >
      {children}
      <FilePaneView
        view={view}
        projectRoot={projectRoot}
        actions={actions}
        isActive={isActive}
        onClick={onClick}
      />
    </div>
  );
}

export function SplitContentView({
  leftFile,
  rightFile,
  projectRoot,
  splitRatio,
  activeSplit,
  onFocusLeft,
  onFocusRight,
  onDrag,
  onResetRatio,
  onCloseSplit,
  leftActions,
  rightActions,
}: SplitContentViewProps): React.ReactElement {
  const leftView = normalizeFileView(leftFile);
  const rightView = normalizeFileView(rightFile);
  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%' }}>
      <SplitPane
        view={leftView}
        projectRoot={projectRoot}
        actions={leftActions}
        isActive={activeSplit === 'left'}
        onClick={onFocusLeft}
        width={`${splitRatio * 100}%`}
      />
      <SplitDivider onDrag={onDrag} onReset={onResetRatio} />
      <SplitPane
        view={rightView}
        projectRoot={projectRoot}
        actions={rightActions}
        isActive={activeSplit === 'right'}
        onClick={onFocusRight}
        width={`${(1 - splitRatio) * 100}%`}
      >
        <CloseSplitButton onClick={onCloseSplit} />
      </SplitPane>
    </div>
  );
}

// ── Resize handler hook ───────────────────────────────────────────────────────

export function useSplitDragHandler(setSplitRatio: (ratio: number) => void, splitRatio: number) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDrag = useCallback(
    (deltaX: number) => {
      const container = containerRef.current;
      if (!container) return;
      const containerWidth = container.getBoundingClientRect().width;
      if (containerWidth === 0) return;
      setSplitRatio(splitRatio + deltaX / containerWidth);
    },
    [setSplitRatio, splitRatio],
  );

  const handleResetRatio = useCallback(() => {
    setSplitRatio(0.5);
  }, [setSplitRatio]);

  return { containerRef, handleDrag, handleResetRatio };
}
