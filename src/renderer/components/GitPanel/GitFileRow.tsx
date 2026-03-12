/**
 * GitFileRow.tsx — Individual file row in the Git panel staged/unstaged lists.
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

/** Color for the status badge letter */
function statusColor(status: string): string {
  switch (status) {
    case 'M': return 'var(--warning, #e3b341)';
    case 'A': return 'var(--success, #3fb950)';
    case 'D': return 'var(--error, #f85149)';
    case 'R': return 'var(--info, #58a6ff)';
    case '?': return 'var(--text-muted)';
    default: return 'var(--text-muted)';
  }
}

export const GitFileRow = memo(function GitFileRow({
  filePath,
  status,
  isStaged,
  onToggle,
  onDiscard,
}: GitFileRowProps): React.ReactElement {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const handleToggle = useCallback(() => {
    onToggle(filePath);
  }, [filePath, onToggle]);

  const handleDiscard = useCallback(() => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      // Auto-dismiss after 3 seconds
      setTimeout(() => setConfirmDiscard(false), 3000);
      return;
    }
    setConfirmDiscard(false);
    onDiscard?.(filePath);
  }, [filePath, onDiscard, confirmDiscard]);

  // Get just the filename for display
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
  const dirPath = filePath.replace(/\\/g, '/').includes('/')
    ? filePath.replace(/\\/g, '/').slice(0, filePath.replace(/\\/g, '/').lastIndexOf('/'))
    : '';

  return (
    <div
      className="group flex items-center gap-1.5 px-2 py-0.5 hover:bg-[var(--bg-tertiary)] transition-colors duration-75"
      style={{ minHeight: '24px' }}
    >
      {/* Status badge */}
      <span
        className="flex-shrink-0 w-4 text-center text-xs font-bold"
        style={{ color: statusColor(status), fontFamily: 'var(--font-mono, monospace)' }}
      >
        {status}
      </span>

      {/* File path */}
      <span
        className="flex-1 min-w-0 truncate text-xs"
        style={{ color: 'var(--text)', fontFamily: 'var(--font-mono, monospace)' }}
        title={filePath}
      >
        {dirPath && (
          <span style={{ color: 'var(--text-muted)' }}>{dirPath}/</span>
        )}
        {fileName}
      </span>

      {/* Action buttons — visible on hover */}
      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-75">
        {/* Stage/Unstage toggle */}
        <button
          onClick={handleToggle}
          title={isStaged ? `Unstage ${filePath}` : `Stage ${filePath}`}
          className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors duration-75"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {isStaged ? (
              // Minus icon (unstage)
              <path d="M4 8h8" />
            ) : (
              // Plus icon (stage)
              <>
                <path d="M8 4v8" />
                <path d="M4 8h8" />
              </>
            )}
          </svg>
        </button>

        {/* Discard button — only for unstaged files */}
        {!isStaged && onDiscard && (
          <button
            onClick={handleDiscard}
            title={confirmDiscard ? 'Click again to confirm discard' : `Discard changes to ${filePath}`}
            className="p-0.5 rounded transition-colors duration-75"
            style={{
              color: confirmDiscard ? 'var(--error, #f85149)' : 'var(--text-muted)',
            }}
            onMouseEnter={(e) => {
              if (!confirmDiscard) e.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={(e) => {
              if (!confirmDiscard) e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {confirmDiscard ? (
                // Warning icon
                <>
                  <path d="M8 2l6.5 11H1.5L8 2z" />
                  <path d="M8 6.5v3" />
                  <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
                </>
              ) : (
                // Trash icon
                <>
                  <path d="M3 4h10" />
                  <path d="M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1" />
                  <path d="M4.5 4l.5 9a1 1 0 001 1h4a1 1 0 001-1l.5-9" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});
