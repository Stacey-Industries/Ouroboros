/**
 * ThreadCostTable — sortable per-thread token/cost breakdown table.
 *
 * Columns: Thread ID, Input Tokens, Output Tokens, Total Cost.
 * Click any column header to sort; click again to toggle direction.
 */

import React, { useMemo, useState } from 'react';

import type { ThreadCostRollupRecord } from '../../types/electron';
import { formatCost, formatTokenCount } from '../AgentMonitor/costCalculator';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'threadId' | 'inputTokens' | 'outputTokens' | 'totalUsd';
type SortDir = 'asc' | 'desc';

interface ColDef {
  key: SortKey;
  label: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS: ColDef[] = [
  { key: 'threadId', label: 'Thread' },
  { key: 'inputTokens', label: 'Input Tokens' },
  { key: 'outputTokens', label: 'Output Tokens' },
  { key: 'totalUsd', label: 'Cost' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortRows(
  rows: ThreadCostRollupRecord[],
  key: SortKey,
  dir: SortDir,
): ThreadCostRollupRecord[] {
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });
}

function formatCell(row: ThreadCostRollupRecord, key: SortKey): string {
  if (key === 'totalUsd') return formatCost(row.totalUsd);
  if (key === 'inputTokens') return formatTokenCount(row.inputTokens);
  if (key === 'outputTokens') return formatTokenCount(row.outputTokens);
  return row.threadId;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface HeaderCellProps {
  col: ColDef;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

function HeaderCell({ col, sortKey, sortDir, onSort }: HeaderCellProps): React.ReactElement {
  const isActive = col.key === sortKey;
  const indicator = isActive ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';
  return (
    <th
      role="columnheader"
      aria-label={col.label}
      onClick={() => onSort(col.key)}
      className="px-3 py-2 text-left text-xs font-medium text-text-semantic-muted uppercase tracking-wide cursor-pointer select-none hover:text-text-semantic-secondary"
    >
      {col.label}{indicator}
    </th>
  );
}

// ─── Table body ───────────────────────────────────────────────────────────────

interface TableBodyProps {
  rows: ThreadCostRollupRecord[];
}

function TableBody({ rows }: TableBodyProps): React.ReactElement {
  return (
    <tbody>
      {rows.map((row, i) => (
        <tr key={row.threadId} className={i % 2 === 0 ? 'bg-surface-base' : 'bg-surface-panel'}>
          {COLUMNS.map((col) => (
            <td key={col.key} className="px-3 py-2 text-text-semantic-secondary font-mono text-xs">
              {formatCell(row, col.key)}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ThreadCostTableProps {
  threads: ThreadCostRollupRecord[];
}

export function ThreadCostTable({ threads }: ThreadCostTableProps): React.ReactElement {
  const [sortKey, setSortKey] = useState<SortKey>('totalUsd');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey): void => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => sortRows(threads, sortKey, sortDir), [threads, sortKey, sortDir]);

  if (threads.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-text-semantic-muted text-sm">
        No threads found for the selected time range.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border-subtle">
      <table className="w-full text-sm">
        <thead className="bg-surface-inset">
          <tr>
            {COLUMNS.map((col) => (
              <HeaderCell key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            ))}
          </tr>
        </thead>
        <TableBody rows={sorted} />
      </table>
    </div>
  );
}
