import React, { memo, useCallback, useState } from 'react';

import type { AgentTemplate } from '../../types/electron';
import { EmptyState as SharedEmptyState } from '../shared';
import { AgentCard } from './AgentCard';
import type { AgentSession } from './types';

interface PreviousSessionsSectionProps {
  sessions: AgentSession[];
  onDismiss: (id: string) => void;
  onReplay?: (sessionId: string) => void;
  onReviewChanges?: (sessionId: string) => void;
  onUpdateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

interface ComparePanelProps {
  label: string;
  onDismiss: (id: string) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
  sessions: AgentSession[];
}

interface QuickActionBarProps {
  onExecuteTemplate: (template: AgentTemplate) => void;
  templates: AgentTemplate[];
}

interface MonitorToolbarProps {
  compareMode: boolean;
  costMode: boolean;
  filterQuery: string;
  hasAnySessions: boolean;
  multiSessionMode: 'off' | 'launcher' | 'monitor';
  onFilterChange: (value: string) => void;
  onToggleCompare: () => void;
  onToggleCost: () => void;
  onToggleMultiSession: () => void;
}

const EmptyState = memo(function EmptyState(): React.ReactElement {
  return (
    <SharedEmptyState
      icon="agent"
      title="No agent sessions detected"
      description="Agent sessions are tracked when Claude Code runs in a terminal below. Start a Claude Code session to see activity here."
    />
  );
});

const PreviousSessionsHeader = memo(function PreviousSessionsHeader({
  collapsed,
  count,
  onToggle,
}: {
  collapsed: boolean;
  count: number;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      className="w-full flex items-center gap-1.5 px-3 py-2 text-left transition-colors"
      style={{ background: 'transparent' }}
      onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--bg-tertiary)'; }}
      onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }}
      onClick={onToggle}
      aria-expanded={!collapsed}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="text-text-semantic-faint" style={{ transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 150ms ease', flexShrink: 0 }}>
        <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[11px] font-medium text-text-semantic-faint">Previous Sessions</span>
      <span className="text-[10px] ml-auto tabular-nums text-text-semantic-faint">{count}</span>
    </button>
  );
});

export const PreviousSessionsSection = memo(function PreviousSessionsSection({
  onDismiss,
  onReplay,
  onReviewChanges,
  onUpdateNotes,
  sessions,
}: PreviousSessionsSectionProps): React.ReactElement | null {
  const [collapsed, setCollapsed] = useState(true);
  const handleToggle = useCallback(() => setCollapsed((value) => !value), []);

  if (sessions.length === 0) return null;

  return (
    <div style={{ borderTop: '1px solid var(--border-muted)' }}>
      <PreviousSessionsHeader collapsed={collapsed} count={sessions.length} onToggle={handleToggle} />
      {collapsed ? null : (
        <div>
          {sessions.map((session) => <AgentCard key={session.id} session={session} onDismiss={onDismiss} onUpdateNotes={onUpdateNotes} onReviewChanges={onReviewChanges} onReplay={onReplay} />)}
        </div>
      )}
    </div>
  );
});

const ClearFilterButton = memo(function ClearFilterButton({
  onClear,
}: {
  onClear: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onClear}
      className="shrink-0 flex items-center justify-center rounded text-text-semantic-faint"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px' }}
      onMouseEnter={(event) => { event.currentTarget.style.color = 'var(--text)'; }}
      onMouseLeave={(event) => { event.currentTarget.style.color = 'var(--text-faint)'; }}
      title="Clear filter"
      aria-label="Clear filter"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
});

export const SearchInput = memo(function SearchInput({ onChange, value }: SearchInputProps): React.ReactElement {
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value), [onChange]);

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="text-text-semantic-faint" style={{ flexShrink: 0 }}>
        <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 8L10.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Filter sessions and tools..."
        className="flex-1 bg-transparent text-[11px] outline-none text-text-semantic-primary"
        style={{ caretColor: 'var(--accent)', fontFamily: 'var(--font-ui)' }}
        aria-label="Filter agent sessions"
      />
      {value ? <ClearFilterButton onClear={() => onChange('')} /> : null}
    </div>
  );
});

const ComparePanelEmptyState = memo(function ComparePanelEmptyState(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8 text-center" style={{ minHeight: '120px' }}>
      <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="text-text-semantic-faint" style={{ marginBottom: '8px' }}>
        <rect x="1" y="3" width="6" height="10" rx="1" />
        <rect x="9" y="3" width="6" height="10" rx="1" />
      </svg>
      <span className="text-[11px] italic text-text-semantic-faint">Select a session to compare</span>
    </div>
  );
});

