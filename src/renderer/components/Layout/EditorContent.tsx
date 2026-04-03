import React, { useCallback, useEffect, useState } from 'react';

import { useProject } from '../../contexts/ProjectContext';
import { useToastContext } from '../../contexts/ToastContext';
import type { BufferExcerpt } from '../../types/electron';
import type { OpenFile } from '../FileViewer';
import { FileViewer, useFileViewerManager } from '../FileViewer';
import { AddExcerptForm, useMultiBufferManager } from '../FileViewer/MultiBufferManager';
import { MultiBufferView } from '../FileViewer/MultiBufferView';
import type { SplitFileActions } from './EditorSplitView';
import {
  normalizeFileView,
  SplitContentView,
  useSplitDragHandler,
} from './EditorSplitView';

type ActiveFile = ReturnType<typeof useFileViewerManager>['activeFile'];
type ActiveMultiBuffer = ReturnType<typeof useMultiBufferManager>['multiBuffers'][number] | null;

interface MultiBufferActionBarProps { name: string; showAddExcerpt: boolean; onToggleAdd: () => void; }
interface FileViewerActionArgs {
  activeFile: ActiveFile;
  openFile: ReturnType<typeof useFileViewerManager>['openFile'];
  saveFile: ReturnType<typeof useFileViewerManager>['saveFile'];
  reloadFile: ReturnType<typeof useFileViewerManager>['reloadFile'];
  updateDraft: ReturnType<typeof useFileViewerManager>['updateDraft'];
  discardDraft: ReturnType<typeof useFileViewerManager>['discardDraft'];
  toast: ReturnType<typeof useToastContext>['toast'];
  setActiveMultiBufferId: (id: string | null) => void;
}

const ACTION_BAR_STYLE: React.CSSProperties = {
  flexShrink: 0, height: '28px', display: 'flex', alignItems: 'center',
  padding: '0 8px', gap: '8px', fontFamily: 'var(--font-ui)', fontSize: '0.8125rem',
};
const ACTION_BUTTON_STYLE: React.CSSProperties = {
  background: 'none', borderRadius: '3px', padding: '2px 8px',
  fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'var(--font-ui)',
};
const CONTENT_BODY_STYLE: React.CSSProperties = { flex: 1, minHeight: 0, overflow: 'hidden' };

function getFileLabel(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
}

function MultiBufferActionBar({ name, showAddExcerpt, onToggleAdd }: MultiBufferActionBarProps): React.ReactElement {
  return (
    <div className="bg-surface-panel border-b border-border-semantic" style={ACTION_BAR_STYLE}>
      <span className="text-text-semantic-muted" style={{ fontStyle: 'italic' }}>Snippet Collection:</span>
      <span className="text-text-semantic-primary" style={{ fontWeight: 600 }}>{name}</span>
      <div style={{ flex: 1 }} />
      <span className="text-text-semantic-faint" style={{ fontSize: '0.6875rem' }}>Esc to return to file</span>
      <button onClick={onToggleAdd} className="border border-border-semantic text-interactive-accent" style={ACTION_BUTTON_STYLE}>
        {showAddExcerpt ? 'Cancel' : '+ Add Excerpt'}
      </button>
    </div>
  );
}

function MultiBufferContentView({ activeMB, showAddExcerpt, setShowAddExcerpt, onAddExcerpt, onRemoveExcerpt, onOpenFile, onDeactivate, projectRoot }: {
  activeMB: NonNullable<ActiveMultiBuffer>; showAddExcerpt: boolean;
  setShowAddExcerpt: (value: boolean) => void; onAddExcerpt: (excerpt: BufferExcerpt) => void;
  onRemoveExcerpt: (index: number) => void; onOpenFile: (path: string) => void;
  onDeactivate: () => void; projectRoot: string | null;
}): React.ReactElement {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !showAddExcerpt) onDeactivate();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDeactivate, showAddExcerpt]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <MultiBufferActionBar name={activeMB.config.name} showAddExcerpt={showAddExcerpt} onToggleAdd={() => setShowAddExcerpt(!showAddExcerpt)} />
      {showAddExcerpt && <AddExcerptForm onAdd={onAddExcerpt} onCancel={() => setShowAddExcerpt(false)} projectRoot={projectRoot} />}
      <div style={CONTENT_BODY_STYLE}>
        <MultiBufferView name={activeMB.config.name} excerpts={activeMB.config.excerpts} fileContents={activeMB.fileContents} onRemoveExcerpt={onRemoveExcerpt} onOpenFile={onOpenFile} />
      </div>
    </div>
  );
}

