/**
 * EditorContent — renders breadcrumb + FileViewer or multi-buffer view.
 *
 * Extracted from App.tsx. Reads active file from FileViewerManager context
 * and multi-buffer state from MultiBufferManager context.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  useFileViewerManager,
  Breadcrumb,
  FileViewer,
} from '../FileViewer';
import { useMultiBufferManager, AddExcerptForm } from '../FileViewer/MultiBufferManager';
import { MultiBufferView } from '../FileViewer/MultiBufferView';
import { useProject } from '../../contexts/ProjectContext';
import { useToastContext } from '../../contexts/ToastContext';
import type { BufferExcerpt } from '../../types/electron';

// ── Multi-buffer action bar ───────────────────────────────────

function MultiBufferActionBar({
  name,
  showAddExcerpt,
  onToggleAdd,
}: {
  name: string;
  showAddExcerpt: boolean;
  onToggleAdd: () => void;
}): React.ReactElement {
  return (
    <div
      style={{
        flexShrink: 0, height: '28px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center',
        padding: '0 8px', gap: '8px',
        fontFamily: 'var(--font-ui)', fontSize: '0.8125rem',
      }}
    >
      <span style={{ color: 'var(--text-muted)' }}>Multi-Buffer:</span>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{name}</span>
      <div style={{ flex: 1 }} />
      <button
        onClick={onToggleAdd}
        style={{
          background: 'none', border: '1px solid var(--border)',
          borderRadius: '3px', color: 'var(--accent)',
          padding: '2px 8px', fontSize: '0.75rem',
          cursor: 'pointer', fontFamily: 'var(--font-ui)',
        }}
      >
        {showAddExcerpt ? 'Cancel' : '+ Add Excerpt'}
      </button>
    </div>
  );
}

// ── Multi-buffer content view ─────────────────────────────────

function MultiBufferContentView({
  activeMB,
  showAddExcerpt,
  setShowAddExcerpt,
  onAddExcerpt,
  onRemoveExcerpt,
  onOpenFile,
}: {
  activeMB: { config: { name: string; excerpts: BufferExcerpt[] }; fileContents: Map<string, string> };
  showAddExcerpt: boolean;
  setShowAddExcerpt: (v: boolean) => void;
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
      {showAddExcerpt && (
        <AddExcerptForm
          onAdd={onAddExcerpt}
          onCancel={() => setShowAddExcerpt(false)}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
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

// ── Hooks for multi-buffer events ─────────────────────────────

function useMultiBufferEvents(): {
  activeMultiBufferId: string | null;
  setActiveMultiBufferId: (id: string | null) => void;
  showAddExcerpt: boolean;
  setShowAddExcerpt: (v: boolean) => void;
} {
  const [activeMultiBufferId, setActiveMultiBufferId] = useState<string | null>(null);
  const [showAddExcerpt, setShowAddExcerpt] = useState(false);

  useEffect(() => {
    function onActivate(e: Event): void {
      setActiveMultiBufferId((e as CustomEvent<{ id: string }>).detail.id);
    }
    function onDeactivate(): void {
      setActiveMultiBufferId(null);
      setShowAddExcerpt(false);
    }
    window.addEventListener('agent-ide:activate-multi-buffer', onActivate);
    window.addEventListener('agent-ide:deactivate-multi-buffer', onDeactivate);
    return () => {
      window.removeEventListener('agent-ide:activate-multi-buffer', onActivate);
      window.removeEventListener('agent-ide:deactivate-multi-buffer', onDeactivate);
    };
  }, []);

  return { activeMultiBufferId, setActiveMultiBufferId, showAddExcerpt, setShowAddExcerpt };
}

// ── Normal file view ──────────────────────────────────────────

function FileContentView({
  activeFile,
  projectRoot,
  onReload,
  onSave,
  onDirtyChange,
}: {
  activeFile: ReturnType<typeof useFileViewerManager>['activeFile'];
  projectRoot: string | null;
  onReload: () => Promise<void>;
  onSave: (content: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          flexShrink: 0, height: '28px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex', alignItems: 'center',
        }}
      >
        <Breadcrumb filePath={activeFile?.path ?? null} projectRoot={projectRoot} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <FileViewer
          filePath={activeFile?.path ?? null}
          content={activeFile?.content ?? null}
          isLoading={activeFile?.isLoading ?? false}
          error={activeFile?.error ?? null}
          isDirtyOnDisk={activeFile?.isDirtyOnDisk ?? false}
          onReload={onReload}
          originalContent={activeFile?.originalContent ?? null}
          projectRoot={projectRoot}
          isImage={activeFile?.isImage ?? false}
          onSave={onSave}
          onDirtyChange={onDirtyChange}
          isDirty={activeFile?.isDirty ?? false}
        />
      </div>
    </div>
  );
}

// ── Main EditorContent component ──────────────────────────────

export function EditorContent(): React.ReactElement {
  const { activeFile, openFile, saveFile, setDirty } = useFileViewerManager();
  const { multiBuffers, addExcerpt, removeExcerpt } = useMultiBufferManager();
  const { projectRoot } = useProject();
  const { toast } = useToastContext();
  const { activeMultiBufferId, setActiveMultiBufferId, showAddExcerpt, setShowAddExcerpt } = useMultiBufferEvents();

  // If the active multi-buffer was closed, fall back
  const activeMB = activeMultiBufferId
    ? multiBuffers.find((mb) => mb.id === activeMultiBufferId) ?? null
    : null;

  useEffect(() => {
    if (activeMultiBufferId && !activeMB) setActiveMultiBufferId(null);
  }, [activeMultiBufferId, activeMB, setActiveMultiBufferId]);

  const handleReload = useCallback(async (): Promise<void> => {
    if (!activeFile) return;
    await openFile(activeFile.path);
    const name = activeFile.path.replace(/\\/g, '/').split('/').pop() ?? activeFile.path;
    toast(`Reloaded ${name} from disk`, 'info');
  }, [activeFile, openFile, toast]);

  const handleSave = useCallback(async (content: string): Promise<void> => {
    if (!activeFile) return;
    await saveFile(activeFile.path, content);
    const name = activeFile.path.replace(/\\/g, '/').split('/').pop() ?? activeFile.path;
    toast(`Saved ${name}`, 'info');
  }, [activeFile, saveFile, toast]);

  const handleDirtyChange = useCallback((dirty: boolean): void => {
    if (!activeFile) return;
    setDirty(activeFile.path, dirty);
  }, [activeFile, setDirty]);

  const handleOpenFileFromExcerpt = useCallback((filePath: string) => {
    setActiveMultiBufferId(null);
    void openFile(filePath);
  }, [openFile, setActiveMultiBufferId]);

  const handleRemoveExcerpt = useCallback((index: number) => {
    if (!activeMultiBufferId) return;
    removeExcerpt(activeMultiBufferId, index);
  }, [activeMultiBufferId, removeExcerpt]);

  const handleAddExcerpt = useCallback((excerpt: BufferExcerpt) => {
    if (!activeMultiBufferId) return;
    addExcerpt(activeMultiBufferId, excerpt);
    setShowAddExcerpt(false);
  }, [activeMultiBufferId, addExcerpt, setShowAddExcerpt]);

  if (activeMB) {
    return (
      <MultiBufferContentView
        activeMB={activeMB}
        showAddExcerpt={showAddExcerpt}
        setShowAddExcerpt={setShowAddExcerpt}
        onAddExcerpt={handleAddExcerpt}
        onRemoveExcerpt={handleRemoveExcerpt}
        onOpenFile={handleOpenFileFromExcerpt}
      />
    );
  }

  return (
    <FileContentView
      activeFile={activeFile}
      projectRoot={projectRoot}
      onReload={handleReload}
      onSave={handleSave}
      onDirtyChange={handleDirtyChange}
    />
  );
}
