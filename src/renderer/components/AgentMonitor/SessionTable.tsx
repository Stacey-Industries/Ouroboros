/**
 * SessionTable.tsx — Table of session cost history entries.
 *
 * Phase C: when subagentUxEnabled=true, fetches cost rollups per session ID
 * and passes combined costs to each row for disclosure rendering.
 */

import log from 'electron-log/renderer';
import React, { memo, useCallback, useEffect, useState } from 'react';

import type { CostEntry, SubagentCostRollup } from '../../types/electron';
import { SessionTableRow } from './SessionTableRow';
import type { CombinedCost } from './subagentCostAggregator';
import { combineCosts } from './subagentCostAggregator';

interface SessionTableProps {
  entries: CostEntry[];
  /** When true, fetches subagent rollups and shows combined costs. */
  subagentUxEnabled?: boolean;
}

const TABLE_HEADER_COLS = [
  { label: 'Date', width: '52px' },
  { label: 'Task', flex: true },
  { label: 'Model', width: '55px', align: 'right' as const },
  { label: 'Tokens', width: '70px', align: 'right' as const },
  { label: 'Cost', width: '52px', align: 'right' as const },
];

function useSubagentRollupMap(
  entries: CostEntry[],
  enabled: boolean,
): Map<string, CombinedCost> {
  const [rollupMap, setRollupMap] = useState<Map<string, CombinedCost>>(new Map());

  useEffect(() => {
    if (!enabled || !window.electronAPI?.subagent) {
      setRollupMap(new Map());
      return;
    }
    const sessionIds = entries.map((e) => e.sessionId);
    if (sessionIds.length === 0) return;

    const api = window.electronAPI.subagent;
    Promise.allSettled(
      sessionIds.map((id) =>
        api.costRollup({ parentSessionId: id }).then((res): [string, SubagentCostRollup | null] => [
          id,
          res.success && res.rollup ? res.rollup : null,
        ]),
      ),
    ).then((results) => {
      const next = new Map<string, CombinedCost>();
      for (const [i, result] of results.entries()) {
        const sessionId = sessionIds[i];
        const parentUsd = entries[i]?.estimatedCost ?? 0;
        const rollup = result.status === 'fulfilled' ? result.value[1] : null;
        next.set(sessionId, combineCosts(parentUsd, rollup));
      }
      setRollupMap(next);
    }).catch((err) => {
      log.warn('[SessionTable] subagent rollup fetch failed:', err);
    });
  }, [entries, enabled]);

  return rollupMap;
}

export const SessionTable = memo(function SessionTable({
  entries,
  subagentUxEnabled,
}: SessionTableProps): React.ReactElement<unknown> {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rollupMap = useSubagentRollupMap(entries, subagentUxEnabled === true);

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
            combinedCost={subagentUxEnabled ? rollupMap.get(entry.sessionId) : undefined}
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
