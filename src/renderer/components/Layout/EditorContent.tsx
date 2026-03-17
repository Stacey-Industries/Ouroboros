import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFileViewerManager, Breadcrumb, FileViewer } from '../FileViewer';
import { useMultiBufferManager, AddExcerptForm } from '../FileViewer/MultiBufferManager';
import { MultiBufferView } from '../FileViewer/MultiBufferView';
import { useProject } from '../../contexts/ProjectContext';
import { useToastContext } from '../../contexts/ToastContext';
import type { BufferExcerpt } from '../../types/electron';
import type { OpenFile } from '../FileViewer';

type ActiveFile = ReturnType<typeof useFileViewerManager>['activeFile'];
type ActiveMultiBuffer = ReturnType<typeof useMultiBufferManager>['multiBuffers'][number] | null;

interface FileViewState {
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

interface MultiBufferActionBarProps { name: string; showAddExcerpt: boolean; onToggleAdd: () => void; }
interface FileViewerActionArgs {
  activeFile: ActiveFile; openFile: ReturnType<typeof useFileViewerManager>['openFile']; saveFile: ReturnType<typeof useFileViewerManager>['saveFile'];
  reloadFile: ReturnType<typeof useFileViewerManager>['reloadFile']; updateDraft: ReturnType<typeof useFileViewerManager>['updateDraft'];
  discardDraft: ReturnType<typeof useFileViewerManager>['discardDraft']; toast: ReturnType<typeof useToastContext>['toast']; setActiveMultiBufferId: (id: string | null) => void;
}

const ACTION_BAR_STYLE: React.CSSProperties = {
  flexShrink: 0,
  height: '28px',
  borderBottom: '1px solid var(--border)',
  backgroundColor: 'var(--bg-secondary)',
  display: 'flex',
  alignItems: 'center',
  padding: '0 8px',
  gap: '8px',
  fontFamily: 'var(--font-ui)',
  fontSize: '0.8125rem',
};
const ACTION_BUTTON_STYLE: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  color: 'var(--accent)',
  padding: '2px 8px',
  fontSize: '0.75rem',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
};
const CONTENT_BODY_STYLE: React.CSSProperties = { flex: 1, minHeight: 0, overflow: 'hidden' };
const EMPTY_FILE_VIEW: FileViewState = {
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

function getFileLabel(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
}

function normalizeFileView(activeFile: ActiveFile): FileViewState {
  if (!activeFile) {
    return EMPTY_FILE_VIEW;
  }

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

function MultiBufferActionBar({
  name,
  showAddExcerpt,
  onToggleAdd,
}: MultiBufferActionBarProps): React.ReactElement {
  const actionLabel = showAddExcerpt ? 'Cancel' : '+ Add Excerpt';

  return (
    <div style={ACTION_BAR_STYLE}>
      <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Snippet Collection:</span>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{name}</span>
      <div style={{ flex: 1 }} />
      <span style={{ color: 'var(--text-faint)', fontSize: '0.6875rem' }}>
        Esc to return to file
      </span>
      <button onClick={onToggleAdd} style={ACTION_BUTTON_STYLE}>{actionLabel}</button>
    </div>
  );
}

function MultiBufferContentView({
  activeMB,
  showAddExcerpt,
  setShowAddExcerpt,
  onAddExcerpt,
  onRemoveExcerpt,
  onOpenFile,
  onDeactivate,
  projectRoot,
}: {
  activeMB: NonNullable<ActiveMultiBuffer>;
  showAddExcerpt: boolean;
  setShowAddExcerpt: (value: boolean) => void;
  onAddExcerpt: (excerpt: BufferExcerpt) => void;
  onRemoveExcerpt: (index: number) => void;
  onOpenFile: (path: string) => void;
  onDeactivate: () => void;
  projectRoot: string | null;
}): React.ReactElement {
  // Escape key returns to the last file tab (only when add form is not open)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !showAddExcerpt) {
        onDeactivate();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDeactivate, showAddExcerpt]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <MultiBufferActionBar
        name={activeMB.config.name}
        showAddExcerpt={showAddExcerpt}
        onToggleAdd={() => setShowAddExcerpt(!showAddExcerpt)}
      />
      {showAddExcerpt ? (
        <AddExcerptForm
          onAdd={onAddExcerpt}
          onCancel={() => setShowAddExcerpt(false)}
          projectRoot={projectRoot}
        />
      ) : null}
      <div style={CONTENT_BODY_STYLE}>
        <MultiBufferView
          name={activeMB.config.name}
          excerpts={activeMB.config.excerpts}
          fileContents={activeMB.fileContents}
          onRemoveExcerpt={onRemoveExcerpt}
          onOpenFile={onOpenFile}
        />
      </div>
    </div>
  );
}

