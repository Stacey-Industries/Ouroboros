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
import type { NotificationSettings, AgentTemplate } from '../../types/electron';
import { resolveTemplate } from '../../utils/templateResolver';
import { useProject } from '../../contexts/ProjectContext';
import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import { useToastContext } from '../../contexts/ToastContext';
import { useDiffSnapshots } from '../../hooks/useDiffSnapshots';
import { useCostTracking } from '../../hooks/useCostTracking';
import { AgentSummaryBar } from './AgentSummaryBar';
import { AgentCard } from './AgentCard';
import { AgentTree, hasTreeStructure } from './AgentTree';
import { CostDashboard } from './CostDashboard';
import { EmptyState as SharedEmptyState } from '../shared';
import { buildCompletionNotification } from './notificationBuilder';
import { MultiSessionLauncher, MultiSessionMonitor } from '../MultiSession';

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
  onUpdateNotes?: (id: string, notes: string, bookmarked?: boolean) => void;
  onReviewChanges?: (sessionId: string) => void;
  onReplay?: (sessionId: string) => void;
}

const PreviousSessionsSection = memo(function PreviousSessionsSection({
  sessions,
  onDismiss,
  onUpdateNotes,
  onReviewChanges,
  onReplay,
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
  const { agents, clearCompleted, dismiss, updateNotes, currentSessions, historicalSessions } = useAgentEventsContext();
  const { toast } = useToastContext();
  const { projectRoot } = useProject();
  const { getSnapshotHash } = useDiffSnapshots();

  // Auto-record cost entries when sessions complete
  useCostTracking(agents);
  const [filterQuery, setFilterQuery] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [costMode, setCostMode] = useState(false);
  const [multiSessionMode, setMultiSessionMode] = useState<'off' | 'launcher' | 'monitor'>('off');
  const [multiBatchLabels, setMultiBatchLabels] = useState<string[]>([]);

  // Load agent templates from config
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  useEffect(() => {
    window.electronAPI?.config?.get('agentTemplates').then((t) => {
      if (t) setTemplates(t);
    }).catch(() => { /* use empty */ });
  }, []);
  const [compareSessionIds, setCompareSessionIds] = useState<[string | null, string | null]>([null, null]);

  const handleToggleCompare = useCallback(() => {
    setCompareMode((v) => !v);
    setCostMode(false);
    setMultiSessionMode('off');
  }, []);
  const handleToggleCost = useCallback(() => {
    setCostMode((v) => !v);
    setCompareMode(false);
    setMultiSessionMode('off');
  }, []);
  const handleToggleMultiSession = useCallback(() => {
    setMultiSessionMode((v) => (v === 'off' ? 'launcher' : 'off'));
    setCompareMode(false);
    setCostMode(false);
  }, []);
  const handleMultiSessionLaunched = useCallback((labels: string[]) => {
    setMultiBatchLabels(labels);
    setMultiSessionMode('monitor');
  }, []);
  const handleMultiSessionClose = useCallback(() => {
    setMultiSessionMode('off');
    setMultiBatchLabels([]);
  }, []);
  const handleSelectCompareA = useCallback(
    (id: string) => setCompareSessionIds(([, b]) => [id, b]),
    [],
  );
  const handleSelectCompareB = useCallback(
    (id: string) => setCompareSessionIds(([a]) => [a, id]),
    [],
  );

  // Listen for DOM event to open multi-session launcher from command palette
  useEffect(() => {
    function onOpenMultiSession(): void {
      setMultiSessionMode('launcher');
      setCompareMode(false);
      setCostMode(false);
    }
    window.addEventListener('agent-ide:open-multi-session', onOpenMultiSession);
    return () => window.removeEventListener('agent-ide:open-multi-session', onOpenMultiSession);
  }, []);

  // Track which sessions we've already notified about to avoid duplicate toasts/desktop notifications
  const notifiedRef = useRef<Set<string>>(new Set());
  const notifSettingsRef = useRef<NotificationSettings>({ level: 'all', alwaysNotify: false });

  // Load notification settings once on mount (and keep ref current)
  useEffect(() => {
    window.electronAPI?.config?.get('notifications').then((settings) => {
      if (settings) notifSettingsRef.current = settings;
    }).catch(() => { /* use defaults */ });
  }, []);

  useEffect(() => {
    const { level, alwaysNotify } = notifSettingsRef.current;
    if (level === 'none') return;

    for (const session of agents) {
      // Skip restored (persisted from prior sessions) — only notify for live events
      if (session.restored) continue;
      if (notifiedRef.current.has(session.id)) continue;
      if (session.status !== 'complete' && session.status !== 'error') continue;
      if (level === 'errors-only' && session.status === 'complete') continue;

      notifiedRef.current.add(session.id);

      const { title, body } = buildCompletionNotification(session);
      const toastType = session.status === 'error' ? 'error' : 'success';
      toast(`${title}: ${session.taskLabel}`, toastType);

      // Desktop notification — force bypasses the focus check in main process
      window.electronAPI?.app?.notify?.({ title, body, force: alwaysNotify })
        .catch(() => { /* non-fatal */ });
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

  const handleExecuteTemplate = useCallback((template: AgentTemplate) => {
    const ctx = {
      projectRoot,
      projectName: projectRoot?.replace(/\\/g, '/').split('/').pop() ?? '',
      openFile: null as string | null,
      openFileName: null as string | null,
    };
    const resolvedPrompt = resolveTemplate(template.promptTemplate, ctx);
    window.dispatchEvent(new CustomEvent('agent-ide:spawn-claude-template', {
      detail: {
        prompt: resolvedPrompt,
        label: template.name,
        cliOverrides: template.cliOverrides,
      },
    }));
  }, [projectRoot]);

  // Enrich sessions with snapshot hashes from the diff snapshot hook
  const enrichedAgents = useMemo(() => {
    return agents.map((s) => {
      const hash = getSnapshotHash(s.id);
      if (hash && !s.snapshotHash) return { ...s, snapshotHash: hash };
      return s;
    });
  }, [agents, getSnapshotHash]);

  const enrichedCurrent = useMemo(() => {
    return filteredCurrentSessions.map((s) => {
      const hash = getSnapshotHash(s.id);
      if (hash && !s.snapshotHash) return { ...s, snapshotHash: hash };
      return s;
    });
  }, [filteredCurrentSessions, getSnapshotHash]);

  const enrichedHistorical = useMemo(() => {
    return filteredHistoricalSessions.map((s) => {
      const hash = getSnapshotHash(s.id);
      if (hash && !s.snapshotHash) return { ...s, snapshotHash: hash };
      return s;
    });
  }, [filteredHistoricalSessions, getSnapshotHash]);

  const handleReplay = useCallback((sessionId: string) => {
    const session = enrichedAgents.find((s) => s.id === sessionId);
    if (!session) return;
    window.dispatchEvent(new CustomEvent('agent-ide:open-session-replay', {
      detail: { session },
    }));
  }, [enrichedAgents]);

  const handleReviewChanges = useCallback((sessionId: string) => {
    const session = enrichedAgents.find((s) => s.id === sessionId);
    if (!session?.snapshotHash || !projectRoot) {
      toast('No snapshot available for this session', 'error');
      return;
    }
    window.dispatchEvent(new CustomEvent('agent-ide:open-diff-review', {
      detail: { sessionId, snapshotHash: session.snapshotHash, projectRoot },
    }));
  }, [enrichedAgents, projectRoot, toast]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Quick actions — always visible when templates exist */}
      {templates.length > 0 && (
        <div
          className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 overflow-x-auto"
          style={{ borderBottom: '1px solid var(--border-muted)' }}
        >
          <span
            className="text-[10px] font-medium shrink-0"
            style={{ color: 'var(--text-faint)' }}
          >
            Quick:
          </span>
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => handleExecuteTemplate(t)}
              className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                fontSize: '10px',
                fontFamily: 'var(--font-ui)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
              }}
              title={t.promptTemplate}
            >
              {t.icon && <span>{t.icon}</span>}
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      )}

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
          {/* Cost dashboard toggle button */}
          <button
            onClick={handleToggleCost}
            title={costMode ? 'Exit cost dashboard' : 'Show cost analytics dashboard'}
            className="shrink-0 flex items-center justify-center rounded"
            style={{
              padding: '4px',
              color: costMode ? 'var(--accent)' : 'var(--text-faint)',
              background: costMode ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'color 150ms ease, background 150ms ease',
            }}
            onMouseEnter={(e) => {
              if (!costMode) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
            }}
            onMouseLeave={(e) => {
              if (!costMode) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)';
            }}
            aria-pressed={costMode}
            aria-label="Toggle cost dashboard"
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
              <path d="M8 2V14" strokeLinecap="round" />
              <path d="M5.5 4.5C5.5 4.5 6.5 3.5 8 3.5C9.5 3.5 10.5 4.3 10.5 5.5C10.5 6.7 9.5 7.2 8 7.5C6.5 7.8 5.5 8.3 5.5 9.5C5.5 10.7 6.5 11.5 8 11.5C9.5 11.5 10.5 10.5 10.5 10.5" strokeLinecap="round" />
            </svg>
          </button>
          {/* Multi-Session toggle button */}
          <button
            onClick={handleToggleMultiSession}
            title={multiSessionMode !== 'off' ? 'Exit multi-session mode' : 'Launch parallel Claude Code sessions'}
            className="shrink-0 flex items-center justify-center rounded"
            style={{
              padding: '4px',
              color: multiSessionMode !== 'off' ? 'var(--accent)' : 'var(--text-faint)',
              background: multiSessionMode !== 'off' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'color 150ms ease, background 150ms ease',
            }}
            onMouseEnter={(e) => {
              if (multiSessionMode === 'off') (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
            }}
            onMouseLeave={(e) => {
              if (multiSessionMode === 'off') (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)';
            }}
            aria-pressed={multiSessionMode !== 'off'}
            aria-label="Toggle multi-session mode"
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
              <rect x="1" y="1" width="5" height="6" rx="1" />
              <rect x="10" y="1" width="5" height="6" rx="1" />
              <rect x="1" y="9" width="5" height="6" rx="1" />
              <rect x="10" y="9" width="5" height="6" rx="1" />
            </svg>
          </button>
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

      {/* Multi-session launcher overlay */}
      {multiSessionMode === 'launcher' ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <MultiSessionLauncher
            onClose={handleMultiSessionClose}
            onLaunched={handleMultiSessionLaunched}
          />
        </div>
      ) : multiSessionMode === 'monitor' ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <MultiSessionMonitor
            batchLabels={multiBatchLabels}
            onClose={handleMultiSessionClose}
          />
        </div>
      ) : /* Cost dashboard layout */
      costMode ? (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <CostDashboard sessions={agents} />
        </div>
      ) : compareMode ? (
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
                  <AgentTree sessions={enrichedCurrent} onDismiss={dismiss} />
                ) : (
                  enrichedCurrent.map((session) => (
                    <AgentCard
                      key={session.id}
                      session={session}
                      onDismiss={dismiss}
                      onUpdateNotes={updateNotes}
                      onReviewChanges={handleReviewChanges}
                      onReplay={handleReplay}
                    />
                  ))
                )}
                <PreviousSessionsSection sessions={enrichedHistorical} onDismiss={dismiss} onUpdateNotes={updateNotes} onReviewChanges={handleReviewChanges} onReplay={handleReplay} />
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
