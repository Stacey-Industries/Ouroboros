/**
 * AgentMonitorManager.tsx — Orchestrates all agent state and renders the monitor.
 *
 * Wires useAgentEvents → AgentSummaryBar + AgentCard list.
 * Provides "clear completed" and per-session dismiss actions.
 * Separates live sessions from historical (restored from disk) sessions,
 * showing historical in a collapsible "Previous Sessions" section.
 * Also provides a "Compare" mode for side-by-side A/B session review.
 */

import React, { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { AgentSession } from './types';
import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import { useToastContext } from '../../contexts/ToastContext';
import { AgentSummaryBar } from './AgentSummaryBar';
import { AgentCard } from './AgentCard';
import { AgentTree, hasTreeStructure } from './AgentTree';
import { EmptyState as SharedEmptyState } from '../shared';

// ─── Empty state ─────────────────────────────────────────────────────────────

const EmptyState = memo(function EmptyState(): React.ReactElement {
  return (
    <SharedEmptyState
      icon="agent"
      title="No agents running"
      description="Agents will appear here when Claude Code runs tools in your project."
    />
  );
});

// ─── Previous sessions section ────────────────────────────────────────────────

interface PreviousSessionsSectionProps {
  sessions: AgentSession[];
  onDismiss: (id: string) => void;
}

const PreviousSessionsSection = memo(function PreviousSessionsSection({
  sessions,
  onDismiss,
}: PreviousSessionsSectionProps): React.ReactElement | null {
  const [collapsed, setCollapsed] = useState(true);

  const handleToggle = useCallback(() => setCollapsed((v) => !v), []);

  if (sessions.length === 0) return null;

  return (
    <div style={{ borderTop: '1px solid var(--border-muted)' }}>
      {/* Section header */}
      <button
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left transition-colors"
        style={{ background: 'transparent' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        onClick={handleToggle}
        aria-expanded={!collapsed}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{
            transform: collapsed ? 'none' : 'rotate(90deg)',
            transition: 'transform 150ms ease',
            color: 'var(--text-faint)',
            flexShrink: 0,
          }}
        >
          <path
            d="M3 1.5L7 5L3 8.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span
          className="text-[11px] font-medium"
          style={{ color: 'var(--text-faint)' }}
        >
          Previous Sessions
        </span>
        <span
          className="text-[10px] ml-auto tabular-nums"
          style={{ color: 'var(--text-faint)' }}
        >
          {sessions.length}
        </span>
      </button>

      {/* Historical session cards */}
      {!collapsed && (
        <div>
          {sessions.map((session) => (
            <AgentCard
              key={session.id}
              session={session}
              onDismiss={onDismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

// ─── Filter helpers ───────────────────────────────────────────────────────────

function filterSessions(sessions: AgentSession[], query: string): AgentSession[] {
  if (!query) return sessions;
  const q = query.toLowerCase();
  return sessions
    .filter((s) =>
      s.taskLabel.toLowerCase().includes(q) ||
      s.toolCalls.some((tc) =>
        tc.toolName.toLowerCase().includes(q) || tc.input.toLowerCase().includes(q),
      ),
    )
    .map((s) => ({
      ...s,
      toolCalls: s.toolCalls.filter(
        (tc) =>
          tc.toolName.toLowerCase().includes(q) || tc.input.toLowerCase().includes(q),
      ),
    }));
}

// ─── Search input ─────────────────────────────────────────────────────────────

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
}

const SearchInput = memo(function SearchInput({ value, onChange }: SearchInputProps): React.ReactElement {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    [onChange],
  );
  const handleClear = useCallback(() => onChange(''), [onChange]);

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1.5"
    >
      {/* Search icon */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ color: 'var(--text-faint)', flexShrink: 0 }}
      >
        <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 8L10.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>

      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Filter sessions and tools…"
        className="flex-1 bg-transparent text-[11px] outline-none"
        style={{
          color: 'var(--text)',
          caretColor: 'var(--accent)',
          fontFamily: 'var(--font-ui)',
        }}
        aria-label="Filter agent sessions"
      />

      {/* Clear button */}
      {value && (
        <button
          onClick={handleClear}
          className="shrink-0 flex items-center justify-center rounded"
          style={{
            color: 'var(--text-faint)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; }}
          title="Clear filter"
          aria-label="Clear filter"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
});

// ─── ComparePanel ─────────────────────────────────────────────────────────────

interface ComparePanelProps {
  sessions: AgentSession[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label: string;
  onDismiss: (id: string) => void;
}

const ComparePanel = memo(function ComparePanel({
  sessions,
  selectedId,
  onSelect,
  label,
  onDismiss,
}: ComparePanelProps): React.ReactElement {
  const selectedSession = selectedId ? sessions.find((s) => s.id === selectedId) : undefined;

  return (
    <div
      className="flex flex-col min-h-0"
      style={{ flex: 1, overflow: 'hidden' }}
    >
      {/* Panel header with label + session dropdown */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-muted)' }}
      >
        <span
          className="text-[11px] font-semibold shrink-0"
          style={{ color: 'var(--accent)' }}
        >
          {label}
        </span>
        <select
          value={selectedId ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '2px 6px',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
          }}
          aria-label={`Select session for ${label}`}
        >
          <option value="">-- Select session --</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id.slice(0, 8)}… ({new Date(s.startedAt ?? Date.now()).toLocaleTimeString()})
            </option>
          ))}
        </select>
      </div>

      {/* Panel body */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {selectedSession ? (
          <AgentCard session={selectedSession} onDismiss={onDismiss} />
        ) : (
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
              style={{ color: 'var(--text-faint)', marginBottom: '8px' }}
            >
              <rect x="1" y="3" width="6" height="10" rx="1" />
              <rect x="9" y="3" width="6" height="10" rx="1" />
            </svg>
            <span
              className="text-[11px] italic"
              style={{ color: 'var(--text-faint)' }}
            >
              Select a session to compare
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

export const AgentMonitorManager = memo(function AgentMonitorManager(): React.ReactElement {
  const { agents, clearCompleted, dismiss, currentSessions, historicalSessions } = useAgentEventsContext();
  const { toast } = useToastContext();
  const [filterQuery, setFilterQuery] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [compareSessionIds, setCompareSessionIds] = useState<[string | null, string | null]>([null, null]);

  const handleToggleCompare = useCallback(() => setCompareMode((v) => !v), []);
  const handleSelectCompareA = useCallback(
    (id: string) => setCompareSessionIds(([, b]) => [id, b]),
    [],
  );
  const handleSelectCompareB = useCallback(
    (id: string) => setCompareSessionIds(([a]) => [a, id]),
    [],
  );

  // Track which sessions we've already notified about to avoid duplicate toasts/desktop notifications
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const session of agents) {
      if (session.status === 'complete' && !notifiedRef.current.has(session.id)) {
        notifiedRef.current.add(session.id);
        toast(`Agent completed: ${session.taskLabel}`, 'success');
        // Desktop notification — only fires when window is not focused (enforced in main process)
        window.electronAPI?.app?.notify?.({
          title: 'Agent completed',
          body: session.taskLabel,
        }).catch(() => { /* non-fatal */ });
      } else if (session.status === 'error' && !notifiedRef.current.has(session.id)) {
        notifiedRef.current.add(session.id);
        toast(
          `Agent error: ${session.error ?? session.taskLabel}`,
          'error',
        );
        // Desktop notification — only fires when window is not focused (enforced in main process)
        window.electronAPI?.app?.notify?.({
          title: 'Agent error',
          body: session.error ?? session.taskLabel,
        }).catch(() => { /* non-fatal */ });
      }
    }
  }, [agents, toast]);

  // Apply filter to current and historical sessions
  const filteredCurrentSessions = useMemo(
    () => filterSessions(currentSessions, filterQuery),
    [currentSessions, filterQuery],
  );
  const filteredHistoricalSessions = useMemo(
    () => filterSessions(historicalSessions, filterQuery),
    [historicalSessions, filterQuery],
  );

  const hasCurrentSessions = filteredCurrentSessions.length > 0;
  const hasAnySessions = agents.length > 0;
  const hasFilteredSessions = filteredCurrentSessions.length > 0 || filteredHistoricalSessions.length > 0;
  const useTree = hasCurrentSessions && !filterQuery && hasTreeStructure(filteredCurrentSessions);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Summary bar — only when there are sessions */}
      {hasAnySessions && (
        <div className="flex-shrink-0">
          <AgentSummaryBar sessions={agents} onClearCompleted={clearCompleted} />
        </div>
      )}

      {/* Search input + compare toggle — always shown when there are any sessions */}
      {hasAnySessions && (
        <div
          className="flex items-center flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-muted)' }}
        >
          <div className="flex-1 min-w-0">
            <SearchInput value={filterQuery} onChange={setFilterQuery} />
          </div>
          {/* Compare toggle button */}
          <button
            onClick={handleToggleCompare}
            title={compareMode ? 'Exit compare mode' : 'Compare two sessions side by side'}
            className="shrink-0 flex items-center justify-center rounded mx-1.5"
            style={{
              padding: '4px',
              color: compareMode ? 'var(--accent)' : 'var(--text-faint)',
              background: compareMode ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'color 150ms ease, background 150ms ease',
            }}
            onMouseEnter={(e) => {
              if (!compareMode) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
            }}
            onMouseLeave={(e) => {
              if (!compareMode) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)';
            }}
            aria-pressed={compareMode}
            aria-label="Toggle compare mode"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="1" y="3" width="6" height="10" rx="1" />
              <rect x="9" y="3" width="6" height="10" rx="1" />
            </svg>
          </button>
        </div>
      )}

      {/* Compare mode layout */}
      {compareMode ? (
        <div
          className="flex-1 min-h-0"
          style={{ display: 'flex', gap: '0', height: '100%', overflow: 'hidden' }}
        >
          <ComparePanel
            sessions={agents}
            selectedId={compareSessionIds[0]}
            onSelect={handleSelectCompareA}
            label="Session A"
            onDismiss={dismiss}
          />
          <div style={{ width: '1px', background: 'var(--border)', flexShrink: 0 }} />
          <ComparePanel
            sessions={agents}
            selectedId={compareSessionIds[1]}
            onSelect={handleSelectCompareB}
            label="Session B"
            onDismiss={dismiss}
          />
        </div>
      ) : (
        /* Normal: Agent tree / flat card list / empty state */
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {hasAnySessions ? (
            hasFilteredSessions ? (
              <>
                {useTree ? (
                  <AgentTree sessions={filteredCurrentSessions} onDismiss={dismiss} />
                ) : (
                  filteredCurrentSessions.map((session) => (
                    <AgentCard
                      key={session.id}
                      session={session}
                      onDismiss={dismiss}
                    />
                  ))
                )}
                <PreviousSessionsSection sessions={filteredHistoricalSessions} onDismiss={dismiss} />
              </>
            ) : filterQuery ? (
              /* Query active but no matches */
              <div
                className="px-4 py-6 text-center text-[12px] italic"
                style={{ color: 'var(--text-faint)' }}
              >
                No sessions match &ldquo;{filterQuery}&rdquo;
              </div>
            ) : (
              /* No filter, no sessions yet */
              <EmptyState />
            )
          ) : (
            <EmptyState />
          )}
        </div>
      )}
    </div>
  );
});
