/**
 * AgentChatDiffReviewParts.tsx — Sub-components for AgentChatDiffReview.
 * Extracted to keep AgentChatDiffReview.tsx under the 300-line limit.
 */
import React from 'react';

/* ---------- ParsedDiffLine ---------- */

export interface ParsedDiffLine {
  type: 'header' | 'hunk' | 'add' | 'del' | 'context';
  text: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export function parseUnifiedDiff(patch: string): ParsedDiffLine[] {
  const lines: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const raw of patch.split('\n')) {
    if (
      raw.startsWith('diff --git') ||
      raw.startsWith('index ') ||
      raw.startsWith('---') ||
      raw.startsWith('+++')
    ) {
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
    else if (raw.startsWith('-'))
      lines.push({ type: 'del', text: raw.slice(1), oldLineNo: oldLine++ });
    else if (raw.startsWith(' '))
      lines.push({
        type: 'context',
        text: raw.slice(1),
        oldLineNo: oldLine++,
        newLineNo: newLine++,
      });
  }
  return lines;
}

/* ---------- Icons ---------- */

export function ChevronIcon({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      className={`h-3 w-3 shrink-0 transition-transform duration-150 text-text-semantic-muted ${expanded ? 'rotate-90' : ''}`}
      viewBox="0 0 16 16"
      fill="none"
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

/* ---------- DiffBadge ---------- */

export function DiffBadge({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}): React.ReactElement {
  return (
    <span className="flex items-center gap-1 text-[10px]">
      {additions > 0 && <span className="text-status-success">+{additions}</span>}
      {deletions > 0 && <span className="text-status-error">-{deletions}</span>}
    </span>
  );
}

/* ---------- renderDiffLine ---------- */

function renderChangeDiffLine(line: ParsedDiffLine, i: number): React.ReactElement {
  const bg =
    line.type === 'add'
      ? 'var(--diff-add-bg, rgba(46, 160, 67, 0.15))'
      : 'var(--diff-del-bg, rgba(248, 81, 73, 0.15))';
  const color = line.type === 'add' ? 'var(--diff-add, #2ea043)' : 'var(--diff-del, #f85149)';
  const prefix = line.type === 'add' ? '+' : '-';
  return (
    <tr key={i} style={{ backgroundColor: bg }}>
      <td
        className="select-none px-1 text-right text-text-semantic-muted"
        style={{ minWidth: '2.5em', opacity: 0.5, userSelect: 'none' }}
      >
        {line.oldLineNo ?? ''}
      </td>
      <td
        className="select-none px-1 text-right text-text-semantic-muted"
        style={{
          minWidth: '2.5em',
          opacity: 0.5,
          userSelect: 'none',
          borderRight: '1px solid var(--border-default)',
        }}
      >
        {line.newLineNo ?? ''}
      </td>
      <td className="select-text whitespace-pre px-2" style={{ color }}>
        {prefix}
        {line.text}
      </td>
    </tr>
  );
}

export function renderDiffLine(line: ParsedDiffLine, i: number): React.ReactElement {
  if (line.type === 'header')
    return (
      <tr key={i}>
        <td
          colSpan={3}
          className="select-text bg-surface-raised px-2 py-0.5 font-semibold text-text-semantic-muted"
        >
          {line.text}
        </td>
      </tr>
    );
  if (line.type === 'hunk')
    return (
      <tr key={i}>
        <td
          colSpan={3}
          className="select-text px-2 py-0.5 text-interactive-accent"
          style={{ backgroundColor: 'var(--interactive-accent-subtle)' }}
        >
          {line.text}
        </td>
      </tr>
    );
  return renderChangeDiffLine(line, i);
}

/* ---------- InlineDiffView ---------- */

export function InlineDiffView({ diff }: { diff: string }): React.ReactElement {
  const lines = parseUnifiedDiff(diff);
  return (
    <div
      className="overflow-auto rounded border border-border-semantic bg-surface-base"
      style={{
        maxHeight: '300px',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        lineHeight: '1.5',
      }}
    >
      <table className="w-full border-collapse">
        <tbody>{lines.map(renderDiffLine)}</tbody>
      </table>
    </div>
  );
}
