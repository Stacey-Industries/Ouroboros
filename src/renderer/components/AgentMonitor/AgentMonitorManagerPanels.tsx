import React, { memo, useCallback, useState } from 'react';

import { EmptyState as SharedEmptyState } from '../shared';
import { AgentCard } from './AgentCard';
import {
  CompareIcon,
  CostIcon,
  MultiSessionIcon,
  PreviousSessionsHeaderChevron,
  SearchInput,
} from './AgentMonitorManagerPanelsParts';
import type { AgentSession } from './types';

interface PreviousSessionsSectionProps {
  sessions: AgentSession[];
  onDismiss: (id: string) => void;
  onReplay?: (sessionId: string) => void;
  onReviewChanges?: (sessionId: string) => void;
  onUpdateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
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

// ─── EmptyState ───────────────────────────────────────────────────────────────

const EmptyState = memo(function EmptyState(): React.ReactElement {
  return (
    <SharedEmptyState
      icon="agent"
      title="No agent sessions detected"
      description="Agent sessions are tracked when Claude Code runs in a terminal below. Start a Claude Code session to see activity here."
    />
  );
});

// ─── PreviousSessionsHeader ───────────────────────────────────────────────────

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
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--surface-raised)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent';
      }}
      onClick={onToggle}
      aria-expanded={!collapsed}
    >
      <PreviousSessionsHeaderChevron collapsed={collapsed} />
      <span className="text-[11px] font-medium text-text-semantic-faint">Previous Sessions</span>
      <span className="text-[10px] ml-auto tabular-nums text-text-semantic-faint">{count}</span>
    </button>
  );
});

// ─── PreviousSessionsSection ──────────────────────────────────────────────────

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
    <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <PreviousSessionsHeader
        collapsed={collapsed}
        count={sessions.length}
        onToggle={handleToggle}
      />
      {collapsed ? null : (
        <div>
          {sessions.map((session) => (
            <AgentCard
              key={session.id}
              session={session}
              onDismiss={onDismiss}
              onUpdateNotes={onUpdateNotes}
              onReviewChanges={onReviewChanges}
              onReplay={onReplay}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ─── MonitorToolbar ───────────────────────────────────────────────────────────

const TOOLBAR_BUTTON_STYLE_BASE = {
  padding: '4px',
  border: 'none',
  cursor: 'pointer',
  transition: 'color 150ms ease, background 150ms ease',
};

function toolbarButtonStyle(active: boolean): React.CSSProperties {
  return {
    ...TOOLBAR_BUTTON_STYLE_BASE,
    color: active ? 'var(--interactive-accent)' : 'var(--text-faint)',
    background: active
      ? 'color-mix(in srgb, var(--interactive-accent) 15%, transparent)'
      : 'transparent',
  };
}

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
      style={toolbarButtonStyle(active)}
      onMouseEnter={(event) => {
        if (!active) event.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(event) => {
        if (!active) event.currentTarget.style.color = 'var(--text-faint)';
      }}
      aria-pressed={active}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
});

function ToolbarButtons({
  compareMode,
  costMode,
  multiSessionMode,
  onToggleCompare,
  onToggleCost,
  onToggleMultiSession,
}: Omit<
  MonitorToolbarProps,
  'filterQuery' | 'hasAnySessions' | 'onFilterChange'
>): React.ReactElement {
  return (
    <>
      <ToolbarButton
        active={costMode}
        onClick={onToggleCost}
        ariaLabel="Toggle cost dashboard"
        title={costMode ? 'Exit cost dashboard' : 'Show cost analytics dashboard'}
      >
        <CostIcon />
      </ToolbarButton>
      <ToolbarButton
        active={multiSessionMode !== 'off'}
        onClick={onToggleMultiSession}
        ariaLabel="Toggle multi-session mode"
        title={
          multiSessionMode !== 'off'
            ? 'Exit multi-session mode'
            : 'Launch parallel Claude Code sessions'
        }
      >
        <MultiSessionIcon />
      </ToolbarButton>
      <div className="mx-1.5">
        <ToolbarButton
          active={compareMode}
          onClick={onToggleCompare}
          ariaLabel="Toggle compare mode"
          title={compareMode ? 'Exit compare mode' : 'Compare two sessions side by side'}
        >
          <CompareIcon />
        </ToolbarButton>
      </div>
    </>
  );
}

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
    <div
      className="flex items-center flex-shrink-0"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <div className="flex-1 min-w-0">
        <SearchInput value={filterQuery} onChange={onFilterChange} />
      </div>
      <ToolbarButtons
        compareMode={compareMode}
        costMode={costMode}
        multiSessionMode={multiSessionMode}
        onToggleCompare={onToggleCompare}
        onToggleCost={onToggleCost}
        onToggleMultiSession={onToggleMultiSession}
      />
    </div>
  );
});

export { ComparePanel, QuickActionBar, SearchInput } from './AgentMonitorManagerPanelsParts';
export { EmptyState };
