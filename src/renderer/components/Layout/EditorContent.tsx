import React, { useCallback, useEffect, useState } from 'react';
import { useFileViewerManager, Breadcrumb, FileViewer } from '../FileViewer';
import { useMultiBufferManager, AddExcerptForm } from '../FileViewer/MultiBufferManager';
import { MultiBufferView } from '../FileViewer/MultiBufferView';
import { useProject } from '../../contexts/ProjectContext';
import { useToastContext } from '../../contexts/ToastContext';
import type { BufferExcerpt } from '../../types/electron';

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
  setDirty: ReturnType<typeof useFileViewerManager>['setDirty']; toast: ReturnType<typeof useToastContext>['toast']; setActiveMultiBufferId: (id: string | null) => void;
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
    isDirty: activeFile.isDirty ?? false,
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
      <span style={{ color: 'var(--text-muted)' }}>Multi-Buffer:</span>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{name}</span>
      <div style={{ flex: 1 }} />
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
}: {
  activeMB: NonNullable<ActiveMultiBuffer>;
  showAddExcerpt: boolean;
  setShowAddExcerpt: (value: boolean) => void;
  onAddExcerpt: (excerpt: BufferExcerpt) => void;
  onRemoveExcerpt: (index: number) => void;
  onOpenFile: (path: string) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <MultiBufferActionBar
        name={activeMB.config.name}
        showAddExcerpt={showAddExcerpt}
        onToggleAdd={() => setShowAddExcerpt(!showAddExcerpt)}
      />
      {showAddExcerpt ? <AddExcerptForm onAdd={onAddExcerpt} onCancel={() => setShowAddExcerpt(false)} /> : null}
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

function FileContentHeader({
  filePath,
  projectRoot,
}: {
  filePath: string | null;
  projectRoot: string | null;
}): React.ReactElement {
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
      <Breadcrumb filePath={filePath} projectRoot={projectRoot} />
    </div>
  );
}

function FileContentView({
  activeFile,
  projectRoot,
  onReload,
  onSave,
  onDirtyChange,
}: {
  activeFile: ActiveFile;
  projectRoot: string | null;
  onReload: () => Promise<void>;
  onSave: (content: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
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
          onDirtyChange={onDirtyChange}
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
  setDirty,
  toast,
  setActiveMultiBufferId,
}: FileViewerActionArgs) {
  const handleReload = useCallback(async () => {
    if (!activeFile) return;
    await openFile(activeFile.path);
    toast(`Reloaded ${getFileLabel(activeFile.path)} from disk`, 'info');
  }, [activeFile, openFile, toast]);

  const handleSave = useCallback(async (content: string) => {
    if (!activeFile) return;
    await saveFile(activeFile.path, content);
    toast(`Saved ${getFileLabel(activeFile.path)}`, 'info');
  }, [activeFile, saveFile, toast]);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    if (activeFile) setDirty(activeFile.path, dirty);
  }, [activeFile, setDirty]);

  const handleOpenFileFromExcerpt = useCallback((filePath: string) => {
    setActiveMultiBufferId(null);
    void openFile(filePath);
  }, [openFile, setActiveMultiBufferId]);

  return { handleReload, handleSave, handleDirtyChange, handleOpenFileFromExcerpt };
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

export function EditorContent(): React.ReactElement {
  const { activeFile, openFile, saveFile, setDirty } = useFileViewerManager();
  const { multiBuffers, addExcerpt, removeExcerpt } = useMultiBufferManager();
  const { projectRoot } = useProject();
  const { toast } = useToastContext();
  const { activeMultiBufferId, setActiveMultiBufferId, showAddExcerpt, setShowAddExcerpt } = useMultiBufferEvents();
  const activeMB = useActiveMultiBuffer(multiBuffers, activeMultiBufferId, setActiveMultiBufferId);
  const fileActions = useFileViewerActions({ activeFile, openFile, saveFile, setDirty, toast, setActiveMultiBufferId });
  const excerptActions = useExcerptActions(activeMultiBufferId, addExcerpt, removeExcerpt, setShowAddExcerpt);

  return activeMB ? (
    <MultiBufferContentView
      activeMB={activeMB}
      showAddExcerpt={showAddExcerpt}
      setShowAddExcerpt={setShowAddExcerpt}
      onAddExcerpt={excerptActions.handleAddExcerpt}
      onRemoveExcerpt={excerptActions.handleRemoveExcerpt}
      onOpenFile={fileActions.handleOpenFileFromExcerpt}
    />
  ) : (
    <FileContentView
      activeFile={activeFile}
      projectRoot={projectRoot}
      onReload={fileActions.handleReload}
      onSave={fileActions.handleSave}
      onDirtyChange={fileActions.handleDirtyChange}
    />
  );
}
