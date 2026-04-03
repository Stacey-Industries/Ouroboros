/**
 * DiffBlockRenderer.tsx — Rich unified diff display with per-hunk accept/reject.
 * Replaces the bare <pre> stub in AgentChatBlockRenderer for 'diff' blocks.
 */
import React, { useState } from 'react';

import type { AgentChatContentBlock } from '../../types/electron';
import { DiffBadge, parseUnifiedDiff } from './AgentChatDiffReviewParts';
import type { DiffHunk, HunkStatus } from './useDiffBlock';
import { useDiffBlock } from './useDiffBlock';

/* ---------- Sub-components ---------- */

function HunkStatusBadge({ status }: { status: HunkStatus }): React.ReactElement {
  if (status === 'accepted')
    return (
      <span
        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
        style={{ backgroundColor: 'var(--diff-add-bg)', color: 'var(--status-success)' }}
      >
        Applied ✓
      </span>
    );
  if (status === 'rejected')
    return (
      <span
        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
        style={{ backgroundColor: 'var(--diff-del-bg)', color: 'var(--status-error)' }}
      >
        Rejected
      </span>
    );
  return <></>;
}

interface HunkActionsProps {
  onAccept: () => void;
  onReject: () => void;
}

function HunkActions({ onAccept, onReject }: HunkActionsProps): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-1 pl-2">
      <button
        onClick={onAccept}
        className="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
        style={{
          backgroundColor: 'var(--diff-add-bg)',
          color: 'var(--status-success)',
          border: '1px solid var(--diff-add-border)',
        }}
      >
        Accept
      </button>
      <button
        onClick={onReject}
        className="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
        style={{
          backgroundColor: 'var(--diff-del-bg)',
          color: 'var(--status-error)',
          border: '1px solid var(--diff-del-border)',
        }}
      >
        Reject
      </button>
    </div>
  );
}

/* ---------- Context collapsing ---------- */

const COLLAPSE_THRESHOLD = 8;

interface ContextCollapserProps {
  count: number;
  onExpand: () => void;
}

function ContextCollapser({ count, onExpand }: ContextCollapserProps): React.ReactElement {
  return (
    <tr>
      <td colSpan={3}>
        <button
          onClick={onExpand}
          className="w-full py-0.5 text-left text-[10px] text-interactive-accent hover:opacity-80"
          style={{ paddingLeft: '0.5rem', backgroundColor: 'var(--surface-inset)' }}
        >
          Show {count} unchanged lines
        </button>
      </td>
    </tr>
  );
}

/* ---------- Hunk line row helpers ---------- */

type DiffLine = ReturnType<typeof parseUnifiedDiff>[number];

const TD_NUM = 'select-none px-1 text-right text-[10px] text-text-semantic-muted opacity-50';
const TD_NUM_BORDER: React.CSSProperties = { minWidth: '2.5em', borderRight: '1px solid var(--border-default)' };

function ContextRow({ ci, l }: { ci: number; l: DiffLine }): React.ReactElement {
  return (
    <tr key={ci} className="bg-surface-base">
      <td className={TD_NUM} style={{ minWidth: '2.5em' }}>{l.oldLineNo ?? ''}</td>
      <td className={TD_NUM} style={TD_NUM_BORDER}>{l.newLineNo ?? ''}</td>
      <td className="select-text whitespace-pre px-2 text-[11px] text-text-semantic-muted"> {l.text}</td>
    </tr>
  );
}

function DiffRow({ lineIdx, line }: { lineIdx: number; line: DiffLine }): React.ReactElement {
  const isAdd = line.type === 'add';
  return (
    <tr key={lineIdx} style={{ backgroundColor: isAdd ? 'var(--diff-add-bg, rgba(46, 160, 67, 0.15))' : 'var(--diff-del-bg, rgba(248, 81, 73, 0.15))' }}>
      <td className={TD_NUM} style={{ minWidth: '2.5em' }}>{line.oldLineNo ?? ''}</td>
      <td className={TD_NUM} style={TD_NUM_BORDER}>{line.newLineNo ?? ''}</td>
      <td className="select-text whitespace-pre px-2 text-[11px]" style={{ color: isAdd ? 'var(--diff-add, #2ea043)' : 'var(--diff-del, #f85149)' }}>
        {isAdd ? '+' : '-'}{line.text}
      </td>
    </tr>
  );
}

/* ---------- Hunk lines renderer ---------- */

interface HunkLinesProps {
  hunkRaw: string;
}

type FlushContextArgs = {
  contextRun: number[];
  lines: DiffLine[];
  expandedRanges: Set<number>;
  onExpand: (key: number) => void;
};

function flushContextRun({ contextRun, lines, expandedRanges, onExpand }: FlushContextArgs, flush: boolean): React.ReactElement[] {
  const rows: React.ReactElement[] = [];
  const key = contextRun[0];
  const shouldExpand = contextRun.length < COLLAPSE_THRESHOLD || flush || expandedRanges.has(key);
  if (shouldExpand) {
    for (const ci of contextRun) rows.push(<ContextRow key={ci} ci={ci} l={lines[ci]} />);
  } else {
    rows.push(<ContextCollapser key={`collapse-${key}`} count={contextRun.length} onExpand={() => onExpand(key)} />);
  }
  return rows;
}

