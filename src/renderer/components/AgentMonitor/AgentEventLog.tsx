/**
 * AgentEventLog.tsx - Full detailed event log for an agent session.
 *
 * Shows raw event data in a scrollable monospace display with:
 * - Timestamp + event type + payload
 * - Filter by event type
 * - Copy log to clipboard button
 *
 * All content rendered as text - no dangerouslySetInnerHTML.
 */

import log from 'electron-log/renderer';
import React, { memo, useCallback, useState } from 'react';

import type { ToolCallEvent } from './types';

type FilterType = 'all' | 'pending' | 'success' | 'error';

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'success', label: 'Done' },
  { value: 'error', label: 'Error' },
];

const STATUS_COLORS: Record<ToolCallEvent['status'], string> = {
  pending: 'var(--text-faint)',
  success: 'var(--status-success)',
  error: 'var(--status-error)',
};

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

function filterToolCalls(toolCalls: ToolCallEvent[], filter: FilterType): ToolCallEvent[] {
  return filter === 'all' ? toolCalls : toolCalls.filter((call) => call.status === filter);
}

function useCopyLog(
  toolCalls: ToolCallEvent[],
  sessionId: string,
): {
  copied: boolean;
  handleCopy: () => void;
} {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const header = `Session: ${sessionId}\n${'\u2500'.repeat(60)}\n`;
    const lines = toolCalls.map(eventToLogLine).join('\n');
    navigator.clipboard
      .writeText(header + lines)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch((error) => {
        log.error('Failed to copy event log to clipboard:', error);
      });
  }, [toolCalls, sessionId]);

  return { copied, handleCopy };
}

interface FilterBarProps {
  active: FilterType;
  onChange: (filter: FilterType) => void;
}

const FilterBar = memo(function FilterBar({
  active,
  onChange,
}: FilterBarProps): React.ReactElement<unknown> {
  return (
    <div className="flex items-center gap-1">
      {FILTER_OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
          style={{
            background: active === option.value ? 'var(--surface-raised)' : 'transparent',
            color: active === option.value ? 'var(--text-primary)' : 'var(--text-faint)',
            border: `1px solid ${active === option.value ? 'var(--border-default)' : 'transparent'}`,
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
});

interface LogToolbarProps {
  active: FilterType;
  copied: boolean;
  onChange: (filter: FilterType) => void;
  onCopy: () => void;
}

const LogToolbar = memo(function LogToolbar({
  active,
  copied,
  onChange,
  onCopy,
}: LogToolbarProps): React.ReactElement<unknown> {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-between px-3 py-1.5"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <FilterBar active={active} onChange={onChange} />
      <button
        onClick={onCopy}
        className="btn-ghost px-2 py-0.5 text-[10px]"
        title="Copy log to clipboard"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
});

interface LogLineProps {
  call: ToolCallEvent;
}

const LogLine = memo(function LogLine({ call }: LogLineProps): React.ReactElement<unknown> {
  const durationText =
    call.duration !== undefined ? (
      <span style={{ color: 'var(--text-faint)' }}> [{call.duration}ms]</span>
    ) : null;

  return (
    <div className="flex items-baseline gap-2 px-3 py-0.5 leading-snug hover:bg-surface-raised">
      <span
        className="shrink-0 text-[10px] tabular-nums"
        style={{ color: 'var(--text-faint)', minWidth: '84px' }}
      >
        {formatTimestamp(call.timestamp)}
      </span>
      <span
        className="shrink-0 text-[10px] font-bold uppercase"
        style={{ color: STATUS_COLORS[call.status], minWidth: '52px' }}
      >
        {call.status}
      </span>
      <span
        className="shrink-0 text-[10px] font-medium"
        style={{ color: 'var(--text-muted)', minWidth: '72px' }}
      >
        {call.toolName}
      </span>
      <span className="selectable break-all text-[10px] text-text-semantic-primary">
        {call.input}
        {durationText}
      </span>
    </div>
  );
});

interface LogEntriesProps {
  calls: ToolCallEvent[];
}

const LogEntries = memo(function LogEntries({ calls }: LogEntriesProps): React.ReactElement<unknown> {
  if (calls.length === 0) {
    return (
      <p className="px-3 py-3 text-[10px] italic text-[var(--text-faint)]">
        No entries match this filter.
      </p>
    );
  }

  return (
    <>
      {calls.map((call) => (
        <LogLine key={call.id} call={call} />
      ))}
    </>
  );
});

export interface AgentEventLogProps {
  toolCalls: ToolCallEvent[];
  sessionId: string;
}

export const AgentEventLog = memo(function AgentEventLog({
  toolCalls,
  sessionId,
}: AgentEventLogProps): React.ReactElement<unknown> {
  const [filter, setFilter] = useState<FilterType>('all');
  const { copied, handleCopy } = useCopyLog(toolCalls, sessionId);
  const filteredCalls = filterToolCalls(toolCalls, filter);

  return (
    <div className="flex flex-col" style={{ height: '320px' }}>
      <LogToolbar active={filter} copied={copied} onChange={setFilter} onCopy={handleCopy} />
      <div
        className="flex-1 min-h-0 overflow-x-auto overflow-y-auto py-1"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <LogEntries calls={filteredCalls} />
      </div>
    </div>
  );
});
