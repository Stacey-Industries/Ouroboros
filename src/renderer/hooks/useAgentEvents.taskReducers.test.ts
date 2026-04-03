import { describe, expect, it } from 'vitest';

import type { AgentState } from './useAgentEvents.helpers';
import {
  reduceTaskCompleted,
  reduceTaskCreated,
  type TaskCompletedAction,
  type TaskCreatedAction,
} from './useAgentEvents.taskReducers';

const BASE_SESSION = {
  id: 'sess-1',
  taskLabel: 'Test session',
  status: 'running' as const,
  startedAt: 1000,
  toolCalls: [],
  inputTokens: 0,
  outputTokens: 0,
};

const BASE_STATE: AgentState = {
  sessions: [BASE_SESSION],
  pendingSubagentLinks: {},
  pendingSubagentTimestamps: [],
};

describe('reduceTaskCreated', () => {
  it('appends a task to an existing session', () => {
    const action: TaskCreatedAction = {
      type: 'TASK_CREATED',
      sessionId: 'sess-1',
      task: {
        id: 'task-1',
        description: 'Do something',
        status: 'pending',
        createdAt: 2000,
      },
    };
    const next = reduceTaskCreated(BASE_STATE, action);
    expect(next.sessions[0].tasks).toHaveLength(1);
    expect(next.sessions[0].tasks?.[0].id).toBe('task-1');
  });

  it('initializes tasks array when undefined', () => {
    const stateNoTasks: AgentState = { ...BASE_STATE, sessions: [{ ...BASE_SESSION }] };
    const action: TaskCreatedAction = {
      type: 'TASK_CREATED',
      sessionId: 'sess-1',
      task: { id: 't1', description: 'x', status: 'pending', createdAt: 1 },
    };
    const next = reduceTaskCreated(stateNoTasks, action);
    expect(next.sessions[0].tasks).toHaveLength(1);
  });

  it('returns same state for unknown sessionId', () => {
    const action: TaskCreatedAction = {
      type: 'TASK_CREATED',
      sessionId: 'unknown',
      task: { id: 't1', description: 'x', status: 'pending', createdAt: 1 },
    };
    const next = reduceTaskCreated(BASE_STATE, action);
    expect(next.sessions[0].tasks).toBeUndefined();
  });
});

describe('reduceTaskCompleted', () => {
  const stateWithTask: AgentState = {
    ...BASE_STATE,
    sessions: [{ ...BASE_SESSION, tasks: [{ id: 'task-1', description: 'Do something', status: 'pending', createdAt: 1000 }] }],
  };

  it('marks task as completed with timestamp', () => {
    const action: TaskCompletedAction = {
      type: 'TASK_COMPLETED',
      sessionId: 'sess-1',
      taskId: 'task-1',
      timestamp: 5000,
    };
    const next = reduceTaskCompleted(stateWithTask, action);
    expect(next.sessions[0].tasks?.[0].status).toBe('completed');
    expect(next.sessions[0].tasks?.[0].completedAt).toBe(5000);
  });

  it('leaves other tasks unchanged', () => {
    const multiTaskState: AgentState = {
      ...BASE_STATE,
      sessions: [{
        ...BASE_SESSION,
        tasks: [
          { id: 'task-1', description: 'A', status: 'pending', createdAt: 1000 },
          { id: 'task-2', description: 'B', status: 'pending', createdAt: 1001 },
        ],
      }],
    };
    const action: TaskCompletedAction = {
      type: 'TASK_COMPLETED', sessionId: 'sess-1', taskId: 'task-1', timestamp: 9000,
    };
    const next = reduceTaskCompleted(multiTaskState, action);
    expect(next.sessions[0].tasks?.[1].status).toBe('pending');
  });
});
