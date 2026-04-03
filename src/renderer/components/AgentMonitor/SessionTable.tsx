/**
 * SessionTable.tsx — Table of session cost history entries.
 */

import React, { memo, useCallback, useState } from 'react';

import type { CostEntry } from '../../types/electron';
import { SessionTableRow } from './SessionTableRow';

interface SessionTableProps {
  entries: CostEntry[];
}

const TABLE_HEADER_COLS = [
  { label: 'Date', width: '52px' },
  { label: 'Task', flex: true },
  { label: 'Model', width: '55px', align: 'right' as const },
  { label: 'Tokens', width: '70px', align: 'right' as const },
  { label: 'Cost', width: '52px', align: 'right' as const },
];

export const SessionTable = memo(function SessionTable({
  entries,
}: SessionTableProps): React.ReactElement<unknown> {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (entries.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-[11px] italic text-text-semantic-faint">
        No cost entries recorded yet
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider mb-1.5 text-text-semantic-faint">
        Session History ({entries.length} entries)
      </div>
      <TableHeader />
      <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
        {entries.map((entry) => (
          <SessionTableRow
            key={entry.sessionId}
            entry={entry}
            isExpanded={expandedId === entry.sessionId}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  );
});

function TableHeader(): React.ReactElement<unknown> {
  return (
    <div
      className="flex items-center gap-2 py-1 text-[9px] font-medium uppercase tracking-wider text-text-semantic-faint"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      {TABLE_HEADER_COLS.map((col) => (
        <span
          key={col.label}
          style={{
            width: col.width,
            flexShrink: col.flex ? undefined : 0,
            flex: col.flex ? 1 : undefined,
            minWidth: col.flex ? 0 : undefined,
            textAlign: col.align,
          }}
        >
          {col.label}
        </span>
      ))}
    </div>
  );
}
