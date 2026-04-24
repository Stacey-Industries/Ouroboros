/**
 * DiffBlockRendererParts.tsx — Line-level row components for DiffBlockRenderer.
 * Extracted to keep DiffBlockRenderer.tsx under the 300-line ESLint limit.
 */
import React, { useState } from 'react';

import { parseUnifiedDiff } from './AgentChatDiffReviewParts';

/* ---------- Context collapsing ---------- */

const COLLAPSE_THRESHOLD = 8;

export function ContextCollapser({ count, onExpand }: { count: number; onExpand: () => void }): React.ReactElement {
  return (
    <tr>
      <td colSpan={3}>
        <button onClick={onExpand} className="w-full py-0.5 text-left text-[10px] text-interactive-accent hover:opacity-80" style={{ paddingLeft: '0.5rem', backgroundColor: 'var(--surface-inset)' }}>
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

export function ContextRow({ ci, l }: { ci: number; l: DiffLine }): React.ReactElement {
  return (
    <tr key={ci} className="bg-surface-base">
      <td className={TD_NUM} style={{ minWidth: '2.5em' }}>{l.oldLineNo ?? ''}</td>
      <td className={TD_NUM} style={TD_NUM_BORDER}>{l.newLineNo ?? ''}</td>
      <td className="select-text whitespace-pre px-2 text-[11px] text-text-semantic-muted"> {l.text}</td>
    </tr>
  );
}

export function DiffRow({ lineIdx, line }: { lineIdx: number; line: DiffLine }): React.ReactElement {
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

type FlushContextArgs = {
  contextRun: number[];
  lines: DiffLine[];
  expandedRanges: Set<number>;
  onExpand: (key: number) => void;
};

function flushContextRun(
  { contextRun, lines, expandedRanges, onExpand }: FlushContextArgs,
  flush: boolean,
): React.ReactElement[] {
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

function buildHunkHeaderRow(lineIdx: number, text: string): React.ReactElement {
  return (
    <tr key={`hunk-${lineIdx}`}>
      <td colSpan={3} className="select-text px-2 py-0.5 text-[10px] text-text-semantic-muted" style={{ backgroundColor: 'var(--interactive-accent-subtle)' }}>
        {text}
      </td>
    </tr>
  );
}

function buildHunkRows(lines: DiffLine[], expandedRanges: Set<number>, onExpand: (k: number) => void): React.ReactElement[] {
  const rows: React.ReactElement[] = [];
  let contextRun: number[] = [];
  let lineIdx = 0;
  const flush = (force: boolean): void => {
    if (contextRun.length > 0) rows.push(...flushContextRun({ contextRun, lines, expandedRanges, onExpand }, force));
    contextRun = [];
  };
  for (const line of lines) {
    if (line.type === 'header') { lineIdx++; continue; }
    if (line.type === 'hunk') { flush(false); rows.push(buildHunkHeaderRow(lineIdx, line.text)); lineIdx++; continue; }
    if (line.type === 'context') { contextRun.push(lineIdx); }
    else { flush(false); rows.push(<DiffRow key={lineIdx} lineIdx={lineIdx} line={line} />); }
    lineIdx++;
  }
  flush(true);
  return rows;
}

export function HunkLines({ hunkRaw }: { hunkRaw: string }): React.ReactElement {
  const [expandedRanges, setExpandedRanges] = useState<Set<number>>(new Set());
  const lines = parseUnifiedDiff(hunkRaw);
  const onExpand = (key: number): void => setExpandedRanges((prev) => new Set([...prev, key]));
  return <>{buildHunkRows(lines, expandedRanges, onExpand)}</>;
}
