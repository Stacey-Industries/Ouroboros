import { describe, expect, it } from 'vitest';

import type { AgentSession } from '../../AgentMonitor/types';
import type { WorkbenchTimelineEntry } from './useWorkbenchTimeline';
import {
  appendCompactionEntries,
  appendConversationEntries,
  appendPermissionEntries,
  appendRuleEntries,
  appendSessionLifecycleEntries,
  appendSkillEntries,
  appendTaskEntries,
  appendToolEntries,
  collectSessionEntries,
} from './useWorkbenchTimeline.entries';

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'session-1',
    taskLabel: 'Build feature',
    status: 'complete',
    startedAt: 1_000,
    completedAt: 9_000,
    toolCalls: [],
    inputTokens: 0,
    outputTokens: 0,
    conversationTurns: [],
    compactions: [],
    permissionEvents: [],
    loadedRules: [],
    skillExecutions: [],
    tasks: [],
    ...overrides,
  };
}

const NO_SESSIONS = new Map<string, AgentSession>();

describe('appendSessionLifecycleEntries', () => {
  it('pushes start entry for a running session', () => {
    const session = makeSession({ status: 'running', completedAt: undefined });
    const entries: WorkbenchTimelineEntry[] = [];
    appendSessionLifecycleEntries(session, NO_SESSIONS, entries);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('session-1:session-start');
    expect(entries[0].title).toBe('Session started');
    expect(entries[0].tone).toBe('neutral');
  });

  it('pushes start + end entries for a completed session', () => {
    const session = makeSession({ status: 'complete', completedAt: 9_000 });
    const entries: WorkbenchTimelineEntry[] = [];
    appendSessionLifecycleEntries(session, NO_SESSIONS, entries);
    expect(entries).toHaveLength(2);
    expect(entries[1].id).toBe('session-1:session-end');
    expect(entries[1].title).toBe('Session completed');
    expect(entries[1].tone).toBe('success');
  });

  it('labels a child session as Subagent', () => {
    const session = makeSession({ parentSessionId: 'parent-x' });
    const entries: WorkbenchTimelineEntry[] = [];
    appendSessionLifecycleEntries(session, NO_SESSIONS, entries);
    expect(entries[0].kindLabel).toBe('Subagent');
    expect(entries[0].title).toBe('Subagent started');
  });

  it('includes error text in end detail', () => {
    const session = makeSession({ status: 'error', completedAt: 5_000, error: 'boom' });
    const entries: WorkbenchTimelineEntry[] = [];
    appendSessionLifecycleEntries(session, NO_SESSIONS, entries);
    const end = entries.find((e) => e.id === 'session-1:session-end');
    expect(end?.detail).toContain('boom');
    expect(end?.tone).toBe('error');
  });
});

describe('appendToolEntries', () => {
  it('pushes a tool entry and a subtool entry', () => {
    const session = makeSession({
      toolCalls: [
        {
          id: 'tool-1',
          toolName: 'Bash',
          input: 'npm test',
          timestamp: 3_000,
          status: 'success',
          subTools: [
            {
              id: 'sub-1',
              toolName: 'Read',
              input: 'src/a.ts',
              timestamp: 3_100,
              status: 'success',
            },
          ],
        },
      ],
    });
    const entries: WorkbenchTimelineEntry[] = [];
    appendToolEntries(session, entries);
    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe('tool');
    expect(entries[0].title).toBe('Bash');
    expect(entries[1].kind).toBe('subtool');
    expect(entries[1].title).toBe('Read');
  });
});

describe('appendTaskEntries', () => {
  it('pushes created entry only for incomplete task', () => {
    const session = makeSession({
      tasks: [{ id: 't1', description: 'Do thing', status: 'in_progress', createdAt: 2_000 }],
    });
    const entries: WorkbenchTimelineEntry[] = [];
    appendTaskEntries(session, entries);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Task created');
  });

  it('pushes created + completed entries for completed task', () => {
    const session = makeSession({
      tasks: [
        {
          id: 't2',
          description: 'Do thing',
          status: 'completed',
          createdAt: 2_000,
          completedAt: 4_000,
        },
      ],
    });
    const entries: WorkbenchTimelineEntry[] = [];
    appendTaskEntries(session, entries);
    expect(entries).toHaveLength(2);
    expect(entries[1].title).toBe('Task completed');
    expect(entries[1].tone).toBe('success');
  });
});

