/**
 * SessionMemoryRow.tsx — Individual memory entry row with inline editing.
 *
 * Displays type badge, content, relevant files, confidence bar, timestamp,
 * and edit/delete action buttons. Edit mode expands inline with textarea.
 */

import React, { memo, useState, useCallback } from 'react';
import type { SessionMemoryEntry } from '../../types/electron';

const TYPE_COLORS: Record<string, string> = {
  decision: 'var(--accent-blue, #58a6ff)',
  pattern: 'var(--accent-purple, #bc8cff)',
  fact: 'var(--accent-green, #3fb950)',
  preference: 'var(--accent-orange, #d29922)',
  error_resolution: 'var(--accent-red, #f85149)',
};

function formatRelativeTime(timestamp: string): string {
  const delta = Math.max(0, Date.now() - new Date(timestamp).getTime());
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function TypeBadge({ type }: { type: string }): React.ReactElement {
  const color = TYPE_COLORS[type] ?? 'var(--text-muted)';
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
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

function ConfidenceBar({ confidence }: { confidence: number }): React.ReactElement {
  const percent = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-1.5" title={`Confidence: ${percent}%`}>
      <div
        className="h-1 rounded-full bg-border-semantic"
        style={{ width: 40 }}
      >
        <div
          className="h-full rounded-full bg-interactive-accent"
          style={{ width: `${percent}%`, transition: 'width 200ms ease' }}
        />
      </div>
      <span className="text-[9px] text-text-semantic-faint">{percent}%</span>
    </div>
  );
}

export interface SessionMemoryRowProps {
  entry: SessionMemoryEntry;
  onUpdate: (id: string, updates: { content?: string; type?: string; relevantFiles?: string[] }) => void;
  onDelete: (id: string) => void;
}

export const SessionMemoryRow = memo(function SessionMemoryRow({
  entry,
  onUpdate,
  onDelete,
}: SessionMemoryRowProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(entry.content);
  const [editFiles, setEditFiles] = useState(entry.relevantFiles.join(', '));

  const handleSave = useCallback(() => {
    const files = editFiles.split(',').map((f) => f.trim()).filter(Boolean);
    onUpdate(entry.id, { content: editContent, relevantFiles: files });
    setEditing(false);
  }, [entry.id, editContent, editFiles, onUpdate]);

  const handleCancel = useCallback(() => {
    setEditContent(entry.content);
    setEditFiles(entry.relevantFiles.join(', '));
    setEditing(false);
  }, [entry.content, entry.relevantFiles]);

  return (
    <div
      className="px-3 py-2.5 border-b text-text-semantic-primary"
      style={{
        borderColor: 'color-mix(in srgb, var(--border) 40%, transparent)',
        fontSize: 12,
        lineHeight: 1.4,
        fontFamily: 'var(--font-ui)',
      }}
    >
      {/* Header row: badge + timestamp + actions */}
      <div className="flex items-center gap-2 mb-1">
        <TypeBadge type={entry.type} />
        <ConfidenceBar confidence={entry.confidence} />
        <span className="flex-1" />
        <span className="text-[10px] text-text-semantic-faint whitespace-nowrap">
          {formatRelativeTime(entry.timestamp)}
        </span>
        {!editing && (
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-text-semantic-muted hover:text-interactive-accent transition-colors duration-75"
              title="Edit memory"
              style={{ padding: '0 2px' }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
              </svg>
            </button>
            <button
              onClick={() => onDelete(entry.id)}
              className="text-text-semantic-muted hover:text-status-error transition-colors duration-75"
              title="Delete memory"
              style={{ padding: '0 2px' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Content — view or edit mode */}
      {editing ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-xs bg-surface-raised border border-border-semantic text-text-semantic-primary resize-y"
            style={{ fontFamily: 'var(--font-mono)', minHeight: 60 }}
            autoFocus
          />
          <input
            value={editFiles}
            onChange={(e) => setEditFiles(e.target.value)}
            placeholder="Relevant files (comma-separated)"
            className="w-full rounded px-2 py-1 text-[11px] bg-surface-raised border border-border-semantic text-text-semantic-primary"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <div className="flex gap-1.5 justify-end">
            <button
              onClick={handleCancel}
              className="px-2 py-0.5 text-[11px] rounded border border-border-semantic text-text-semantic-muted hover:bg-surface-raised transition-colors duration-75"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-2 py-0.5 text-[11px] rounded bg-interactive-accent text-white hover:opacity-90 transition-opacity duration-75"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-text-semantic-primary" style={{ wordBreak: 'break-word' }}>
            {entry.content}
          </div>
          {entry.relevantFiles.length > 0 && (
            <div className="mt-1 text-[10px] text-text-semantic-faint truncate" style={{ fontFamily: 'var(--font-mono)' }}>
              {entry.relevantFiles.join(', ')}
            </div>
          )}
        </>
      )}
    </div>
  );
});