function FileContentView({ activeFile, projectRoot, onReload, onSave, onContentChange, onCancelEdit }: {
  activeFile: ActiveFile; projectRoot: string | null; onReload: () => Promise<void>;
  onSave: (content: string) => Promise<void>; onContentChange: (content: string) => void; onCancelEdit: () => void;
}): React.ReactElement {
  const fileView = normalizeFileView(activeFile);
  return (
    <FileViewer filePath={fileView.path} content={fileView.content} isLoading={fileView.isLoading}
      error={fileView.error} isDirtyOnDisk={fileView.isDirtyOnDisk} onReload={onReload}
      originalContent={fileView.originalContent} projectRoot={projectRoot}
      isImage={fileView.isImage} isPdf={fileView.isPdf} isAudio={fileView.isAudio}
      isVideo={fileView.isVideo} isBinary={fileView.isBinary}
      binaryContent={fileView.binaryContent} onSave={onSave} onContentChange={onContentChange}
      onCancelEdit={onCancelEdit} isDirty={fileView.isDirty} />
  );
}

function useMultiBufferEvents() {
  const [activeMultiBufferId, setActiveMultiBufferId] = useState<string | null>(null);
  const [showAddExcerpt, setShowAddExcerpt] = useState(false);
  useEffect(() => {
    const onActivate = (event: Event) => { setActiveMultiBufferId((event as CustomEvent<{ id: string }>).detail.id); };
    const onDeactivate = () => { setActiveMultiBufferId(null); setShowAddExcerpt(false); };
    window.addEventListener('agent-ide:activate-multi-buffer', onActivate);
    window.addEventListener('agent-ide:deactivate-multi-buffer', onDeactivate);
    return () => {
      window.removeEventListener('agent-ide:activate-multi-buffer', onActivate);
      window.removeEventListener('agent-ide:deactivate-multi-buffer', onDeactivate);
    };
  }, []);
  return { activeMultiBufferId, setActiveMultiBufferId, showAddExcerpt, setShowAddExcerpt };
}

function useActiveMultiBuffer(
  multiBuffers: ReturnType<typeof useMultiBufferManager>['multiBuffers'],
  activeMultiBufferId: string | null,
  setActiveMultiBufferId: (id: string | null) => void,
): ActiveMultiBuffer {
  const activeMB = activeMultiBufferId ? multiBuffers.find((b) => b.id === activeMultiBufferId) ?? null : null;
  useEffect(() => {
    if (activeMultiBufferId && !activeMB) setActiveMultiBufferId(null);
  }, [activeMB, activeMultiBufferId, setActiveMultiBufferId]);
  return activeMB;
}

function useFileViewerActions({ activeFile, openFile, saveFile, reloadFile, updateDraft, discardDraft, toast, setActiveMultiBufferId }: FileViewerActionArgs): SplitFileActions & { handleOpenFileFromExcerpt: (filePath: string) => void } {
  const handleReload = useCallback(async () => {
    if (!activeFile) return;
    if (activeFile.isDirty && !window.confirm(`Reload ${getFileLabel(activeFile.path)} from disk and discard your draft?`)) return;
    const result = await reloadFile(activeFile.path);
    if (!result.success) { toast(result.error ?? `Failed to reload ${getFileLabel(activeFile.path)}`, 'error'); return; }
    toast(`Reloaded ${getFileLabel(activeFile.path)} from disk`, 'info');
  }, [activeFile, reloadFile, toast]);

  const handleSave = useCallback(async (content: string) => {
    if (!activeFile) return;
    const result = await saveFile(activeFile.path, content);
    if (!result.success) { toast(result.error ?? `Failed to save ${getFileLabel(activeFile.path)}`, 'error'); return; }
    toast(`Saved ${getFileLabel(activeFile.path)}`, 'success');
  }, [activeFile, saveFile, toast]);

  const handleContentChange = useCallback((content: string) => { if (activeFile) updateDraft(activeFile.path, content); }, [activeFile, updateDraft]);
  const handleCancelEdit = useCallback(() => { if (activeFile) discardDraft(activeFile.path); }, [activeFile, discardDraft]);
  const handleOpenFileFromExcerpt = useCallback((filePath: string) => { setActiveMultiBufferId(null); void openFile(filePath); }, [openFile, setActiveMultiBufferId]);

  return { handleReload, handleSave, handleContentChange, handleCancelEdit, handleOpenFileFromExcerpt };
}

