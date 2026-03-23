/**
 * EditorSplitView — Split-pane editor components.
 * Extracted from EditorContent.tsx to stay under file line limits.
 */

import React, { useCallback, useRef, useState } from 'react';

import type { OpenFile } from '../FileViewer';
import { FileViewer } from '../FileViewer';

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

// ── Split Divider ─────────────────────────────────────────────────────────

const SPLIT_DIVIDER_STYLE: React.CSSProperties = {
  width: '5px',
  flexShrink: 0,
  cursor: 'col-resize',
  position: 'relative',
  zIndex: 10,
  userSelect: 'none',
  touchAction: 'none',
};

const SPLIT_DIVIDER_LINE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: '2px',
  width: '1px',
  transition: 'background-color 150ms ease, opacity 150ms ease',
  opacity: 0,
};

function useSplitDividerDrag(onDrag: (deltaX: number) => void) {
  const startXRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startXRef.current = e.clientX;
      setIsDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      function handlePointerMove(ev: PointerEvent): void {
        const deltaX = ev.clientX - startXRef.current;
        startXRef.current = ev.clientX;
        onDrag(deltaX);
      }
      function handlePointerUp(): void {
        setIsDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        document.removeEventListener('pointercancel', handlePointerUp);
      }
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('pointercancel', handlePointerUp);
    },
    [onDrag],
  );

  return { isDragging, handlePointerDown };
}

export function SplitDivider({
  onDrag,
  onReset,
}: {
  onDrag: (deltaX: number) => void;
  onReset: () => void;
}): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const { isDragging, handlePointerDown } = useSplitDividerDrag(onDrag);
  const lineStyle: React.CSSProperties = {
    ...SPLIT_DIVIDER_LINE_STYLE,
    opacity: isHovered || isDragging ? 1 : 0,
    backgroundColor:
      isHovered || isDragging ? 'var(--interactive-accent)' : 'var(--border-semantic)',
  };
  return (
    <div
      style={SPLIT_DIVIDER_STYLE}
      onPointerDown={handlePointerDown}
      onDoubleClick={onReset}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize split panes"
    >
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '-4px', right: '-4px' }} />
      <div style={lineStyle} />
    </div>
  );
}

// ── Close Split Button ─────────────────────────────────────────────────────

export function CloseSplitButton({ onClick }: { onClick: () => void }): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title="Close split pane"
      aria-label="Close split pane"
      style={{
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
        background: isHovered ? 'var(--surface-raised)' : 'transparent',
        color: isHovered ? 'var(--text-primary)' : 'var(--text-faint)',
        cursor: 'pointer',
        padding: 0,
        transition: 'opacity 150ms ease, background-color 150ms ease',
      }}
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
      <div
        style={{
          ...SPLIT_PANE_STYLE,
          width: `${splitRatio * 100}%`,
          ...(activeSplit === 'left' ? ACTIVE_SPLIT_BORDER : {}),
        }}
        onClick={onFocusLeft}
      >
        <FilePaneView
          view={leftView}
          projectRoot={projectRoot}
          actions={leftActions}
          isActive={activeSplit === 'left'}
          onClick={onFocusLeft}
        />
      </div>
      <SplitDivider onDrag={onDrag} onReset={onResetRatio} />
      <div
        style={{
          ...SPLIT_PANE_STYLE,
          width: `${(1 - splitRatio) * 100}%`,
          ...(activeSplit === 'right' ? ACTIVE_SPLIT_BORDER : {}),
        }}
        onClick={onFocusRight}
      >
        <CloseSplitButton onClick={onCloseSplit} />
        <FilePaneView
          view={rightView}
          projectRoot={projectRoot}
          actions={rightActions}
          isActive={activeSplit === 'right'}
          onClick={onFocusRight}
        />
      </div>
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
