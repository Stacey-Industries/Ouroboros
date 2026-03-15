import React from 'react';
import type { PinnedFile } from './useAgentChatContext';

export interface AgentChatContextBarProps {
  pinnedFiles: PinnedFile[];
  onRemoveFile: (path: string) => void;
  contextSummary: string | null;
}

function PinnedFileChip(props: { file: PinnedFile; onRemove: () => void }): React.ReactElement {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-tight"
      style={{
        backgroundColor: 'var(--bg)',
        borderColor: 'var(--border)',
        color: 'var(--text)',
      }}
      title={props.file.relativePath}
    >
      <span className="max-w-[120px] truncate">{props.file.name}</span>
      <button
        onClick={props.onRemove}
        className="ml-0.5 rounded-sm opacity-60 transition-opacity duration-75 hover:opacity-100"
        style={{ color: 'var(--text-muted)' }}
        aria-label={`Remove ${props.file.name}`}
      >
        &times;
      </button>
    </span>
  );
}

export function AgentChatContextBar({
  pinnedFiles,
  onRemoveFile,
  contextSummary,
}: AgentChatContextBarProps): React.ReactElement | null {
  if (pinnedFiles.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1 pt-1.5">
      {pinnedFiles.map((file) => (
        <PinnedFileChip
          key={file.path}
          file={file}
          onRemove={() => onRemoveFile(file.path)}
        />
      ))}
      {contextSummary && (
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">
          {contextSummary}
        </span>
      )}
    </div>
  );
}