function useMultiBufferEvents(): {
  activeMultiBufferId: string | null;
  setActiveMultiBufferId: (id: string | null) => void;
  showAddExcerpt: boolean;
  setShowAddExcerpt: (value: boolean) => void;
} {
  const [activeMultiBufferId, setActiveMultiBufferId] = useState<string | null>(null);
  const [showAddExcerpt, setShowAddExcerpt] = useState(false);

  useEffect(() => {
    const onActivate = (event: Event) => {
      setActiveMultiBufferId((event as CustomEvent<{ id: string }>).detail.id);
    };
    const onDeactivate = () => {
      setActiveMultiBufferId(null);
      setShowAddExcerpt(false);
    };

    window.addEventListener('agent-ide:activate-multi-buffer', onActivate);
    window.addEventListener('agent-ide:deactivate-multi-buffer', onDeactivate);
    return () => {
      window.removeEventListener('agent-ide:activate-multi-buffer', onActivate);
      window.removeEventListener('agent-ide:deactivate-multi-buffer', onDeactivate);
    };
  }, []);

  return { activeMultiBufferId, setActiveMultiBufferId, showAddExcerpt, setShowAddExcerpt };
}

function useNavigateToDir(): (dirPath: string) => void {
  return useMemo(
    () => (dirPath: string) => {
      window.dispatchEvent(
        new CustomEvent('agent-ide:reveal-in-tree', { detail: { dirPath } }),
      );
    },
    [],
  );
}

