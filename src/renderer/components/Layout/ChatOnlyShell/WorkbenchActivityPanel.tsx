import React, { useMemo } from 'react';

import { useAgentEventsContext } from '../../../contexts/AgentEventsContext';
import type { AgentSession, ToolCallEvent } from '../../AgentMonitor/types';

type PanelMode = 'activity' | 'subagents';

interface ActivityEntry {
  id: string;
  sessionLabel: string;
  toolName: string;
  input: string;
  status: ToolCallEvent['status'];
  timestamp: number;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function trimInput(input: string): string {
  return input.length > 120 ? `${input.slice(0, 120)}...` : input;
}

function collectActivityEntries(sessions: AgentSession[]): ActivityEntry[] {
  return sessions
    .flatMap((session) =>
      session.toolCalls.map((toolCall) => ({
        id: `${session.id}:${toolCall.id}`,
        sessionLabel: session.taskLabel,
        toolName: toolCall.toolName,
        input: toolCall.input,
        status: toolCall.status,
        timestamp: toolCall.timestamp,
      })))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 10);
}

function statusTone(status: ToolCallEvent['status']): string {
  if (status === 'error') return 'text-status-error';
  if (status === 'pending') return 'text-status-warning';
  return 'text-status-success';
}

function EmptyState({ mode }: { mode: PanelMode }): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-semantic-secondary">
      {mode === 'subagents'
        ? 'No subagent sessions are active in this window.'
        : 'No recent agent activity yet.'}
    </div>
  );
}

function ActivityFeed({ entries }: { entries: ActivityEntry[] }): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3" data-testid="workbench-activity-panel">
      {entries.map((entry) => (
        <article key={entry.id} className="rounded-2xl border border-stroke-default bg-surface-panel/80 p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-semantic-primary">{entry.sessionLabel}</span>
            <span className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${statusTone(entry.status)}`}>
              {entry.status}
            </span>
            <span className="ml-auto text-[11px] text-text-semantic-tertiary">{formatTime(entry.timestamp)}</span>
          </div>
          <div className="mt-2 font-mono text-xs text-text-semantic-primary">{entry.toolName}</div>
          <div className="mt-1 break-all font-mono text-xs text-text-semantic-secondary">{trimInput(entry.input)}</div>
        </article>
      ))}
    </div>
  );
}

function SubagentList({ sessions }: { sessions: AgentSession[] }): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3" data-testid="workbench-subagent-panel">
      {sessions.map((session) => (
        <article key={session.id} className="rounded-2xl border border-stroke-default bg-surface-panel/80 p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-semantic-primary">{session.taskLabel}</span>
            <span className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${
              session.status === 'error'
                ? 'text-status-error'
                : session.status === 'complete'
                  ? 'text-status-success'
                  : 'text-status-warning'
            }`}>
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
  const activityEntries = useMemo(() => collectActivityEntries(currentSessions), [currentSessions]);
  const subagentSessions = useMemo(
    () => currentSessions.filter((session) => Boolean(session.parentSessionId)),
    [currentSessions],
  );

  if (mode === 'subagents') {
    if (subagentSessions.length === 0) return <EmptyState mode={mode} />;
    return <SubagentList sessions={subagentSessions} />;
  }
  if (activityEntries.length === 0) return <EmptyState mode={mode} />;
  return <ActivityFeed entries={activityEntries} />;
}
