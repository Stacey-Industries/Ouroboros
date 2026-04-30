import type { AgentSession } from './types';

/**
 * Wave 64 — filters out IDE chat sessions (kind === 'chat'). Chat sessions are
 * registered in the agent-events reducer purely so InstructionsLoaded events can
 * attach loadedRules; they are not agent-monitor surfaces and would be confusing
 * if listed alongside subagents and terminal sessions.
 */
function isAgentMonitorVisible(session: AgentSession): boolean {
  return session.kind !== 'chat';
}

export function filterSessions(sessions: AgentSession[], query: string): AgentSession[] {
  const visible = sessions.filter(isAgentMonitorVisible);
  if (!query) return visible;

  const normalizedQuery = query.toLowerCase();
  return visible
    .filter((session) => matchesSession(session, normalizedQuery))
    .map((session) => ({ ...session, toolCalls: getMatchingToolCalls(session, normalizedQuery) }));
}

function matchesSession(session: AgentSession, query: string): boolean {
  return (
    session.taskLabel.toLowerCase().includes(query) ||
    getMatchingToolCalls(session, query).length > 0
  );
}

function getMatchingToolCalls(session: AgentSession, query: string) {
  return session.toolCalls.filter(
    (toolCall) =>
      toolCall.toolName.toLowerCase().includes(query) ||
      toolCall.input.toLowerCase().includes(query),
  );
}

export function enrichSessions(
  sessions: AgentSession[],
  getSnapshotHash: (sessionId: string) => string | undefined,
): AgentSession[] {
  return sessions.map((session) => {
    const snapshotHash = getSnapshotHash(session.id);
    return snapshotHash && !session.snapshotHash ? { ...session, snapshotHash } : session;
  });
}
