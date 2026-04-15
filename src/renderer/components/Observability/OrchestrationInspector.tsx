/**
 * OrchestrationInspector.tsx — Top-level Observability panel with three tabs:
 * Traffic / Timeline / Decisions.
 *
 * Accepts an optional sessionId prop; falls back to the most recent active
 * session from AgentEventsContext when unset.
 */

import React, { useState } from 'react';

import { useAgentEventsContext } from '../../contexts/AgentEventsContext';
import { InspectorDecisionTab } from './InspectorDecisionTab';
import { exportTraceAsHar } from './InspectorExport';
import { InspectorTimelineTab } from './InspectorTimelineTab';
import { InspectorTrafficTab } from './InspectorTrafficTab';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'traffic' | 'timeline' | 'decisions';

const TABS: { id: TabId; label: string }[] = [
  { id: 'traffic', label: 'Traffic' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'decisions', label: 'Decisions' },
];

// ─── Tab bar ──────────────────────────────────────────────────────────────────

interface TabBarProps {
  active: TabId;
  onSelect: (id: TabId) => void;
}

function InspectorTabBar({ active, onSelect }: TabBarProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1 border-b border-border-semantic px-2">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={`px-3 py-1.5 text-xs transition-colors ${
            active === tab.id
              ? 'border-b-2 border-interactive-accent text-text-semantic-primary'
              : 'text-text-semantic-muted hover:text-text-semantic-primary'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

interface HeaderProps {
  sessionId: string;
  onExport: () => void;
}

function InspectorHeader({ sessionId, onExport }: HeaderProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between border-b border-border-semantic bg-surface-panel px-3 py-2">
      <span className="text-xs font-medium text-text-semantic-primary">
        Orchestration Inspector
      </span>
      <div className="flex items-center gap-2">
        {sessionId && (
          <span className="font-mono text-[10px] text-text-semantic-muted">
            {sessionId.slice(0, 8)}
          </span>
        )}
        <button
          onClick={onExport}
          disabled={!sessionId}
          className="rounded px-2 py-0.5 text-xs text-text-semantic-muted hover:bg-surface-raised hover:text-text-semantic-primary disabled:opacity-40"
        >
          Export as JSON
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface OrchestrationInspectorProps {
  sessionId?: string;
}

export function OrchestrationInspector({
  sessionId: propSessionId,
}: OrchestrationInspectorProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('traffic');
  const { currentSessions } = useAgentEventsContext();

  const sessionId =
    propSessionId ?? currentSessions[0]?.id ?? '';

  const handleExport = (): void => {
    if (!sessionId) return;
    exportTraceAsHar(sessionId).catch((err: unknown) => {
      console.error('[OrchestrationInspector] export failed:', err);
    });
  };

  return (
    <div className="flex h-full flex-col bg-surface-base text-text-semantic-primary">
      <InspectorHeader sessionId={sessionId} onExport={handleExport} />
      <InspectorTabBar active={activeTab} onSelect={setActiveTab} />
      <div className="min-h-0 flex-1">
        {activeTab === 'traffic' && <InspectorTrafficTab sessionId={sessionId} />}
        {activeTab === 'timeline' && <InspectorTimelineTab sessionId={sessionId} />}
        {activeTab === 'decisions' && <InspectorDecisionTab />}
      </div>
    </div>
  );
}
