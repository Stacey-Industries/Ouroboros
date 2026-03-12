/**
 * FileListSidebar.tsx — Sidebar showing changed files in the diff review.
 *
 * Each file shows its status badge (M/A/D/R), relative path, and hunk
 * decision progress. Click to select and scroll to that file in the main panel.
 */

import React, { memo } from 'react';
import type { ReviewFile } from './types';

interface FileListSidebarProps {
  files: ReviewFile[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onAcceptAll: (index: number) => void;
  onRejectAll: (index: number) => void;
}

function statusBadge(status: ReviewFile['status']): { label: string; color: string } {
  switch (status) {
    case 'added': return { label: 'A', color: 'var(--success, #4CAF50)' };
    case 'deleted': return { label: 'D', color: 'var(--error, #f85149)' };
    case 'renamed': return { label: 'R', color: 'var(--accent, #58a6ff)' };
    default: return { label: 'M', color: 'var(--warning, #d29922)' };
  }
}

function hunkProgress(file: ReviewFile): { decided: number; total: number } {
  const total = file.hunks.length;
  const decided = file.hunks.filter(h => h.decision !== 'pending').length;
  return { decided, total };
}

export const FileListSidebar = memo(function FileListSidebar({
  files,
  selectedIndex,
  onSelect,
  onAcceptAll,
  onRejectAll,
}: FileListSidebarProps): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'auto',
        borderRight: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        minWidth: '200px',
        maxWidth: '280px',
      }}
    >
      <div
        style={{
          padding: '6px 8px',
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          borderBottom: '1px solid var(--border)',
          userSelect: 'none',
        }}
      >
        Changed Files ({files.length})
      </div>

      {files.map((file, idx) => {
        const badge = statusBadge(file.status);
        const progress = hunkProgress(file);
        const isSelected = idx === selectedIndex;
        const allDecided = progress.decided === progress.total;

        return (
          <div
            key={file.filePath}
            onClick={() => onSelect(idx)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              padding: '6px 8px',
              cursor: 'pointer',
              backgroundColor: isSelected ? 'rgba(88, 166, 255, 0.1)' : 'transparent',
              borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
              borderBottom: '1px solid var(--border-muted)',
              transition: 'background-color 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
            }}
            onMouseLeave={(e) => {
              if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {/* File name row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Status badge */}
              <span
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '16px',
                  height: '16px',
                  borderRadius: '3px',
                  fontSize: '0.625rem',
                  fontWeight: 700,
                  color: badge.color,
                  border: `1px solid ${badge.color}`,
                }}
              >
                {badge.label}
              </span>

              {/* File path */}
              <span
                style={{
                  flex: 1,
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  direction: 'rtl',
                  textAlign: 'left',
                }}
                title={file.relativePath}
              >
                {file.relativePath}
              </span>

              {/* Progress badge */}
              <span
                style={{
                  flexShrink: 0,
                  fontSize: '0.625rem',
                  color: allDecided ? 'var(--success, #4CAF50)' : 'var(--text-faint)',
                  fontWeight: 500,
                }}
              >
                {progress.decided}/{progress.total}
              </span>
            </div>

            {/* Quick action buttons */}
            {isSelected && !allDecided && (
              <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); onAcceptAll(idx); }}
                  style={{
                    padding: '1px 6px',
                    fontSize: '0.5625rem',
                    fontFamily: 'var(--font-ui)',
                    border: '1px solid var(--success, #4CAF50)',
                    borderRadius: '3px',
                    background: 'transparent',
                    color: 'var(--success, #4CAF50)',
                    cursor: 'pointer',
                  }}
                >
                  Accept All
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onRejectAll(idx); }}
                  style={{
                    padding: '1px 6px',
                    fontSize: '0.5625rem',
                    fontFamily: 'var(--font-ui)',
                    border: '1px solid var(--error, #f85149)',
                    borderRadius: '3px',
                    background: 'transparent',
                    color: 'var(--error, #f85149)',
                    cursor: 'pointer',
                  }}
                >
                  Reject All
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
