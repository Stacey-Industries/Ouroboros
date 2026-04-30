import { describe, expect, it } from 'vitest';

import { filterSessions } from './agentMonitorManagerUtils';
import type { AgentSession } from './types';

const baseSession = (overrides: Partial<AgentSession>): AgentSession => ({
  id: 's',
  taskLabel: 'Task',
  status: 'running',
  startedAt: 0,
  toolCalls: [],
  inputTokens: 0,
  outputTokens: 0,
  ...overrides,
});

describe('filterSessions — Wave 64 chat-kind exclusion', () => {
  it('hides sessions with kind === "chat" even when no query is set', () => {
    const sessions = [
      baseSession({ id: 'agent-1', kind: 'agent' }),
      baseSession({ id: 'chat-1', kind: 'chat' }),
      baseSession({ id: 'terminal-1', kind: 'terminal' }),
      baseSession({ id: 'legacy-no-kind' }),
    ];
    const result = filterSessions(sessions, '');
    expect(result.map((s) => s.id)).toEqual(['agent-1', 'terminal-1', 'legacy-no-kind']);
  });

  it('hides chat sessions when a query is set, even if the chat session matches the query', () => {
    const sessions = [
      baseSession({ id: 'chat-1', kind: 'chat', taskLabel: 'matching label' }),
      baseSession({ id: 'agent-1', kind: 'agent', taskLabel: 'matching label' }),
    ];
    const result = filterSessions(sessions, 'matching');
    expect(result.map((s) => s.id)).toEqual(['agent-1']);
  });

  it('treats sessions with no kind field (legacy) as visible', () => {
    const sessions = [baseSession({ id: 'legacy' })];
    const result = filterSessions(sessions, '');
    expect(result).toHaveLength(1);
  });
});
