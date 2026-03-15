import React, { useState, useCallback } from 'react';

/* ---------- Types ---------- */

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

/* ---------- Diff line parsing ---------- */

interface ParsedDiffLine {
  type: 'header' | 'hunk' | 'add' | 'del' | 'context';
  text: string;
  oldLineNo?: number;
  newLineNo?: number;
}

function parseUnifiedDiff(patch: string): ParsedDiffLine[] {
  const rawLines = patch.split('\n');
  const result: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of rawLines) {
    if (
      raw.startsWith('diff --git') ||
      raw.startsWith('index ') ||
      raw.startsWith('---') ||
      raw.startsWith('+++')
    ) {
      result.push({ type: 'header', text: raw });
      continue;
    }

    const hunkMatch = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      result.push({ type: 'hunk', text: raw });
      continue;
    }

    if (raw.startsWith('+')) {
      result.push({ type: 'add', text: raw.slice(1), newLineNo: newLine });
      newLine++;
    } else if (raw.startsWith('-')) {
      result.push({ type: 'del', text: raw.slice(1), oldLineNo: oldLine });
      oldLine++;
    } else if (raw.startsWith(' ')) {
      result.push({ type: 'context', text: raw.slice(1), oldLineNo: oldLine, newLineNo: newLine });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

/* ---------- Sub-components ---------- */

function ChevronIcon({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      className={`h-3 w-3 shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
      viewBox="0 0 16 16"
      fill="none"
      style={{ color: 'var(--text-muted)' }}
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DiffBadge({ additions, deletions }: { additions: number; deletions: number }): React.ReactElement {
  return (
    <span className="flex items-center gap-1 text-[10px]">
      {additions > 0 && (
        <span style={{ color: 'var(--diff-add, #2ea043)' }}>+{additions}</span>
      )}
      {deletions > 0 && (
        <span style={{ color: 'var(--diff-del, #f85149)' }}>-{deletions}</span>
      )}
    </span>
  );
}

function StatusBadge({ status }: { status: FileStatus }): React.ReactElement {
  const styles: Record<FileStatus, { bg: string; color: string; label: string }> = {
    pending: { bg: 'var(--bg)', color: 'var(--text-muted)', label: 'Pending' },
    accepted: { bg: 'rgba(63, 185, 80, 0.15)', color: '#3fb950', label: 'Accepted' },
    rejected: { bg: 'rgba(248, 81, 73, 0.15)', color: '#f85149', label: 'Rejected' },
  };
  const s = styles[status];

  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function InlineDiffView({ diff }: { diff: string }): React.ReactElement {
  const lines = parseUnifiedDiff(diff);

  return (
    <div
      className="overflow-auto rounded border"
      style={{
        maxHeight: '300px',
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg)',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        lineHeight: '1.5',
      }}
    >
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => {
            if (line.type === 'header') {
              return (
                <tr key={i}>
                  <td
                    colSpan={3}
                    className="select-text px-2 py-0.5"
                    style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-tertiary)', fontWeight: 600 }}
                  >
                    {line.text}
                  </td>
                </tr>
              );
            }

            if (line.type === 'hunk') {
              return (
                <tr key={i}>
                  <td
                    colSpan={3}
                    className="select-text px-2 py-0.5"
                    style={{ color: 'var(--accent)', backgroundColor: 'rgba(100, 100, 255, 0.06)' }}
                  >
                    {line.text}
                  </td>
                </tr>
              );
            }

            const bgColor =
              line.type === 'add'
                ? 'var(--diff-add-bg, rgba(46, 160, 67, 0.15))'
                : line.type === 'del'
                  ? 'var(--diff-del-bg, rgba(248, 81, 73, 0.15))'
                  : 'transparent';

            const textColor =
              line.type === 'add'
                ? 'var(--diff-add, #2ea043)'
                : line.type === 'del'
                  ? 'var(--diff-del, #f85149)'
                  : 'var(--text)';

            const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';

            return (
              <tr key={i} style={{ backgroundColor: bgColor }}>
                <td
                  className="select-none px-1 text-right"
                  style={{ color: 'var(--text-muted)', minWidth: '2.5em', opacity: 0.5, userSelect: 'none' }}
                >
                  {line.oldLineNo ?? ''}
                </td>
                <td
                  className="select-none px-1 text-right"
                  style={{
                    color: 'var(--text-muted)',
                    minWidth: '2.5em',
                    opacity: 0.5,
                    userSelect: 'none',
                    borderRight: '1px solid var(--border)',
                  }}
                >
                  {line.newLineNo ?? ''}
                </td>
                <td className="select-text whitespace-pre px-2" style={{ color: textColor }}>
                  {prefix}{line.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

  const shortPath = useCallback((fullPath: string): string => {
    const parts = fullPath.replace(/\\/g, '/').split('/');
    if (parts.length <= 3) return parts.join('/');
    return '.../' + parts.slice(-3).join('/');
  }, []);

  return (
    <div
      className="rounded-md border"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-tertiary)' }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors duration-100 hover:opacity-80"
      >
        <ChevronIcon expanded={expanded} />
        <span className="truncate font-medium" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
          {shortPath(file.path)}
        </span>
        <DiffBadge additions={file.additions} deletions={file.deletions} />
        <span className="flex-1" />
        <StatusBadge status={status} />
      </button>

      {expanded && (
        <div className="border-t px-2.5 py-2" style={{ borderColor: 'var(--border)' }}>
          {file.diff ? (
            <InlineDiffView diff={file.diff} />
          ) : (
            <div className="text-[11px] text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
              No diff content available.
            </div>
          )}

          {status === 'pending' && (
            <div className="mt-2 flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); onAccept(); }}
                className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
                style={{
                  backgroundColor: 'rgba(63, 185, 80, 0.15)',
                  color: '#3fb950',
                  border: '1px solid rgba(63, 185, 80, 0.3)',
                }}
              >
                Accept
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onReject(); }}
                className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
                style={{
                  backgroundColor: 'rgba(248, 81, 73, 0.15)',
                  color: '#f85149',
                  border: '1px solid rgba(248, 81, 73, 0.3)',
                }}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Main component ---------- */

/**
 * Review panel for agent-produced file changes.
 *
 * Shows a list of changed files with per-file diffs, per-file
 * accept/reject, and bulk accept-all/reject-all actions.
 */
export function AgentChatDiffReview({
  files,
  onAcceptAll,
  onRejectAll,
  onAcceptFile,
  onRejectFile,
}: AgentChatDiffReviewProps): React.ReactElement {
  const [fileStatuses, setFileStatuses] = useState<Record<string, FileStatus>>(() => {
    const init: Record<string, FileStatus> = {};
    for (const f of files) {
      init[f.path] = 'pending';
    }
    return init;
  });

  const handleAcceptFile = useCallback(
    (path: string) => {
      setFileStatuses((prev) => ({ ...prev, [path]: 'accepted' }));
      onAcceptFile?.(path);
    },
    [onAcceptFile],
  );

  const handleRejectFile = useCallback(
    (path: string) => {
      setFileStatuses((prev) => ({ ...prev, [path]: 'rejected' }));
      onRejectFile?.(path);
    },
    [onRejectFile],
  );

  const handleAcceptAll = useCallback(() => {
    const next: Record<string, FileStatus> = {};
    for (const f of files) {
      next[f.path] = 'accepted';
    }
    setFileStatuses(next);
    onAcceptAll?.();
  }, [files, onAcceptAll]);

  const handleRejectAll = useCallback(() => {
    const next: Record<string, FileStatus> = {};
    for (const f of files) {
      next[f.path] = 'rejected';
    }
    setFileStatuses(next);
    onRejectAll?.();
  }, [files, onRejectAll]);

  const pendingCount = Object.values(fileStatuses).filter((s) => s === 'pending').length;
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div
      className="my-2 rounded-lg border"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="none"
            style={{ color: 'var(--accent)' }}
          >
            <path
              d="M8 1v14M1 8h14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
            Review Changes
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {files.length} file{files.length === 1 ? '' : 's'}
          </span>
          <DiffBadge additions={totalAdditions} deletions={totalDeletions} />
        </div>
      </div>

      {/* File list */}
      <div className="space-y-1 p-2">
        {files.map((file) => (
          <FileRow
            key={file.path}
            file={file}
            status={fileStatuses[file.path] ?? 'pending'}
            onAccept={() => handleAcceptFile(file.path)}
            onReject={() => handleRejectFile(file.path)}
          />
        ))}
      </div>

      {/* Footer with bulk actions */}
      {pendingCount > 0 && (
        <div
          className="flex items-center justify-end gap-2 border-t px-3 py-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            onClick={handleAcceptAll}
            className="rounded px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'rgba(63, 185, 80, 0.15)',
              color: '#3fb950',
              border: '1px solid rgba(63, 185, 80, 0.3)',
            }}
          >
            Accept All
          </button>
          <button
            onClick={handleRejectAll}
            className="rounded px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'rgba(248, 81, 73, 0.15)',
              color: '#f85149',
              border: '1px solid rgba(248, 81, 73, 0.3)',
            }}
          >
            Reject All
          </button>
        </div>
      )}
    </div>
  );
}
