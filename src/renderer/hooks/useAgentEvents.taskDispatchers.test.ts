import { describe, expect, it, vi } from 'vitest';

import type { HookPayload } from '../types/electron';
import { dispatchTaskCompleted, dispatchTaskCreated } from './useAgentEvents.taskDispatchers';

function makePayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'task_created',
    sessionId: 'sess-1',
    timestamp: 1000,
    ...overrides,
  };
}

describe('dispatchTaskCreated', () => {
  it('dispatches TASK_CREATED with data fields', () => {
    const dispatch = vi.fn();
    const payload = makePayload({
      type: 'task_created',
      data: { task_id: 'task-abc', description: 'Write tests', status: 'pending' },
    });
    dispatchTaskCreated(payload, dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('TASK_CREATED');
    expect(action.task.id).toBe('task-abc');
    expect(action.task.description).toBe('Write tests');
  });

  it('falls back to id field when task_id is missing', () => {
    const dispatch = vi.fn();
    const payload = makePayload({
      data: { id: 'task-xyz', message: 'Do work' },
    });
    dispatchTaskCreated(payload, dispatch);
    const action = dispatch.mock.calls[0][0];
    expect(action.task.id).toBe('task-xyz');
    expect(action.task.description).toBe('Do work');
  });

  it('does not dispatch when no id is available', () => {
    const dispatch = vi.fn();
    dispatchTaskCreated(makePayload({ data: {} }), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('dispatchTaskCompleted', () => {
  it('dispatches TASK_COMPLETED with taskId', () => {
    const dispatch = vi.fn();
    const payload = makePayload({
      type: 'task_completed',
      data: { task_id: 'task-1', status: 'completed' },
    });
    dispatchTaskCompleted(payload, dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('TASK_COMPLETED');
    expect(action.taskId).toBe('task-1');
    expect(action.timestamp).toBe(1000);
  });

  it('does not dispatch when no taskId found', () => {
    const dispatch = vi.fn();
    dispatchTaskCompleted(makePayload({ data: {} }), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
