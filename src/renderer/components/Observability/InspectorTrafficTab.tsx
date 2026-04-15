/**
 * InspectorTrafficTab.tsx — CLI invocation list for the Orchestration Inspector.
 *
 * Loads orchestration traces for the active session and renders them in a
 * scrollable list. Columns: phase, timestamp (HH:mm:ss), duration_ms,
 * exit_code, stdin preview, stdout preview.
 */

import React, { useEffect, useState } from 'react';

import type { TraceRow } from '../../types/electron-telemetry';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function truncate(value: unknown, maxLen = 80): string {
  if (value === null || value === undefined) return '—';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > maxLen ? `${str.slice(0, maxLen - 1)}\u2026` : str;
}

function extractPayloadField(payload: unknown, field: string): unknown {
  if (payload !== null && typeof payload === 'object') {
    return (payload as Record<string, unknown>)[field];
  }
  return undefined;
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function TraceTableRow({ row }: { row: TraceRow }): React.ReactElement {
  const exitCode = extractPayloadField(row.payload, 'exit_code');
  const durationMs = extractPayloadField(row.payload, 'duration_ms');
  const stdin = extractPayloadField(row.payload, 'stdin');
  const stdout = extractPayloadField(row.payload, 'stdout');

  return (
    <tr className="border-b border-border-subtle text-xs hover:bg-surface-hover">
      <td className="px-2 py-1 font-mono text-text-semantic-secondary">{row.phase}</td>
      <td className="px-2 py-1 tabular-nums text-text-semantic-muted">
        {formatTimestamp(row.timestamp)}
      </td>
      <td className="px-2 py-1 tabular-nums text-text-semantic-muted">
        {durationMs !== undefined ? String(durationMs) : '—'}
      </td>
      <td className="px-2 py-1 tabular-nums text-text-semantic-muted">
        {exitCode !== undefined ? String(exitCode) : '—'}
      </td>
      <td className="max-w-[160px] truncate px-2 py-1 font-mono text-text-semantic-secondary">
        {truncate(stdin)}
      </td>
      <td className="max-w-[160px] truncate px-2 py-1 font-mono text-text-semantic-secondary">
        {truncate(stdout)}
      </td>
    </tr>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState(): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-text-semantic-muted">
      No orchestration traces yet. Start an agent session to see activity here.
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface InspectorTrafficTabProps {
  sessionId: string;
}

function useTraceQuery(sessionId: string): { traces: TraceRow[]; loading: boolean } {
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setTraces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    window.electronAPI.telemetry
      .queryTraces({ sessionId, limit: 200 })
      .then((result) => setTraces(result.traces ?? []))
      .catch((err: unknown) => {
        console.error('[InspectorTrafficTab] queryTraces error:', err);
        setTraces([]);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  return { traces, loading };
}

function TraceTable({ traces }: { traces: TraceRow[] }): React.ReactElement {
  return (
    <table className="w-full border-collapse text-left">
      <thead className="sticky top-0 bg-surface-panel text-xs text-text-semantic-muted">
        <tr>
          <th className="px-2 py-1 font-medium">Phase</th>
          <th className="px-2 py-1 font-medium">Time</th>
          <th className="px-2 py-1 font-medium">Duration (ms)</th>
          <th className="px-2 py-1 font-medium">Exit</th>
          <th className="px-2 py-1 font-medium">Stdin</th>
          <th className="px-2 py-1 font-medium">Stdout</th>
        </tr>
      </thead>
      <tbody>
        {traces.map((row) => (
          <TraceTableRow key={row.id} row={row} />
        ))}
      </tbody>
    </table>
  );
}

export function InspectorTrafficTab({ sessionId }: InspectorTrafficTabProps): React.ReactElement {
  const { traces, loading } = useTraceQuery(sessionId);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-semantic-muted">
        Loading…
      </div>
    );
  }

  if (traces.length === 0) return <EmptyState />;

  return (
    <div className="h-full overflow-y-auto">
      <TraceTable traces={traces} />
    </div>
  );
}
