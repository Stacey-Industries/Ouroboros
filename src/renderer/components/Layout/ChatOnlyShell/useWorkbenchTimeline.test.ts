import { describe, expect, it } from 'vitest';

import type { AgentSession } from '../../AgentMonitor/types';
import { buildWorkbenchTimelineEntries } from './useWorkbenchTimeline';

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

describe('buildWorkbenchTimelineEntries', () => {
  it('collects a deterministic renderer-only timeline from the stored session state', () => {
    const sessions: AgentSession[] = [
      makeSession({
        id: 'parent',
        taskLabel: 'Parent session',
        status: 'complete',
        startedAt: 1_000,
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
                input: 'src/index.ts',
                timestamp: 3_500,
                status: 'success',
              },
            ],
          },
        ],
        conversationTurns: [{ type: 'prompt', content: 'Run tests', timestamp: 2_000 }],
        loadedRules: [
          {
            filePath: '.claude/rules/testing.md',
            name: 'testing',
            memoryType: 'Project',
            loadReason: 'startup',
            loadedAt: 1_500,
          },
        ],
        permissionEvents: [
          {
            type: 'request',
            toolName: 'Bash',
            permissionType: 'filesystem',
            timestamp: 2_500,
          },
        ],
        compactions: [{ preTokens: 1000, postTokens: 720, timestamp: 4_000 }],
        tasks: [
          {
            id: 'task-1',
            description: 'Ship a feature',
            status: 'completed',
            createdAt: 1_200,
            completedAt: 5_000,
          },
        ],
        skillExecutions: [
          {
            skillName: 'Planning',
            agentId: 'agent-1',
            agentType: 'general-purpose',
            startedAt: 1_800,
            completedAt: 4_500,
            durationMs: 2_700,
            status: 'completed',
          },
        ],
      }),
      makeSession({
        id: 'child',
        taskLabel: 'Child session',
        status: 'error',
        parentSessionId: 'parent',
        startedAt: 2_000,
        completedAt: 6_500,
        error: 'boom',
        toolCalls: [],
        inputTokens: 0,
        outputTokens: 0,
      }),
    ];

    const entries = buildWorkbenchTimelineEntries(sessions);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].id).toBe('parent:session-end');
    expect(entries[0].title).toBe('Session completed');
    expect(entries.find((entry) => entry.id === 'parent:tool:tool-1')).toMatchObject({
      kind: 'tool',
      title: 'Bash',
      detail: 'npm test',
    });
    expect(entries.find((entry) => entry.id === 'parent:tool:tool-1:subtool:sub-1')).toMatchObject({
      kind: 'subtool',
      title: 'Read',
      detail: 'Bash · src/index.ts',
    });
    expect(entries.find((entry) => entry.id === 'parent:task:task-1:completed')).toMatchObject({
      kind: 'task',
      title: 'Task completed',
    });
    expect(
      entries.find((entry) => entry.id === 'parent:rule:0:.claude/rules/testing.md'),
    ).toMatchObject({
      kind: 'rule',
      title: 'Rule loaded',
    });
    expect(entries.find((entry) => entry.id === 'child:session-end')).toMatchObject({
      kind: 'session',
      title: 'Session failed',
      tone: 'error',
    });
  });
});