function useFileActions(opts: {
  file: OpenFile | null;
  saveFile: (filePath: string, content?: string) => Promise<{ success: boolean; error?: string }>;
  reloadFile: (filePath: string) => Promise<{ success: boolean; content?: string | null; error?: string }>;
  updateDraft: (filePath: string, content: string) => void;
  discardDraft: (filePath: string) => void;
  toast: ReturnType<typeof useToastContext>['toast'];
}): SplitFileActions {
  const { file, saveFile, reloadFile, updateDraft, discardDraft, toast } = opts;
  const handleReload = useCallback(async () => {
    if (!file) return;
    if (file.isDirty && !window.confirm(`Reload ${getFileLabel(file.path)} from disk and discard your draft?`)) return;
    const result = await reloadFile(file.path);
    if (!result.success) { toast(result.error ?? `Failed to reload ${getFileLabel(file.path)}`, 'error'); return; }
    toast(`Reloaded ${getFileLabel(file.path)} from disk`, 'info');
  }, [file, reloadFile, toast]);

  const handleSave = useCallback(async (content: string) => {
    if (!file) return;
    const result = await saveFile(file.path, content);
    if (!result.success) { toast(result.error ?? `Failed to save ${getFileLabel(file.path)}`, 'error'); return; }
    toast(`Saved ${getFileLabel(file.path)}`, 'success');
  }, [file, saveFile, toast]);

  const handleContentChange = useCallback((content: string) => { if (file) updateDraft(file.path, content); }, [file, updateDraft]);
  const handleCancelEdit = useCallback(() => { if (file) discardDraft(file.path); }, [file, discardDraft]);
  return { handleReload, handleSave, handleContentChange, handleCancelEdit };
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

function useEditorContentActions(
  setActiveSplit: ReturnType<typeof useFileViewerManager>['setActiveSplit'],
  setActiveMultiBufferId: (id: string | null) => void,
  setShowAddExcerpt: (value: boolean) => void,
): {
  handleFocusLeft: () => void;
  handleFocusRight: () => void;
  handleDeactivateMultiBuffer: () => void;
} {
  const handleFocusLeft = useCallback(() => setActiveSplit('left'), [setActiveSplit]);
  const handleFocusRight = useCallback(() => setActiveSplit('right'), [setActiveSplit]);
  const handleDeactivateMultiBuffer = useCallback(() => {
    setActiveMultiBufferId(null);
    setShowAddExcerpt(false);
    window.dispatchEvent(new CustomEvent('agent-ide:deactivate-multi-buffer'));
  }, [setActiveMultiBufferId, setShowAddExcerpt]);

  return { handleFocusLeft, handleFocusRight, handleDeactivateMultiBuffer };
}

export function EditorContent(): React.ReactElement {
  const { activeFile, openFile, saveFile, reloadFile, updateDraft, discardDraft, split, setActiveSplit, setSplitRatio, closeSplit, rightFile } = useFileViewerManager();
  const { multiBuffers, addExcerpt, removeExcerpt } = useMultiBufferManager();
  const { projectRoot } = useProject();
  const { toast } = useToastContext();
  const { activeMultiBufferId, setActiveMultiBufferId, showAddExcerpt, setShowAddExcerpt } = useMultiBufferEvents();
  const activeMB = useActiveMultiBuffer(multiBuffers, activeMultiBufferId, setActiveMultiBufferId);
  const fileActions = useFileViewerActions({ activeFile, openFile, saveFile, reloadFile, updateDraft, discardDraft, toast, setActiveMultiBufferId });
  const excerptActions = useExcerptActions(activeMultiBufferId, addExcerpt, removeExcerpt, setShowAddExcerpt);
  const rightFileActions = useFileActions({ file: rightFile, saveFile, reloadFile, updateDraft, discardDraft, toast });
  const { containerRef, handleDrag, handleResetRatio } = useSplitDragHandler(setSplitRatio, split.splitRatio);
  const { handleFocusLeft, handleFocusRight, handleDeactivateMultiBuffer } = useEditorContentActions(setActiveSplit, setActiveMultiBufferId, setShowAddExcerpt);
  if (activeMB) {
    return (
      <MultiBufferContentView activeMB={activeMB} showAddExcerpt={showAddExcerpt} setShowAddExcerpt={setShowAddExcerpt} onAddExcerpt={excerptActions.handleAddExcerpt} onRemoveExcerpt={excerptActions.handleRemoveExcerpt} onOpenFile={fileActions.handleOpenFileFromExcerpt} onDeactivate={handleDeactivateMultiBuffer} projectRoot={projectRoot} />
    );
  }

  if (split.isSplit) {
    return (
      <div ref={containerRef} style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%' }}>
        <SplitContentView leftFile={activeFile} rightFile={rightFile} projectRoot={projectRoot}
          splitRatio={split.splitRatio} activeSplit={split.activeSplit}
          onFocusLeft={handleFocusLeft} onFocusRight={handleFocusRight}
          onDrag={handleDrag} onResetRatio={handleResetRatio} onCloseSplit={closeSplit}
          leftActions={{ handleReload: fileActions.handleReload, handleSave: fileActions.handleSave, handleContentChange: fileActions.handleContentChange, handleCancelEdit: fileActions.handleCancelEdit }}
          rightActions={rightFileActions} />
      </div>
    );
  }

  return (
    <FileContentView activeFile={activeFile} projectRoot={projectRoot}
      onReload={fileActions.handleReload} onSave={fileActions.handleSave}
      onContentChange={fileActions.handleContentChange} onCancelEdit={fileActions.handleCancelEdit} />
  );
}