describe('appendConversationEntries', () => {
  it('pushes a prompt turn entry', () => {
    const session = makeSession({
      conversationTurns: [{ type: 'prompt', content: 'Hello', timestamp: 1_500 }],
    });
    const entries: WorkbenchTimelineEntry[] = [];
    appendConversationEntries(session, entries);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('User prompt');
    expect(entries[0].kind).toBe('conversation');
  });
});

describe('appendRuleEntries', () => {
  it('pushes a rule loaded entry', () => {
    const session = makeSession({
      loadedRules: [
        {
          filePath: '.claude/rules/test.md',
          name: 'test',
          memoryType: 'Project',
          loadReason: 'startup',
          loadedAt: 1_200,
        },
      ],
    });
    const entries: WorkbenchTimelineEntry[] = [];
    appendRuleEntries(session, entries);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('rule');
    expect(entries[0].title).toBe('Rule loaded');
  });
});

describe('appendSkillEntries', () => {
  it('pushes start and end entries for a completed skill', () => {
    const session = makeSession({
      skillExecutions: [
        {
          skillName: 'Planning',
          agentId: 'agent-1',
          agentType: 'general',
          startedAt: 2_000,
          completedAt: 4_000,
          durationMs: 2_000,
          status: 'completed',
        },
      ],
    });
    const entries: WorkbenchTimelineEntry[] = [];
    appendSkillEntries(session, entries);
    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe('Skill started');
    expect(entries[1].title).toBe('Skill completed');
    expect(entries[1].tone).toBe('success');
  });
});

describe('appendPermissionEntries', () => {
  it('pushes a denied permission entry with error tone', () => {
    const session = makeSession({
      permissionEvents: [
        { type: 'denied', permissionType: 'filesystem', toolName: 'Bash', timestamp: 3_000 },
      ],
    });
    const entries: WorkbenchTimelineEntry[] = [];
    appendPermissionEntries(session, entries);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Permission denied');
    expect(entries[0].tone).toBe('error');
  });
});

describe('appendCompactionEntries', () => {
  it('pushes a compaction entry', () => {
    const session = makeSession({
      compactions: [{ preTokens: 1000, postTokens: 700, timestamp: 5_000 }],
    });
    const entries: WorkbenchTimelineEntry[] = [];
    appendCompactionEntries(session, entries);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('compaction');
    expect(entries[0].detail).toContain('1000');
  });
});

describe('collectSessionEntries', () => {
  it('collects all entry types from a fully-populated session', () => {
    const session = makeSession({
      id: 'full',
      status: 'complete',
      completedAt: 9_000,
      toolCalls: [
        { id: 'tool-1', toolName: 'Read', input: 'f.ts', timestamp: 2_000, status: 'success' },
      ],
      tasks: [
        { id: 't1', description: 'x', status: 'completed', createdAt: 1_100, completedAt: 3_000 },
      ],
      conversationTurns: [{ type: 'prompt', content: 'go', timestamp: 1_050 }],
      loadedRules: [
        {
          filePath: 'r.md',
          name: 'r',
          memoryType: 'Project',
          loadReason: 'startup',
          loadedAt: 1_010,
        },
      ],
      skillExecutions: [
        {
          skillName: 'S',
          agentId: 'a1',
          agentType: 'g',
          startedAt: 1_500,
          status: 'running',
        },
      ],
      permissionEvents: [
        { type: 'request', permissionType: 'fs', toolName: 'Bash', timestamp: 2_500 },
      ],
      compactions: [{ preTokens: 500, postTokens: 300, timestamp: 4_000 }],
    });

    const entries = collectSessionEntries(session, NO_SESSIONS);
    const kinds = entries.map((e) => e.kind);
    expect(kinds).toContain('session');
    expect(kinds).toContain('tool');
    expect(kinds).toContain('task');
    expect(kinds).toContain('conversation');
    expect(kinds).toContain('rule');
    expect(kinds).toContain('skill');
    expect(kinds).toContain('permission');
    expect(kinds).toContain('compaction');
  });
});
