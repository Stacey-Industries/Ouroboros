import React, { useCallback, useState } from 'react';

import { ChevronIcon, DiffBadge, InlineDiffView } from './AgentChatDiffReviewParts';

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  diff: string;
}

export interface AgentChatDiffReviewProps {
  files: DiffFile[];
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
  onAcceptFile?: (path: string) => void;
  onRejectFile?: (path: string) => void;
}

type FileStatus = 'pending' | 'accepted' | 'rejected';

function StatusBadge({ status }: { status: FileStatus }): React.ReactElement {
  if (status === 'pending')
    return (
      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-surface-base text-text-semantic-muted">
        Pending
      </span>
    );
  if (status === 'accepted')
    return (
      <span
        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
        style={{ backgroundColor: 'rgba(63, 185, 80, 0.15)', color: 'var(--status-success)' }}
      >
        Accepted
      </span>
    );
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: 'rgba(248, 81, 73, 0.15)', color: 'var(--status-error)' }}
    >
      Rejected
    </span>
  );
}

function shortenPath(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/');
  return parts.length <= 3 ? parts.join('/') : `.../${parts.slice(-3).join('/')}`;
}

function FileRowExpanded({
  file,
  status,
  onAccept,
  onReject,
}: {
  file: DiffFile;
  status: FileStatus;
  onAccept: () => void;
  onReject: () => void;
}): React.ReactElement {
  return (
    <div className="border-t border-border-semantic px-2.5 py-2">
      {file.diff ? (
        <InlineDiffView diff={file.diff} />
      ) : (
        <div
          className="text-[11px] text-text-semantic-muted"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          No diff content available.
        </div>
      )}
      {status === 'pending' && (
        <div className="mt-2 flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAccept();
            }}
            className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'rgba(63, 185, 80, 0.15)',
              color: 'var(--status-success)',
              border: '1px solid rgba(63, 185, 80, 0.3)',
            }}
          >
            Accept
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReject();
            }}
            className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'rgba(248, 81, 73, 0.15)',
              color: 'var(--status-error)',
              border: '1px solid rgba(248, 81, 73, 0.3)',
            }}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function FileRow({
  file,
  status,
  onAccept,
  onReject,
}: {
  file: DiffFile;
  status: FileStatus;
  onAccept: () => void;
  onReject: () => void;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-md border border-border-semantic bg-surface-raised">
      <button
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors duration-100 hover:opacity-80"
      >
        <ChevronIcon expanded={expanded} />
        <span
          className="truncate font-medium text-text-semantic-primary"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
        >
          {shortenPath(file.path)}
        </span>
        <DiffBadge additions={file.additions} deletions={file.deletions} />
        <span className="flex-1" />
        <StatusBadge status={status} />
      </button>
      {expanded && (
        <FileRowExpanded file={file} status={status} onAccept={onAccept} onReject={onReject} />
      )}
    </div>
  );
}

function DiffReviewHeader({ files }: { files: DiffFile[] }): React.ReactElement {
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
  return (
    <div className="flex items-center justify-between border-b border-border-semantic px-3 py-2">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 text-interactive-accent" viewBox="0 0 16 16" fill="none">
          <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-xs font-medium text-text-semantic-primary">Review Changes</span>
        <span className="text-[10px] text-text-semantic-muted">
          {files.length} file{files.length === 1 ? '' : 's'}
        </span>
        <DiffBadge additions={totalAdditions} deletions={totalDeletions} />
      </div>
    </div>
  );
}

function DiffReviewFooter({
  pendingCount,
  onAcceptAll,
  onRejectAll,
}: {
  pendingCount: number;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}): React.ReactElement | null {
  if (pendingCount === 0) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border-semantic px-3 py-2">
      <button
        onClick={onAcceptAll}
        className="rounded px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-80"
        style={{
          backgroundColor: 'rgba(63, 185, 80, 0.15)',
          color: 'var(--status-success)',
          border: '1px solid rgba(63, 185, 80, 0.3)',
        }}
      >
        Accept All
      </button>
      <button
        onClick={onRejectAll}
        className="rounded px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-80"
        style={{
          backgroundColor: 'rgba(248, 81, 73, 0.15)',
          color: 'var(--status-error)',
          border: '1px solid rgba(248, 81, 73, 0.3)',
        }}
      >
        Reject All
      </button>
    </div>
  );
}

export function AgentChatDiffReview({
  files,
  onAcceptAll,
  onRejectAll,
  onAcceptFile,
  onRejectFile,
}: AgentChatDiffReviewProps): React.ReactElement {
  const [fileStatuses, setFileStatuses] = useState<Record<string, FileStatus>>(() =>
    Object.fromEntries(files.map((f) => [f.path, 'pending' as FileStatus])),
  );
  const setStatus = useCallback(
    (path: string, status: FileStatus, handler?: (path: string) => void) => {
      setFileStatuses((prev) => ({ ...prev, [path]: status }));
      handler?.(path);
    },
    [],
  );
  const handleAcceptAll = useCallback(() => {
    setFileStatuses(Object.fromEntries(files.map((f) => [f.path, 'accepted' as FileStatus])));
    onAcceptAll?.();
  }, [files, onAcceptAll]);
  const handleRejectAll = useCallback(() => {
    setFileStatuses(Object.fromEntries(files.map((f) => [f.path, 'rejected' as FileStatus])));
    onRejectAll?.();
  }, [files, onRejectAll]);
  const pendingCount = Object.values(fileStatuses).filter((s) => s === 'pending').length;
  return (
    <div className="my-2 rounded-lg border border-border-semantic bg-surface-panel">
      <DiffReviewHeader files={files} />
      <div className="space-y-1 p-2">
        {files.map((file) => (
          <FileRow
            key={file.path}
            file={file}
            status={fileStatuses[file.path] ?? 'pending'}
            onAccept={() => setStatus(file.path, 'accepted', onAcceptFile)}
            onReject={() => setStatus(file.path, 'rejected', onRejectFile)}
          />
        ))}
      </div>
      <DiffReviewFooter
        pendingCount={pendingCount}
        onAcceptAll={handleAcceptAll}
        onRejectAll={handleRejectAll}
      />
    </div>
  );
}