function HunkLines({ hunkRaw }: HunkLinesProps): React.ReactElement {
  const [expandedRanges, setExpandedRanges] = useState<Set<number>>(new Set());
  const lines = parseUnifiedDiff(hunkRaw);
  const onExpand = (key: number): void => setExpandedRanges((prev) => new Set([...prev, key]));

  const rows: React.ReactElement[] = [];
  let contextRun: number[] = [];
  let lineIdx = 0;

  const flush = (force: boolean): void => {
    if (contextRun.length > 0) rows.push(...flushContextRun({ contextRun, lines, expandedRanges, onExpand }, force));
    contextRun = [];
  };

  for (const line of lines) {
    if (line.type === 'header') { lineIdx++; continue; }
    if (line.type === 'hunk') {
      flush(false);
      rows.push(<tr key={`hunk-${lineIdx}`}><td colSpan={3} className="select-text px-2 py-0.5 text-[10px] text-text-semantic-muted" style={{ backgroundColor: 'rgba(100, 100, 255, 0.06)' }}>{line.text}</td></tr>);
      lineIdx++; continue;
    }
    if (line.type === 'context') { contextRun.push(lineIdx); }
    else { flush(false); rows.push(<DiffRow key={lineIdx} lineIdx={lineIdx} line={line} />); }
    lineIdx++;
  }
  flush(true);

  return <>{rows}</>;
}

/* ---------- Single hunk row ---------- */

interface HunkRowProps {
  hunk: DiffHunk;
  index: number;
  status: HunkStatus;
  onAccept: () => void;
  onReject: () => void;
}

function HunkRow({ hunk, index, status, onAccept, onReject }: HunkRowProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const dimmed = status === 'rejected';

  return (
    <div
      className="group relative"
      style={{ opacity: dimmed ? 0.5 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <table className="w-full border-collapse" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: '1.5' }}>
            <tbody>
              <HunkLines hunkRaw={hunk.raw} />
            </tbody>
          </table>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <HunkStatusBadge status={status} />
          {hovered && status === 'pending' && (
            <HunkActions onAccept={onAccept} onReject={onReject} />
          )}
        </div>
      </div>
      {index > 0 && <div className="border-t border-border-semantic" />}
    </div>
  );
}

/* ---------- Header ---------- */

interface DiffHeaderProps {
  filePath: string;
  additions: number;
  deletions: number;
  pendingCount: number;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

function DiffHeader({ filePath, additions, deletions, pendingCount, onAcceptAll, onRejectAll }: DiffHeaderProps): React.ReactElement {
  const shortPath = filePath.replace(/\\/g, '/').split('/').slice(-3).join('/');
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-semantic px-3 py-2">
      <span className="truncate font-medium text-text-semantic-primary" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
        {shortPath}
      </span>
      <DiffBadge additions={additions} deletions={deletions} />
      <span className="flex-1" />
      {pendingCount > 0 && (
        <>
          <button onClick={onAcceptAll} className="rounded px-2 py-0.5 text-[10px] font-medium hover:opacity-80" style={{ backgroundColor: 'var(--diff-add-bg)', color: 'var(--status-success)', border: '1px solid var(--diff-add-border)' }}>
            Accept All
          </button>
          <button onClick={onRejectAll} className="rounded px-2 py-0.5 text-[10px] font-medium hover:opacity-80" style={{ backgroundColor: 'var(--diff-del-bg)', color: 'var(--status-error)', border: '1px solid var(--diff-del-border)' }}>
            Reject All
          </button>
        </>
      )}
    </div>
  );
}

/* ---------- Main export ---------- */

interface DiffBlockRendererProps {
  block: AgentChatContentBlock & { kind: 'diff' };
}

export function DiffBlockRenderer({ block }: DiffBlockRendererProps): React.ReactElement | null {
  const { hunks, hunkStatuses, additions, deletions, acceptHunk, rejectHunk, acceptAll, rejectAll, applyError } =
    useDiffBlock(block.hunks ?? '', block.filePath ?? '');

  if (!block.hunks) return null;

  const pendingCount = [...hunkStatuses.values()].filter((s) => s === 'pending').length;

  return (
    <div className="my-1.5 overflow-hidden rounded-md border border-border-semantic bg-surface-raised text-xs">
      <DiffHeader
        filePath={block.filePath}
        additions={additions}
        deletions={deletions}
        pendingCount={pendingCount}
        onAcceptAll={acceptAll}
        onRejectAll={rejectAll}
      />
      {applyError && (
        <div className="border-b border-border-semantic bg-status-error-subtle px-3 py-1.5 text-[11px] text-status-error">
          {applyError}
        </div>
      )}
      <div className="max-h-[500px] overflow-y-auto">
        {hunks.map((hunk, i) => (
          <HunkRow
            key={i}
            hunk={hunk}
            index={i}
            status={hunkStatuses.get(i) ?? 'pending'}
            onAccept={() => acceptHunk(i)}
            onReject={() => rejectHunk(i)}
          />
        ))}
        {hunks.length === 0 && (
          <pre className="whitespace-pre-wrap px-3 py-2 text-[11px] text-text-semantic-muted" style={{ fontFamily: 'var(--font-mono)' }}>
            {block.hunks}
          </pre>
        )}
      </div>
    </div>
  );
}
