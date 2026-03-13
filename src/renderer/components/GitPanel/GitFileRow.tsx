/**
 * GitFileRow.tsx - Individual file row in the Git panel staged/unstaged lists.
 *
 * Shows status badge, file path, and action buttons (stage/unstage, discard).
 */

import React, { memo, useCallback, useState } from 'react';

export interface GitFileRowProps {
  filePath: string;
  status: string;
  /** Whether this file is in the staged section (true) or unstaged section (false) */
  isStaged: boolean;
  onToggle: (filePath: string) => void;
  onDiscard?: (filePath: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  M: 'var(--warning, #e3b341)',
  A: 'var(--success, #3fb950)',
  D: 'var(--error, #f85149)',
  R: 'var(--info, #58a6ff)',
  '?': 'var(--text-muted)',
};

function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? 'var(--text-muted)';
}

interface PathDisplayParts {
  dirPath: string;
  fileName: string;
}

function splitFilePath(filePath: string): PathDisplayParts {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const lastSeparatorIndex = normalizedPath.lastIndexOf('/');

  if (lastSeparatorIndex === -1) {
    return { dirPath: '', fileName: normalizedPath };
  }

  return {
    dirPath: normalizedPath.slice(0, lastSeparatorIndex),
    fileName: normalizedPath.slice(lastSeparatorIndex + 1),
  };
}

function useDiscardConfirmation(filePath: string, onDiscard?: (filePath: string) => void): {
  confirmDiscard: boolean;
  handleDiscard: () => void;
} {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const handleDiscard = useCallback(() => {
    if (confirmDiscard) {
      setConfirmDiscard(false);
      onDiscard?.(filePath);
      return;
    }

    setConfirmDiscard(true);
    setTimeout(() => setConfirmDiscard(false), 3000);
  }, [confirmDiscard, filePath, onDiscard]);

  return { confirmDiscard, handleDiscard };
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  return (
    <span
      className="flex-shrink-0 w-4 text-center text-xs font-bold"
      style={{ color: statusColor(status), fontFamily: 'var(--font-mono, monospace)' }}
    >
      {status}
    </span>
  );
}

function FilePathLabel({ filePath }: { filePath: string }): React.ReactElement {
  const { dirPath, fileName } = splitFilePath(filePath);

  return (
    <span
      className="flex-1 min-w-0 truncate text-xs"
      style={{ color: 'var(--text)', fontFamily: 'var(--font-mono, monospace)' }}
      title={filePath}
    >
      {dirPath ? <span style={{ color: 'var(--text-muted)' }}>{dirPath}/</span> : null}
      {fileName}
    </span>
  );
}

function ToggleIcon({ isStaged }: { isStaged: boolean }): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {isStaged ? <path d="M4 8h8" /> : <><path d="M8 4v8" /><path d="M4 8h8" /></>}
    </svg>
  );
}

interface ToggleButtonProps {
  filePath: string;
  isStaged: boolean;
  onToggle: (filePath: string) => void;
}

function ToggleButton({ filePath, isStaged, onToggle }: ToggleButtonProps): React.ReactElement {
  return (
    <button
      onClick={() => onToggle(filePath)}
      title={isStaged ? `Unstage ${filePath}` : `Stage ${filePath}`}
      className="rounded p-0.5 text-[var(--text-muted)] transition-colors duration-75 hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
    >
      <ToggleIcon isStaged={isStaged} />
    </button>
  );
}

function DiscardIcon({ confirmDiscard }: { confirmDiscard: boolean }): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {confirmDiscard ? (
        <><path d="M8 2l6.5 11H1.5L8 2z" /><path d="M8 6.5v3" /><circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" /></>
      ) : (
        <><path d="M3 4h10" /><path d="M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1" /><path d="M4.5 4l.5 9a1 1 0 001 1h4a1 1 0 001-1l.5-9" /></>
      )}
    </svg>
  );
}

interface DiscardButtonProps {
  confirmDiscard: boolean;
  filePath: string;
  onDiscard: () => void;
}

function DiscardButton({
  confirmDiscard,
  filePath,
  onDiscard,
}: DiscardButtonProps): React.ReactElement {
  const title = confirmDiscard
    ? 'Click again to confirm discard'
    : `Discard changes to ${filePath}`;
  const className = confirmDiscard
    ? 'rounded p-0.5 transition-colors duration-75'
    : 'rounded p-0.5 text-[var(--text-muted)] transition-colors duration-75 hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]';

  return (
    <button onClick={onDiscard} title={title} className={className} style={confirmDiscard ? { color: 'var(--error, #f85149)' } : undefined}>
      <DiscardIcon confirmDiscard={confirmDiscard} />
    </button>
  );
}

export const GitFileRow = memo(function GitFileRow({
  filePath,
  status,
  isStaged,
  onToggle,
  onDiscard,
}: GitFileRowProps): React.ReactElement {
  const { confirmDiscard, handleDiscard } = useDiscardConfirmation(filePath, onDiscard);

  return (
    <div
      className="group flex items-center gap-1.5 px-2 py-0.5 transition-colors duration-75 hover:bg-[var(--bg-tertiary)]"
      style={{ minHeight: '24px' }}
    >
      <StatusBadge status={status} />
      <FilePathLabel filePath={filePath} />
      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 transition-opacity duration-75 group-hover:opacity-100">
        <ToggleButton filePath={filePath} isStaged={isStaged} onToggle={onToggle} />
        {!isStaged && onDiscard ? (
          <DiscardButton confirmDiscard={confirmDiscard} filePath={filePath} onDiscard={handleDiscard} />
        ) : null}
      </div>
    </div>
  );
});