function FileContentHeader({
  filePath,
  projectRoot,
}: {
  filePath: string | null;
  projectRoot: string | null;
}): React.ReactElement {
  const onNavigateToDir = useNavigateToDir();
  return (
    <div
      style={{
        flexShrink: 0,
        height: '28px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Breadcrumb filePath={filePath} projectRoot={projectRoot} onNavigateToDir={onNavigateToDir} />
    </div>
  );
}

function FileContentView({
  activeFile,
  projectRoot,
  onReload,
  onSave,
  onContentChange,
  onCancelEdit,
}: {
  activeFile: ActiveFile;
  projectRoot: string | null;
  onReload: () => Promise<void>;
  onSave: (content: string) => Promise<void>;
  onContentChange: (content: string) => void;
  onCancelEdit: () => void;
}): React.ReactElement {
  const fileView = normalizeFileView(activeFile);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <FileContentHeader filePath={fileView.path} projectRoot={projectRoot} />
      <div style={CONTENT_BODY_STYLE}>
        <FileViewer
          filePath={fileView.path}
          content={fileView.content}
          isLoading={fileView.isLoading}
          error={fileView.error}
          isDirtyOnDisk={fileView.isDirtyOnDisk}
          onReload={onReload}
          originalContent={fileView.originalContent}
          projectRoot={projectRoot}
          isImage={fileView.isImage}
          isPdf={fileView.isPdf}
          isBinary={fileView.isBinary}
          binaryContent={fileView.binaryContent}
          onSave={onSave}
          onContentChange={onContentChange}
          onCancelEdit={onCancelEdit}
          isDirty={fileView.isDirty}
        />
      </div>
    </div>
  );
}

function useActiveMultiBuffer(
  multiBuffers: ReturnType<typeof useMultiBufferManager>['multiBuffers'],
  activeMultiBufferId: string | null,
  setActiveMultiBufferId: (id: string | null) => void,
): ActiveMultiBuffer {
  const activeMB = activeMultiBufferId
    ? multiBuffers.find((buffer) => buffer.id === activeMultiBufferId) ?? null
    : null;

  useEffect(() => {
    if (activeMultiBufferId && !activeMB) {
      setActiveMultiBufferId(null);
    }
  }, [activeMB, activeMultiBufferId, setActiveMultiBufferId]);

  return activeMB;
}

function useFileViewerActions({
  activeFile,
  openFile,
  saveFile,
  reloadFile,
  updateDraft,
  discardDraft,
  toast,
  setActiveMultiBufferId,
}: FileViewerActionArgs) {
  const handleReload = useCallback(async () => {
    if (!activeFile) return;
    if (activeFile.isDirty) {
      const confirmed = window.confirm(`Reload ${getFileLabel(activeFile.path)} from disk and discard your draft?`);
      if (!confirmed) {
        return;
      }
    }
    const result = await reloadFile(activeFile.path);
    if (!result.success) {
      toast(result.error ?? `Failed to reload ${getFileLabel(activeFile.path)}`, 'error');
      return;
    }
    toast(`Reloaded ${getFileLabel(activeFile.path)} from disk`, 'info');
  }, [activeFile, reloadFile, toast]);

  const handleSave = useCallback(async (content: string) => {
    if (!activeFile) return;
    const result = await saveFile(activeFile.path, content);
    if (!result.success) {
      toast(result.error ?? `Failed to save ${getFileLabel(activeFile.path)}`, 'error');
      return;
    }
    toast(`Saved ${getFileLabel(activeFile.path)}`, 'success');
  }, [activeFile, saveFile, toast]);

  const handleContentChange = useCallback((content: string) => {
    if (activeFile) updateDraft(activeFile.path, content);
  }, [activeFile, updateDraft]);

  const handleCancelEdit = useCallback(() => {
    if (!activeFile) {
      return;
    }
    discardDraft(activeFile.path);
  }, [activeFile, discardDraft]);

  const handleOpenFileFromExcerpt = useCallback((filePath: string) => {
    setActiveMultiBufferId(null);
    void openFile(filePath);
  }, [openFile, setActiveMultiBufferId]);

  return { handleReload, handleSave, handleContentChange, handleCancelEdit, handleOpenFileFromExcerpt };
}

function useExcerptActions(
  activeMultiBufferId: string | null,
  addExcerpt: ReturnType<typeof useMultiBufferManager>['addExcerpt'],
  removeExcerpt: ReturnType<typeof useMultiBufferManager>['removeExcerpt'],
  setShowAddExcerpt: (value: boolean) => void,
) {
  const handleRemoveExcerpt = useCallback((index: number) => {
    if (activeMultiBufferId) removeExcerpt(activeMultiBufferId, index);
  }, [activeMultiBufferId, removeExcerpt]);

  const handleAddExcerpt = useCallback((excerpt: BufferExcerpt) => {
    if (!activeMultiBufferId) return;
    addExcerpt(activeMultiBufferId, excerpt);
    setShowAddExcerpt(false);
  }, [activeMultiBufferId, addExcerpt, setShowAddExcerpt]);

  return { handleRemoveExcerpt, handleAddExcerpt };
}

// ── File-specific action hooks for right pane ───────────────────────────

function useFileActions(
  file: OpenFile | null,
  saveFile: (filePath: string, content?: string) => Promise<{ success: boolean; error?: string }>,
  reloadFile: (filePath: string) => Promise<{ success: boolean; content?: string | null; error?: string }>,
  updateDraft: (filePath: string, content: string) => void,
  discardDraft: (filePath: string) => void,
  toast: ReturnType<typeof useToastContext>['toast'],
) {
  const handleReload = useCallback(async () => {
    if (!file) return;
    if (file.isDirty) {
      const confirmed = window.confirm(`Reload ${getFileLabel(file.path)} from disk and discard your draft?`);
      if (!confirmed) return;
    }
    const result = await reloadFile(file.path);
    if (!result.success) {
      toast(result.error ?? `Failed to reload ${getFileLabel(file.path)}`, 'error');
      return;
    }
    toast(`Reloaded ${getFileLabel(file.path)} from disk`, 'info');
  }, [file, reloadFile, toast]);

  const handleSave = useCallback(async (content: string) => {
    if (!file) return;
    const result = await saveFile(file.path, content);
    if (!result.success) {
      toast(result.error ?? `Failed to save ${getFileLabel(file.path)}`, 'error');
      return;
    }
    toast(`Saved ${getFileLabel(file.path)}`, 'success');
  }, [file, saveFile, toast]);

  const handleContentChange = useCallback((content: string) => {
    if (file) updateDraft(file.path, content);
  }, [file, updateDraft]);

  const handleCancelEdit = useCallback(() => {
    if (file) discardDraft(file.path);
  }, [file, discardDraft]);

  return { handleReload, handleSave, handleContentChange, handleCancelEdit };
}

// ── Split Divider ───────────────────────────────────────────────────────

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
  backgroundColor: 'var(--border)',
  transition: 'background-color 150ms ease, opacity 150ms ease',
  opacity: 0,
};

