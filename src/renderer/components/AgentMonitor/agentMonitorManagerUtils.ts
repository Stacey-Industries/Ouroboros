import type { AgentSession } from './types';

export function filterSessions(sessions: AgentSession[], query: string): AgentSession[] {
  if (!query) return sessions;

  const normalizedQuery = query.toLowerCase();
  return sessions
    .filter((session) => matchesSession(session, normalizedQuery))
    .map((session) => ({ ...session, toolCalls: getMatchingToolCalls(session, normalizedQuery) }));
}

function matchesSession(session: AgentSession, query: string): boolean {
  return session.taskLabel.toLowerCase().includes(query) || getMatchingToolCalls(session, query).length > 0;
}

function getMatchingToolCalls(session: AgentSession, query: string) {
  return session.toolCalls.filter(
    (toolCall) => toolCall.toolName.toLowerCase().includes(query) || toolCall.input.toLowerCase().includes(query),
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