const ComparePanelHeader = memo(function ComparePanelHeader({
  label,
  onSelect,
  selectedId,
  sessions,
}: Omit<ComparePanelProps, 'onDismiss'>): React.ReactElement {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-muted)' }}>
      <span className="text-[11px] font-semibold shrink-0 text-interactive-accent">{label}</span>
      <select
        value={selectedId ?? ''}
        onChange={(event) => onSelect(event.target.value)}
        style={{ flex: 1, minWidth: 0, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}
        aria-label={`Select session for ${label}`}
      >
        <option value="">-- Select session --</option>
        {sessions.map((session) => <option key={session.id} value={session.id}>{session.id.slice(0, 8)}... ({new Date(session.startedAt ?? Date.now()).toLocaleTimeString()})</option>)}
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
}: ComparePanelProps): React.ReactElement {
  const selectedSession = selectedId ? sessions.find((session) => session.id === selectedId) : undefined;

  return (
    <div className="flex flex-col min-h-0" style={{ flex: 1, overflow: 'hidden' }}>
      <ComparePanelHeader label={label} onSelect={onSelect} selectedId={selectedId} sessions={sessions} />
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {selectedSession ? <AgentCard session={selectedSession} onDismiss={onDismiss} /> : <ComparePanelEmptyState />}
      </div>
    </div>
  );
});

const QuickActionButton = memo(function QuickActionButton({
  onClick,
  template,
}: {
  onClick: () => void;
  template: AgentTemplate;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
      style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '10px', fontFamily: 'var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap' }}
      onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--bg-tertiary)'; event.currentTarget.style.color = 'var(--text)'; event.currentTarget.style.borderColor = 'var(--accent)'; }}
      onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.color = 'var(--text-muted)'; event.currentTarget.style.borderColor = 'var(--border)'; }}
      title={template.promptTemplate}
    >
      {template.icon ? <span>{template.icon}</span> : null}
      <span>{template.name}</span>
    </button>
  );
});

export const QuickActionBar = memo(function QuickActionBar({
  onExecuteTemplate,
  templates,
}: QuickActionBarProps): React.ReactElement | null {
  if (templates.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-muted)' }}>
      <span className="text-[10px] font-medium shrink-0 text-text-semantic-faint">Quick:</span>
      {templates.map((template) => <QuickActionButton key={template.id} template={template} onClick={() => onExecuteTemplate(template)} />)}
    </div>
  );
});

const ToolbarButton = memo(function ToolbarButton({
  active,
  ariaLabel,
  children,
  onClick,
  title,
}: {
  active: boolean;
  ariaLabel: string;
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title={title}
      className="shrink-0 flex items-center justify-center rounded"
      style={{ padding: '4px', color: active ? 'var(--accent)' : 'var(--text-faint)', background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent', border: 'none', cursor: 'pointer', transition: 'color 150ms ease, background 150ms ease' }}
      onMouseEnter={(event) => { if (!active) event.currentTarget.style.color = 'var(--text)'; }}
      onMouseLeave={(event) => { if (!active) event.currentTarget.style.color = 'var(--text-faint)'; }}
      aria-pressed={active}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
});

export const MonitorToolbar = memo(function MonitorToolbar({
  compareMode,
  costMode,
  filterQuery,
  hasAnySessions,
  multiSessionMode,
  onFilterChange,
  onToggleCompare,
  onToggleCost,
  onToggleMultiSession,
}: MonitorToolbarProps): React.ReactElement | null {
  if (!hasAnySessions) return null;

  return (
    <div className="flex items-center flex-shrink-0" style={{ borderBottom: '1px solid var(--border-muted)' }}>
      <div className="flex-1 min-w-0"><SearchInput value={filterQuery} onChange={onFilterChange} /></div>
      <ToolbarButton active={costMode} onClick={onToggleCost} title={costMode ? 'Exit cost dashboard' : 'Show cost analytics dashboard'} ariaLabel="Toggle cost dashboard">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M8 2V14" strokeLinecap="round" />
          <path d="M5.5 4.5C5.5 4.5 6.5 3.5 8 3.5C9.5 3.5 10.5 4.3 10.5 5.5C10.5 6.7 9.5 7.2 8 7.5C6.5 7.8 5.5 8.3 5.5 9.5C5.5 10.7 6.5 11.5 8 11.5C9.5 11.5 10.5 10.5 10.5 10.5" strokeLinecap="round" />
        </svg>
      </ToolbarButton>
      <ToolbarButton active={multiSessionMode !== 'off'} onClick={onToggleMultiSession} title={multiSessionMode !== 'off' ? 'Exit multi-session mode' : 'Launch parallel Claude Code sessions'} ariaLabel="Toggle multi-session mode">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="1" y="1" width="5" height="6" rx="1" />
          <rect x="10" y="1" width="5" height="6" rx="1" />
          <rect x="1" y="9" width="5" height="6" rx="1" />
          <rect x="10" y="9" width="5" height="6" rx="1" />
        </svg>
      </ToolbarButton>
      <div className="mx-1.5">
        <ToolbarButton active={compareMode} onClick={onToggleCompare} title={compareMode ? 'Exit compare mode' : 'Compare two sessions side by side'} ariaLabel="Toggle compare mode">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="1" y="3" width="6" height="10" rx="1" />
            <rect x="9" y="3" width="6" height="10" rx="1" />
          </svg>
        </ToolbarButton>
      </div>
    </div>
  );
});

export { EmptyState };
