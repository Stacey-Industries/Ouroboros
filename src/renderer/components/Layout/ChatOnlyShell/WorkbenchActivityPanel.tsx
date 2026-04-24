import React, { useMemo } from 'react';

import { useAgentEventsContext } from '../../../contexts/AgentEventsContext';
import type { AgentSession } from '../../AgentMonitor/types';
import { WorkbenchTimelinePanel } from './WorkbenchTimelinePanel';

type PanelMode = 'activity' | 'subagents';

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function EmptyState({ mode }: { mode: PanelMode }): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-semantic-secondary">
      {mode === 'subagents'
        ? 'No subagent sessions are active in this window.'
        : 'No timeline entries yet.'}
    </div>
  );
}

function SubagentList({ sessions }: { sessions: AgentSession[] }): React.ReactElement {
  return (
    <div
      className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3"
      data-testid="workbench-subagent-panel"
    >
      {sessions.map((session) => (
        <article
          key={session.id}
          className="rounded-2xl border border-stroke-default bg-surface-panel/80 p-3"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-semantic-primary">
              {session.taskLabel}
            </span>
            <span
              className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${
                session.status === 'error'
                  ? 'text-status-error'
                  : session.status === 'complete'
                    ? 'text-status-success'
                    : 'text-status-warning'
              }`}
            >
              {session.status}
            </span>
          </div>
          <div className="mt-1 text-xs text-text-semantic-secondary">
            Parent: <span className="font-mono">{session.parentSessionId}</span>
          </div>
          <div className="mt-1 text-[11px] text-text-semantic-tertiary">
            Started {formatTime(session.startedAt)}
          </div>
        </article>
      ))}
    </div>
  );
}

export function WorkbenchActivityPanel({ mode }: { mode: PanelMode }): React.ReactElement {
  const { currentSessions } = useAgentEventsContext();
  const subagentSessions = useMemo(
    () => currentSessions.filter((session) => Boolean(session.parentSessionId)),
    [currentSessions],
  );

  if (mode === 'subagents') {
    if (subagentSessions.length === 0) return <EmptyState mode={mode} />;
    return <SubagentList sessions={subagentSessions} />;
  }
  return <WorkbenchTimelinePanel />;
}