function SplitDivider({
  onDrag,
  onReset,
}: {
  onDrag: (deltaX: number) => void;
  onReset: () => void;
}): React.ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
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
  }, [onDrag]);

  const lineStyle: React.CSSProperties = {
    ...SPLIT_DIVIDER_LINE_STYLE,
    opacity: isHovered || isDragging ? 1 : 0,
    backgroundColor: isHovered || isDragging ? 'var(--accent)' : 'var(--border)',
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
      {/* Larger hit area */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '-4px', right: '-4px' }} />
      <div style={lineStyle} />
    </div>
  );
}

// ── Split pane container style ──────────────────────────────────────────

const SPLIT_PANE_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  minWidth: 0,
  position: 'relative',
};

const ACTIVE_SPLIT_BORDER: React.CSSProperties = {
  boxShadow: 'inset 0 2px 0 0 var(--accent)',
};

// ── Close split button ──────────────────────────────────────────────────

function CloseSplitButton({ onClick }: { onClick: () => void }): React.ReactElement {
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
        background: isHovered ? 'var(--bg-tertiary)' : 'transparent',
        color: isHovered ? 'var(--text)' : 'var(--text-faint)',
        cursor: 'pointer',
        padding: 0,
        transition: 'opacity 150ms ease, background-color 150ms ease',
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}

// ── Split content view ──────────────────────────────────────────────────

function SplitContentView({
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
}: {
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
  leftActions: ReturnType<typeof useFileActions>;
  rightActions: ReturnType<typeof useFileActions>;
}): React.ReactElement {
  const leftView = normalizeFileView(leftFile);
  const rightView = normalizeFileView(rightFile);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%' }}>
      {/* Left pane */}
      <div
        style={{
          ...SPLIT_PANE_STYLE,
          width: `${splitRatio * 100}%`,
          ...(activeSplit === 'left' ? ACTIVE_SPLIT_BORDER : {}),
        }}
        onClick={onFocusLeft}
      >
        <FileContentHeader filePath={leftView.path} projectRoot={projectRoot} />
        <div style={CONTENT_BODY_STYLE}>
          <FileViewer
            filePath={leftView.path}
            content={leftView.content}
            isLoading={leftView.isLoading}
            error={leftView.error}
            isDirtyOnDisk={leftView.isDirtyOnDisk}
            onReload={leftActions.handleReload}
            originalContent={leftView.originalContent}
            projectRoot={projectRoot}
            isImage={leftView.isImage}
            isPdf={leftView.isPdf}
            isBinary={leftView.isBinary}
            binaryContent={leftView.binaryContent}
            onSave={leftActions.handleSave}
            onContentChange={leftActions.handleContentChange}
            onCancelEdit={leftActions.handleCancelEdit}
            isDirty={leftView.isDirty}
          />
        </div>
      </div>

      {/* Split divider */}
      <SplitDivider onDrag={onDrag} onReset={onResetRatio} />

      {/* Right pane */}
      <div
        style={{
          ...SPLIT_PANE_STYLE,
          width: `${(1 - splitRatio) * 100}%`,
          ...(activeSplit === 'right' ? ACTIVE_SPLIT_BORDER : {}),
        }}
        onClick={onFocusRight}
      >
        <CloseSplitButton onClick={onCloseSplit} />
        <FileContentHeader filePath={rightView.path} projectRoot={projectRoot} />
        <div style={CONTENT_BODY_STYLE}>
          <FileViewer
            filePath={rightView.path}
            content={rightView.content}
            isLoading={rightView.isLoading}
            error={rightView.error}
            isDirtyOnDisk={rightView.isDirtyOnDisk}
            onReload={rightActions.handleReload}
            originalContent={rightView.originalContent}
            projectRoot={projectRoot}
            isImage={rightView.isImage}
            isPdf={rightView.isPdf}
            isBinary={rightView.isBinary}
            binaryContent={rightView.binaryContent}
            onSave={rightActions.handleSave}
            onContentChange={rightActions.handleContentChange}
            onCancelEdit={rightActions.handleCancelEdit}
            isDirty={rightView.isDirty}
          />
        </div>
      </div>
    </div>
  );
}

