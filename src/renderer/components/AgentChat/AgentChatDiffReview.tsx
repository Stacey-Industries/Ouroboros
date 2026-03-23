import React, { useCallback, useState } from 'react';

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

interface ParsedDiffLine {
  type: 'header' | 'hunk' | 'add' | 'del' | 'context';
  text: string;
  oldLineNo?: number;
  newLineNo?: number;
}

function parseUnifiedDiff(patch: string): ParsedDiffLine[] {
  const lines: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('diff --git') || raw.startsWith('index ') || raw.startsWith('---') || raw.startsWith('+++')) {
      lines.push({ type: 'header', text: raw });
      continue;
    }
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      lines.push({ type: 'hunk', text: raw });
      continue;
    }
    if (raw.startsWith('+')) lines.push({ type: 'add', text: raw.slice(1), newLineNo: newLine++ });
    else if (raw.startsWith('-')) lines.push({ type: 'del', text: raw.slice(1), oldLineNo: oldLine++ });
    else if (raw.startsWith(' ')) lines.push({ type: 'context', text: raw.slice(1), oldLineNo: oldLine++, newLineNo: newLine++ });
  }
  return lines;
}

function ChevronIcon({ expanded }: { expanded: boolean }): React.ReactElement {
  return <svg className={`h-3 w-3 shrink-0 transition-transform duration-150 text-text-semantic-muted ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function DiffBadge({ additions, deletions }: { additions: number; deletions: number }): React.ReactElement {
  return <span className="flex items-center gap-1 text-[10px]">{additions > 0 && <span className="text-status-success">+{additions}</span>}{deletions > 0 && <span className="text-status-error">-{deletions}</span>}</span>;
}

function StatusBadge({ status }: { status: FileStatus }): React.ReactElement {
  if (status === 'pending') return <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-surface-base text-text-semantic-muted">Pending</span>;
  if (status === 'accepted') return <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'rgba(63, 185, 80, 0.15)', color: '#3fb950' }}>Accepted</span>;
  return <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'rgba(248, 81, 73, 0.15)', color: '#f85149' }}>Rejected</span>;
}

function renderDiffLine(line: ParsedDiffLine, i: number): React.ReactElement {
  if (line.type === 'header') return <tr key={i}><td colSpan={3} className="select-text bg-surface-raised px-2 py-0.5 font-semibold text-text-semantic-muted">{line.text}</td></tr>;
  if (line.type === 'hunk') return <tr key={i}><td colSpan={3} className="select-text px-2 py-0.5 text-interactive-accent" style={{ backgroundColor: 'rgba(100, 100, 255, 0.06)' }}>{line.text}</td></tr>;
  const bg = line.type === 'add' ? 'var(--diff-add-bg, rgba(46, 160, 67, 0.15))' : 'var(--diff-del-bg, rgba(248, 81, 73, 0.15))';
  const color = line.type === 'add' ? 'var(--diff-add, #2ea043)' : 'var(--diff-del, #f85149)';
  const prefix = line.type === 'add' ? '+' : '-';
  return <tr key={i} style={{ backgroundColor: bg }}><td className="select-none px-1 text-right text-text-semantic-muted" style={{ minWidth: '2.5em', opacity: 0.5, userSelect: 'none' }}>{line.oldLineNo ?? ''}</td><td className="select-none px-1 text-right text-text-semantic-muted" style={{ minWidth: '2.5em', opacity: 0.5, userSelect: 'none', borderRight: '1px solid var(--border)' }}>{line.newLineNo ?? ''}</td><td className="select-text whitespace-pre px-2" style={{ color }}>{prefix}{line.text}</td></tr>;
}

function InlineDiffView({ diff }: { diff: string }): React.ReactElement {
  const lines = parseUnifiedDiff(diff);
  return <div className="overflow-auto rounded border border-border-semantic bg-surface-base" style={{ maxHeight: '300px', fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: '1.5' }}><table className="w-full border-collapse"><tbody>{lines.map(renderDiffLine)}</tbody></table></div>;
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
  const shortPath = useCallback((fullPath: string) => {
    const parts = fullPath.replace(/\\/g, '/').split('/');
    return parts.length <= 3 ? parts.join('/') : `.../${parts.slice(-3).join('/')}`;
  }, []);
  return (
    <div className="rounded-md border border-border-semantic bg-surface-raised">
      <button onClick={() => setExpanded((value) => !value)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors duration-100 hover:opacity-80">
        <ChevronIcon expanded={expanded} />
        <span className="truncate font-medium text-text-semantic-primary" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{shortPath(file.path)}</span>
        <DiffBadge additions={file.additions} deletions={file.deletions} />
        <span className="flex-1" />
        <StatusBadge status={status} />
      </button>
      {expanded && <div className="border-t border-border-semantic px-2.5 py-2">{file.diff ? <InlineDiffView diff={file.diff} /> : <div className="text-[11px] text-text-semantic-muted" style={{ fontFamily: 'var(--font-mono)' }}>No diff content available.</div>}{status === 'pending' && <div className="mt-2 flex items-center gap-1.5"><button onClick={(e) => { e.stopPropagation(); onAccept(); }} className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80" style={{ backgroundColor: 'rgba(63, 185, 80, 0.15)', color: '#3fb950', border: '1px solid rgba(63, 185, 80, 0.3)' }}>Accept</button><button onClick={(e) => { e.stopPropagation(); onReject(); }} className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80" style={{ backgroundColor: 'rgba(248, 81, 73, 0.15)', color: '#f85149', border: '1px solid rgba(248, 81, 73, 0.3)' }}>Reject</button></div>}</div>}
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
  const [fileStatuses, setFileStatuses] = useState<Record<string, FileStatus>>(() => Object.fromEntries(files.map((file) => [file.path, 'pending' as FileStatus])));
  const setStatus = useCallback((path: string, status: FileStatus, handler?: (path: string) => void) => {
    setFileStatuses((prev) => ({ ...prev, [path]: status }));
    handler?.(path);
  }, []);
  const handleAcceptAll = useCallback(() => { setFileStatuses(Object.fromEntries(files.map((file) => [file.path, 'accepted' as FileStatus]))); onAcceptAll?.(); }, [files, onAcceptAll]);
  const handleRejectAll = useCallback(() => { setFileStatuses(Object.fromEntries(files.map((file) => [file.path, 'rejected' as FileStatus]))); onRejectAll?.(); }, [files, onRejectAll]);
  const pendingCount = Object.values(fileStatuses).filter((status) => status === 'pending').length;
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);
  return (
    <div className="my-2 rounded-lg border border-border-semantic bg-surface-panel">
      <div className="flex items-center justify-between border-b border-border-semantic px-3 py-2">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-interactive-accent" viewBox="0 0 16 16" fill="none"><path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <span className="text-xs font-medium text-text-semantic-primary">Review Changes</span>
          <span className="text-[10px] text-text-semantic-muted">{files.length} file{files.length === 1 ? '' : 's'}</span>
          <DiffBadge additions={totalAdditions} deletions={totalDeletions} />
        </div>
      </div>
      <div className="space-y-1 p-2">
        {files.map((file) => <FileRow key={file.path} file={file} status={fileStatuses[file.path] ?? 'pending'} onAccept={() => setStatus(file.path, 'accepted', onAcceptFile)} onReject={() => setStatus(file.path, 'rejected', onRejectFile)} />)}
      </div>
      {pendingCount > 0 && (
        <div className="flex items-center justify-end gap-2 border-t border-border-semantic px-3 py-2">
          <button onClick={handleAcceptAll} className="rounded px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-80" style={{ backgroundColor: 'rgba(63, 185, 80, 0.15)', color: '#3fb950', border: '1px solid rgba(63, 185, 80, 0.3)' }}>Accept All</button>
          <button onClick={handleRejectAll} className="rounded px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-80" style={{ backgroundColor: 'rgba(248, 81, 73, 0.15)', color: '#f85149', border: '1px solid rgba(248, 81, 73, 0.3)' }}>Reject All</button>
        </div>
      )}
    </div>
  );
}
