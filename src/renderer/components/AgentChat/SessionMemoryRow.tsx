import React, { memo, useCallback, useState } from 'react';

import type { SessionMemoryEntry } from '../../types/electron';

const TYPE_COLORS: Record<string, string> = {
  decision: 'var(--accent-blue, #58a6ff)',
  pattern: 'var(--accent-purple, #bc8cff)',
  fact: 'var(--accent-green, var(--status-success))',
  preference: 'var(--accent-orange, var(--status-warning))',
  error_resolution: 'var(--accent-red, var(--status-error))',
};

function formatRelativeTime(timestamp: string): string {
  const delta = Math.max(0, Date.now() - new Date(timestamp).getTime());
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function TypeBadge({ type }: { type: string }): React.ReactElement<any> {
  const color = TYPE_COLORS[type] ?? 'var(--text-muted)';
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {type.replace('_', ' ')}
    </span>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }): React.ReactElement<any> {
  const percent = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-1.5" title={`Confidence: ${percent}%`}>
      <div className="h-1 rounded-full bg-border-semantic" style={{ width: 40 }}>
        <div
          className="h-full rounded-full bg-interactive-accent"
          style={{ width: `${percent}%`, transition: 'width 200ms ease' }}
        />
      </div>
      <span className="text-[9px] text-text-semantic-faint">{percent}%</span>
    </div>
  );
}

function EditMemoryIcon(): React.ReactElement<any> {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
    </svg>
  );
}

function DeleteMemoryIcon(): React.ReactElement<any> {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  );
}

function MemoryActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}): React.ReactElement<any> {
  return (
    <>
      <button
        onClick={onEdit}
        className="text-text-semantic-muted transition-colors duration-75 hover:text-interactive-accent"
        title="Edit memory"
        style={{ padding: '0 2px' }}
      >
        <EditMemoryIcon />
      </button>
      <button
        onClick={onDelete}
        className="text-text-semantic-muted transition-colors duration-75 hover:text-status-error"
        title="Delete memory"
        style={{ padding: '0 2px' }}
      >
        <DeleteMemoryIcon />
      </button>
    </>
  );
}

export interface SessionMemoryRowProps {
  entry: SessionMemoryEntry;
  onUpdate: (
    id: string,
    updates: { content?: string; type?: string; relevantFiles?: string[] },
  ) => void;
  onDelete: (id: string) => void;
}

interface MemoryEditFormProps {
  editContent: string;
  editFiles: string;
  onContentChange: (v: string) => void;
  onFilesChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

function MemoryEditActions({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: () => void;
}): React.ReactElement<any> {
  return (
    <div className="flex justify-end gap-1.5">
      <button
        onClick={onCancel}
        className="rounded border border-border-semantic px-2 py-0.5 text-[11px] text-text-semantic-muted transition-colors duration-75 hover:bg-surface-raised"
      >
        Cancel
      </button>
      <button
        onClick={onSave}
        className="rounded bg-interactive-accent px-2 py-0.5 text-[11px] text-white transition-opacity duration-75 hover:opacity-90"
      >
        Save
      </button>
    </div>
  );
}

function MemoryEditForm(props: MemoryEditFormProps): React.ReactElement<any> {
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <textarea
        value={props.editContent}
        onChange={(e) => props.onContentChange(e.target.value)}
        className="w-full resize-y rounded border border-border-semantic bg-surface-raised px-2 py-1.5 text-xs text-text-semantic-primary"
        style={{ fontFamily: 'var(--font-mono)', minHeight: 60 }}
        autoFocus
      />
      <input
        value={props.editFiles}
        onChange={(e) => props.onFilesChange(e.target.value)}
        placeholder="Relevant files (comma-separated)"
        className="w-full rounded border border-border-semantic bg-surface-raised px-2 py-1 text-[11px] text-text-semantic-primary"
        style={{ fontFamily: 'var(--font-mono)' }}
      />
      <MemoryEditActions onCancel={props.onCancel} onSave={props.onSave} />
    </div>
  );
}

function MemoryViewContent({ entry }: { entry: SessionMemoryEntry }): React.ReactElement<any> {
  return (
    <>
      <div className="text-text-semantic-primary" style={{ wordBreak: 'break-word' }}>
        {entry.content}
      </div>
      {entry.relevantFiles.length > 0 && (
        <div
          className="mt-1 truncate text-[10px] text-text-semantic-faint"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {entry.relevantFiles.join(', ')}
        </div>
      )}
    </>
  );
}

function useMemoryRowState(entry: SessionMemoryEntry, onUpdate: SessionMemoryRowProps['onUpdate']) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(entry.content);
  const [editFiles, setEditFiles] = useState(entry.relevantFiles.join(', '));
  const resetEditState = useCallback(() => {
    setEditContent(entry.content);
    setEditFiles(entry.relevantFiles.join(', '));
    setEditing(false);
  }, [entry.content, entry.relevantFiles]);
  const saveEdit = useCallback(() => {
    const relevantFiles = editFiles
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    onUpdate(entry.id, { content: editContent, relevantFiles });
    setEditing(false);
  }, [editContent, editFiles, entry.id, onUpdate]);
  return {
    editing,
    setEditing,
    editContent,
    setEditContent,
    editFiles,
    setEditFiles,
    resetEditState,
    saveEdit,
  };
}

const ROW_STYLE: React.CSSProperties = {
  borderColor: 'color-mix(in srgb, var(--border-default) 40%, transparent)',
  fontSize: 12,
  lineHeight: 1.4,
  fontFamily: 'var(--font-ui)',
};

type RowState = ReturnType<typeof useMemoryRowState>;

function MemoryRowHeader({
  entry,
  editing,
  setEditing,
  onDelete,
}: {
  entry: SessionMemoryEntry;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onDelete: (id: string) => void;
}): React.ReactElement<any> {
  return (
    <div className="mb-1 flex items-center gap-2">
      <TypeBadge type={entry.type} />
      <ConfidenceBar confidence={entry.confidence} />
      <span className="flex-1" />
      <span className="whitespace-nowrap text-[10px] text-text-semantic-faint">
        {formatRelativeTime(entry.timestamp)}
      </span>
      {!editing && (
        <MemoryActions onEdit={() => setEditing(true)} onDelete={() => onDelete(entry.id)} />
      )}
    </div>
  );
}

function MemoryRowBody(props: {
  entry: SessionMemoryRowProps;
  state: RowState;
}): React.ReactElement<any> {
  const { entry, onDelete } = props.entry;
  const {
    editing,
    setEditing,
    editContent,
    editFiles,
    setEditContent,
    setEditFiles,
    resetEditState,
    saveEdit,
  } = props.state;
  return (
    <div className="border-b px-3 py-2.5 text-text-semantic-primary" style={ROW_STYLE}>
      <MemoryRowHeader
        entry={entry}
        editing={editing}
        setEditing={setEditing}
        onDelete={onDelete}
      />
      {editing ? (
        <MemoryEditForm
          editContent={editContent}
          editFiles={editFiles}
          onContentChange={setEditContent}
          onFilesChange={setEditFiles}
          onCancel={resetEditState}
          onSave={saveEdit}
        />
      ) : (
        <MemoryViewContent entry={entry} />
      )}
    </div>
  );
}

export const SessionMemoryRow = memo(function SessionMemoryRow(
  props: SessionMemoryRowProps,
): React.ReactElement<any> {
  const state = useMemoryRowState(props.entry, props.onUpdate);
  return <MemoryRowBody entry={props} state={state} />;
});