// ── Resize handler hook ─────────────────────────────────────────────────

function useSplitDragHandler(
  setSplitRatio: (ratio: number) => void,
  splitRatio: number,
) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDrag = useCallback((deltaX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.getBoundingClientRect().width;
    if (containerWidth === 0) return;
    const ratioDelta = deltaX / containerWidth;
    setSplitRatio(splitRatio + ratioDelta);
  }, [setSplitRatio, splitRatio]);

  const handleResetRatio = useCallback(() => {
    setSplitRatio(0.5);
  }, [setSplitRatio]);

  return { containerRef, handleDrag, handleResetRatio };
}

// ── Main EditorContent ──────────────────────────────────────────────────

export function EditorContent(): React.ReactElement {
  const {
    activeFile, openFile, saveFile, reloadFile, updateDraft, discardDraft,
    split, setActiveSplit, setSplitRatio, closeSplit, rightFile,
  } = useFileViewerManager();
  const { multiBuffers, addExcerpt, removeExcerpt } = useMultiBufferManager();
  const { projectRoot } = useProject();
  const { toast } = useToastContext();
  const { activeMultiBufferId, setActiveMultiBufferId, showAddExcerpt, setShowAddExcerpt } = useMultiBufferEvents();
  const activeMB = useActiveMultiBuffer(multiBuffers, activeMultiBufferId, setActiveMultiBufferId);
  const fileActions = useFileViewerActions({ activeFile, openFile, saveFile, reloadFile, updateDraft, discardDraft, toast, setActiveMultiBufferId });
  const excerptActions = useExcerptActions(activeMultiBufferId, addExcerpt, removeExcerpt, setShowAddExcerpt);

  // Actions for the right split pane file
  const rightFileActions = useFileActions(rightFile, saveFile, reloadFile, updateDraft, discardDraft, toast);
  const { containerRef, handleDrag, handleResetRatio } = useSplitDragHandler(setSplitRatio, split.splitRatio);

  const handleFocusLeft = useCallback(() => setActiveSplit('left'), [setActiveSplit]);
  const handleFocusRight = useCallback(() => setActiveSplit('right'), [setActiveSplit]);

  const handleDeactivateMultiBuffer = useCallback(() => {
    setActiveMultiBufferId(null);
    setShowAddExcerpt(false);
    window.dispatchEvent(new CustomEvent('agent-ide:deactivate-multi-buffer'));
  }, [setActiveMultiBufferId, setShowAddExcerpt]);

  if (activeMB) {
    return (
      <MultiBufferContentView
        activeMB={activeMB}
        showAddExcerpt={showAddExcerpt}
        setShowAddExcerpt={setShowAddExcerpt}
        onAddExcerpt={excerptActions.handleAddExcerpt}
        onRemoveExcerpt={excerptActions.handleRemoveExcerpt}
        onOpenFile={fileActions.handleOpenFileFromExcerpt}
        onDeactivate={handleDeactivateMultiBuffer}
        projectRoot={projectRoot}
      />
    );
  }

  if (split.isSplit) {
    return (
      <div ref={containerRef} style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%' }}>
        <SplitContentView
          leftFile={activeFile}
          rightFile={rightFile}
          projectRoot={projectRoot}
          splitRatio={split.splitRatio}
          activeSplit={split.activeSplit}
          onFocusLeft={handleFocusLeft}
          onFocusRight={handleFocusRight}
          onDrag={handleDrag}
          onResetRatio={handleResetRatio}
          onCloseSplit={closeSplit}
          leftActions={{
            handleReload: fileActions.handleReload,
            handleSave: fileActions.handleSave,
            handleContentChange: fileActions.handleContentChange,
            handleCancelEdit: fileActions.handleCancelEdit,
          }}
          rightActions={rightFileActions}
        />
      </div>
    );
  }

  return (
    <FileContentView
      activeFile={activeFile}
      projectRoot={projectRoot}
      onReload={fileActions.handleReload}
      onSave={fileActions.handleSave}
      onContentChange={fileActions.handleContentChange}
      onCancelEdit={fileActions.handleCancelEdit}
    />
  );
}
