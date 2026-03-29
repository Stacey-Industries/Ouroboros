import React, { memo } from 'react';

import { AgentCard } from './AgentCard';
import type { AgentSession } from './types';

interface ComparePanelProps {
  label: string;
  onDismiss: (id: string) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
  sessions: AgentSession[];
}

const ComparePanelEmptyState = memo(function ComparePanelEmptyState(): React.ReactElement<any> {
  return (
    <div
      className="flex flex-col items-center justify-center h-full px-4 py-8 text-center"
      style={{ minHeight: '120px' }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
        className="text-text-semantic-faint"
        style={{ marginBottom: '8px' }}
      >
        <rect x="1" y="3" width="6" height="10" rx="1" />
        <rect x="9" y="3" width="6" height="10" rx="1" />
      </svg>
      <span className="text-[11px] italic text-text-semantic-faint">
        Select a session to compare
      </span>
    </div>
  );
});

const SELECT_STYLE: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--surface-base)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: '4px',
  padding: '2px 6px',
  fontSize: '0.75rem',
  fontFamily: 'var(--font-mono)',
  cursor: 'pointer',
};

const ComparePanelHeader = memo(function ComparePanelHeader({
  label,
  onSelect,
  selectedId,
  sessions,
}: Omit<ComparePanelProps, 'onDismiss'>): React.ReactElement<any> {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 flex-shrink-0"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <span className="text-[11px] font-semibold shrink-0 text-interactive-accent">{label}</span>
      <select
        value={selectedId ?? ''}
        onChange={(event) => onSelect(event.target.value)}
        style={SELECT_STYLE}
        aria-label={`Select session for ${label}`}
      >
        <option value="">-- Select session --</option>
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {session.id.slice(0, 8)}... (
            {new Date(session.startedAt ?? Date.now()).toLocaleTimeString()})
          </option>
        ))}
      </select>
    </div>
  );
});

export const ComparePanel = memo(function ComparePanel({
  label,
  onDismiss,
  onSelect,
  selectedId,
  sessions,
}: ComparePanelProps): React.ReactElement<any> {
  const selectedSession = selectedId
    ? sessions.find((session) => session.id === selectedId)
    : undefined;

  return (
    <div className="flex flex-col min-h-0" style={{ flex: 1, overflow: 'hidden' }}>
      <ComparePanelHeader
        label={label}
        onSelect={onSelect}
        selectedId={selectedId}
        sessions={sessions}
      />
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {selectedSession ? (
          <AgentCard session={selectedSession} onDismiss={onDismiss} />
        ) : (
          <ComparePanelEmptyState />
        )}
      </div>
    </div>
  );
});
