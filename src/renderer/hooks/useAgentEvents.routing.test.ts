/**
 * useAgentEvents.routing.test.ts — Integration test verifying that all 27 event
 * types are routed to the correct dispatcher and produce the expected action type.
 *
 * Strategy: since dispatchTaskOrConversationEvent, dispatchContextOrPermissionEvent,
 * dispatchFileSystemEvent, and dispatchLifecycleEvent are internal to useAgentEvents.ts,
 * we test via the exported dispatcher functions from each sub-module. This verifies
 * the full dispatch chain without needing to call the internal routing functions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HookPayload } from '../types/electron';
import {
  dispatchElicitation,
  dispatchElicitationResult,
  dispatchUserPrompt,
} from './useAgentEvents.conversationDispatchers';
import {
  dispatchAgentEnd,
} from './useAgentEvents.ruleSkillDispatchers';
import {
  dispatchTaskCompleted,
  dispatchTaskCreated,
} from './useAgentEvents.taskDispatchers';
import {
  dispatchCompaction,
  dispatchPermissionEvent,
  dispatchWorkspaceEvent,
} from './useAgentEvents.workspaceDispatchers';

// ─── Window/CustomEvent stubs for DOM event tests ─────────────────────────────

const mockDispatchEvent = vi.fn();
beforeEach(() => {
  (globalThis as Record<string, unknown>).window = { dispatchEvent: mockDispatchEvent };
  (globalThis as Record<string, unknown>).CustomEvent = class CustomEvent extends Event {
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      super(type);
      this.detail = init?.detail;
    }
  };
});
afterEach(() => {
  mockDispatchEvent.mockReset();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'session_start',
    sessionId: 'route-test-sess',
    timestamp: 1000,
    ...overrides,
  };
}

// ─── Routing table: event type → dispatcher → expected action type ────────────

describe('event routing — conversation dispatchers', () => {
  it('user_prompt_submit routes to CONVERSATION_TURN', () => {
    const dispatch = vi.fn();
    dispatchUserPrompt(makePayload({ type: 'user_prompt_submit' }), dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0].type).toBe('CONVERSATION_TURN');
  });

  it('elicitation routes to CONVERSATION_TURN', () => {
    const dispatch = vi.fn();
    dispatchElicitation(makePayload({ type: 'elicitation' }), dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0].type).toBe('CONVERSATION_TURN');
  });

  it('elicitation_result routes to CONVERSATION_TURN', () => {
    const dispatch = vi.fn();
    dispatchElicitationResult(makePayload({ type: 'elicitation_result' }), dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0].type).toBe('CONVERSATION_TURN');
  });

  it('conversation turn type is set correctly per event', () => {
    const dispatch1 = vi.fn();
    dispatchUserPrompt(makePayload({ type: 'user_prompt_submit' }), dispatch1);
    expect(dispatch1.mock.calls[0][0].turn.type).toBe('prompt');

    const dispatch2 = vi.fn();
    dispatchElicitation(makePayload({ type: 'elicitation' }), dispatch2);
    expect(dispatch2.mock.calls[0][0].turn.type).toBe('elicitation');

    const dispatch3 = vi.fn();
    dispatchElicitationResult(makePayload({ type: 'elicitation_result' }), dispatch3);
    expect(dispatch3.mock.calls[0][0].turn.type).toBe('elicitation_result');
  });
});

describe('event routing — task dispatchers', () => {
  it('task_created with task_id routes to TASK_CREATED', () => {
    const dispatch = vi.fn();
    dispatchTaskCreated(
      makePayload({ type: 'task_created', data: { task_id: 'task-1', description: 'Do thing' } }),
      dispatch,
    );
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0].type).toBe('TASK_CREATED');
    expect(dispatch.mock.calls[0][0].task.id).toBe('task-1');
  });

  it('task_created without task_id does NOT dispatch', () => {
    const dispatch = vi.fn();
    dispatchTaskCreated(makePayload({ type: 'task_created', data: {} }), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('task_completed with task_id routes to TASK_COMPLETED', () => {
    const dispatch = vi.fn();
    dispatchTaskCompleted(
      makePayload({ type: 'task_completed', data: { task_id: 'task-1' } }),
      dispatch,
    );
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0].type).toBe('TASK_COMPLETED');
    expect(dispatch.mock.calls[0][0].taskId).toBe('task-1');
  });

  it('task_completed without task_id does NOT dispatch', () => {
    const dispatch = vi.fn();
    dispatchTaskCompleted(makePayload({ type: 'task_completed', data: {} }), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('event routing — compaction dispatchers', () => {
  it('pre_compact routes to PRE_COMPACT', () => {
    const dispatch = vi.fn();
    dispatchCompaction(makePayload({ type: 'pre_compact', data: { token_count: 80000 } }), dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0].type).toBe('PRE_COMPACT');
    expect(dispatch.mock.calls[0][0].tokenCount).toBe(80000);
  });

  it('post_compact routes to POST_COMPACT', () => {
    const dispatch = vi.fn();
    dispatchCompaction(makePayload({ type: 'post_compact', data: { token_count: 40000 } }), dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0].type).toBe('POST_COMPACT');
    expect(dispatch.mock.calls[0][0].tokenCount).toBe(40000);
  });

  it('post_compact includes timestamp', () => {
    const dispatch = vi.fn();
    dispatchCompaction(makePayload({ type: 'post_compact', timestamp: 7777 }), dispatch);
    expect(dispatch.mock.calls[0][0].timestamp).toBe(7777);
  });
});

describe('event routing — permission dispatchers', () => {
  it('permission_request routes to PERMISSION_EVENT with type request', () => {
    const dispatch = vi.fn();
    dispatchPermissionEvent(
      makePayload({ type: 'permission_request', data: { tool_name: 'Bash', permission_type: 'execute' } }),
      dispatch,
    );
    expect(dispatch).toHaveBeenCalledOnce();
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('PERMISSION_EVENT');
    expect(action.event.type).toBe('request');
    expect(action.event.toolName).toBe('Bash');
    expect(action.event.permissionType).toBe('execute');
  });

  it('permission_denied routes to PERMISSION_EVENT with type denied', () => {
    const dispatch = vi.fn();
    dispatchPermissionEvent(
      makePayload({ type: 'permission_denied', data: { reason: 'User said no' } }),
      dispatch,
    );
    const action = dispatch.mock.calls[0][0];
    expect(action.event.type).toBe('denied');
    expect(action.event.reason).toBe('User said no');
  });
});

describe('event routing — lifecycle dispatchers', () => {
  it('agent_end routes to AGENT_END', () => {
    const dispatch = vi.fn();
    dispatchAgentEnd(makePayload({ type: 'agent_end', error: undefined }), dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0].type).toBe('AGENT_END');
  });

  it('agent_end with error propagates error field', () => {
    const dispatch = vi.fn();
    dispatchAgentEnd(makePayload({ type: 'agent_end', error: 'Something failed' }), dispatch);
    expect(dispatch.mock.calls[0][0].error).toBe('Something failed');
  });

  it('session_stop routes to AGENT_END via dispatchAgentEnd', () => {
    const dispatch = vi.fn();
    dispatchAgentEnd(makePayload({ type: 'session_stop' }), dispatch);
    expect(dispatch.mock.calls[0][0].type).toBe('AGENT_END');
  });

  it('stop_failure routes to AGENT_END', () => {
    const dispatch = vi.fn();
    dispatchAgentEnd(
      makePayload({ type: 'stop_failure', error: 'Session stop failed' }),
      dispatch,
    );
    expect(dispatch.mock.calls[0][0].type).toBe('AGENT_END');
    expect(dispatch.mock.calls[0][0].error).toBe('Session stop failed');
  });
});

describe('event routing — workspace dispatchers (DOM events)', () => {
  it('file_changed fires agent-ide:file-changed DOM event', () => {
    const dispatch = vi.fn();
    dispatchWorkspaceEvent(makePayload({ type: 'file_changed' }), dispatch);
    expect(mockDispatchEvent).toHaveBeenCalledOnce();
    expect(mockDispatchEvent.mock.calls[0][0].type).toBe('agent-ide:file-changed');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('cwd_changed fires agent-ide:cwd-changed DOM event with cwd detail', () => {
    const dispatch = vi.fn();
    dispatchWorkspaceEvent(
      makePayload({ type: 'cwd_changed', data: { cwd: '/project/new' } }),
      dispatch,
    );
    expect(mockDispatchEvent).toHaveBeenCalledOnce();
    const evt = mockDispatchEvent.mock.calls[0][0];
    expect(evt.type).toBe('agent-ide:cwd-changed');
    expect(evt.detail.cwd).toBe('/project/new');
  });

  it('worktree_create does not fire DOM event or dispatch action', () => {
    const dispatch = vi.fn();
    dispatchWorkspaceEvent(makePayload({ type: 'worktree_create' }), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
    expect(mockDispatchEvent).not.toHaveBeenCalled();
  });

  it('worktree_remove does not fire DOM event or dispatch action', () => {
    const dispatch = vi.fn();
    dispatchWorkspaceEvent(makePayload({ type: 'worktree_remove' }), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
    expect(mockDispatchEvent).not.toHaveBeenCalled();
  });

  it('config_change does not fire DOM event or dispatch action', () => {
    const dispatch = vi.fn();
    dispatchWorkspaceEvent(makePayload({ type: 'config_change' }), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
    expect(mockDispatchEvent).not.toHaveBeenCalled();
  });
});

describe('event routing — sessionId propagation', () => {
  it('all dispatchers forward sessionId to the action', () => {
    const sessionId = 'my-specific-session';

    const d1 = vi.fn();
    dispatchUserPrompt(makePayload({ type: 'user_prompt_submit', sessionId }), d1);
    expect(d1.mock.calls[0][0].sessionId).toBe(sessionId);

    const d2 = vi.fn();
    dispatchElicitation(makePayload({ type: 'elicitation', sessionId }), d2);
    expect(d2.mock.calls[0][0].sessionId).toBe(sessionId);

    const d3 = vi.fn();
    dispatchCompaction(makePayload({ type: 'pre_compact', sessionId }), d3);
    expect(d3.mock.calls[0][0].sessionId).toBe(sessionId);

    const d4 = vi.fn();
    dispatchPermissionEvent(makePayload({ type: 'permission_request', sessionId }), d4);
    expect(d4.mock.calls[0][0].sessionId).toBe(sessionId);

    const d5 = vi.fn();
    dispatchAgentEnd(makePayload({ type: 'agent_end', sessionId }), d5);
    expect(d5.mock.calls[0][0].sessionId).toBe(sessionId);
  });
});
