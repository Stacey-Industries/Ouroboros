/**
 * TimelineSection — Shows git history for the active file.
 *
 * Uses the existing `git:log` IPC endpoint to fetch commits.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useFileViewerManager } from '../FileViewer';
import { useProject } from '../../contexts/ProjectContext';
import type { CommitEntry } from '../../types/electron-git';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return dateStr;

  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 30) return dateStr;
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'just now';
}

interface CommitItemProps {
  commit: CommitEntry;
}

function CommitItem({ commit }: CommitItemProps): React.ReactElement {
  const handlePointerEnter = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
  }, []);

  return (
    <div
      className="flex flex-col cursor-pointer select-none border-b border-border-semantic"
      style={{
        padding: '3px 8px',
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-ui)',
      }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      title={`${commit.hash}\n${commit.author}\n${commit.date}\n\n${commit.message}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="text-text-semantic-faint"
          style={{
            flexShrink: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
          }}
        >
          {commit.hash.slice(0, 7)}
        </span>
        <span
          className="text-text-semantic-muted"
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {commit.message}
        </span>
      </div>
      <div className="flex items-center gap-1.5" style={{ marginTop: '1px' }}>
        <span className="text-text-semantic-faint" style={{ fontSize: '0.6rem' }}>
          {commit.author}
        </span>
        <span
          className="text-text-semantic-faint"
          style={{
            marginLeft: 'auto',
            fontSize: '0.6rem',
          }}
        >
          {relativeTime(commit.date)}
        </span>
      </div>
    </div>
  );
}

function TimelineEmptyState({ message }: { message: string }): React.ReactElement {
  return (
    <div
      className="flex items-center justify-center text-text-semantic-muted"
      style={{
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-ui)',
        padding: '16px 12px',
        textAlign: 'center',
        lineHeight: '1.6',
      }}
    >
      {message}
    </div>
  );
}

export function TimelineSection(): React.ReactElement {
  const { activeFile } = useFileViewerManager();
  const { projectRoot } = useProject();
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasElectronAPI() || !projectRoot || !activeFile?.path) {
      setCommits([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void window.electronAPI.git.log(projectRoot, activeFile.path).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.success && result.commits) {
        setCommits(result.commits);
      } else {
        setCommits([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectRoot, activeFile?.path]);

  if (!activeFile) {
    return <TimelineEmptyState message="Open a file to see its timeline" />;
  }

  if (loading) {
    return <TimelineEmptyState message="Loading..." />;
  }

  if (commits.length === 0) {
    return <TimelineEmptyState message="No git history found" />;
  }

  return (
    <div className="flex flex-col">
      {commits.map((commit) => (
        <CommitItem key={commit.hash} commit={commit} />
      ))}
    </div>
  );
}
