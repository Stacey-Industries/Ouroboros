/**
 * AgentEventLog.tsx — Full detailed event log for an agent session.
 *
 * Shows raw event data in a scrollable monospace display with:
 * - Timestamp + event type + payload
 * - Filter by event type
 * - Copy log to clipboard button
 *
 * All content rendered as text — no dangerouslySetInnerHTML.
 */

import React, { useState, useRef, useCallback, memo } from 'react';
import type { ToolCallEvent } from './types';

// ─── Filter options ───────────────────────────────────────────────────────────

type FilterType = 'all' | 'pending' | 'success' | 'error';

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'success', label: 'Done' },
  { value: 'error', label: 'Error' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  const ms3 = d.getMilliseconds().toString().padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms3}`;
}

function eventToLogLine(call: ToolCallEvent): string {
  const ts = formatTimestamp(call.timestamp);
  const dur = call.duration !== undefined ? ` [${call.duration}ms]` : '';
  return `${ts}  ${call.status.toUpperCase().padEnd(7)}  ${call.toolName.padEnd(12)}  ${call.input}${dur}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface FilterBarProps {
  active: FilterType;
  onChange: (f: FilterType) => void;
}

const FilterBar = memo(function FilterBar({ active, onChange }: FilterBarProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1">
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
          style={{
            background: active === opt.value
              ? 'var(--bg-tertiary)'
              : 'transparent',
            color: active === opt.value
              ? 'var(--text)'
              : 'var(--text-faint)',
            border: `1px solid ${active === opt.value ? 'var(--border)' : 'transparent'}`,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
});

interface LogLineProps {
  call: ToolCallEvent;
}

const LogLine = memo(function LogLine({ call }: LogLineProps): React.ReactElement {
  const statusColor: Record<string, string> = {
    pending: 'var(--text-faint)',
    success: 'var(--success)',
    error: 'var(--error)',
  };

  return (
    <div className="flex items-baseline gap-2 px-3 py-0.5 hover:bg-[var(--bg-tertiary)] leading-snug">
      {/* Timestamp */}
      <span
        className="shrink-0 text-[10px] tabular-nums"
        style={{ color: 'var(--text-faint)', minWidth: '84px' }}
      >
        {formatTimestamp(call.timestamp)}
      </span>

      {/* Status tag */}
      <span
        className="shrink-0 text-[10px] font-bold uppercase"
        style={{ color: statusColor[call.status] ?? 'var(--text-faint)', minWidth: '52px' }}
      >
        {call.status}
      </span>

      {/* Tool name */}
      <span
        className="shrink-0 text-[10px] font-medium"
        style={{ color: 'var(--text-muted)', minWidth: '72px' }}
      >
        {call.toolName}
      </span>

      {/* Input */}
      <span
        className="text-[10px] selectable break-all"
        style={{ color: 'var(--text)' }}
      >
        {call.input}
        {call.duration !== undefined && (
          <span style={{ color: 'var(--text-faint)' }}>
            {' '}[{call.duration}ms]
          </span>
        )}
      </span>
    </div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

export interface AgentEventLogProps {
  toolCalls: ToolCallEvent[];
  sessionId: string;
}

export const AgentEventLog = memo(function AgentEventLog({
  toolCalls,
  sessionId,
}: AgentEventLogProps): React.ReactElement {
  const [filter, setFilter] = useState<FilterType>('all');
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const filtered = filter === 'all'
    ? toolCalls
    : toolCalls.filter((c) => c.status === filter);

  const handleCopy = useCallback(() => {
    const header = `Session: ${sessionId}\n${'─'.repeat(60)}\n`;
    const lines = toolCalls.map(eventToLogLine).join('\n');
    navigator.clipboard.writeText(header + lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      // Clipboard API unavailable — silently ignore
    });
  }, [toolCalls, sessionId]);

  return (
    <div className="flex flex-col" style={{ height: '320px' }}>
      {/* Toolbar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: '1px solid var(--border-muted)' }}
      >
        <FilterBar active={filter} onChange={setFilter} />

        <button
          onClick={handleCopy}
          className="btn-ghost text-[10px] px-2 py-0.5"
          title="Copy log to clipboard"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Log lines */}
      <div
        ref={logRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-auto py-1"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-[10px] text-[var(--text-faint)] italic">
            No entries match this filter.
          </p>
        ) : (
          filtered.map((call) => <LogLine key={call.id} call={call} />)
        )}
      </div>
    </div>
  );
});
