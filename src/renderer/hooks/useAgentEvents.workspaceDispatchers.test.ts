import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HookPayload } from '../types/electron';
import {
  dispatchCompaction,
  dispatchPermissionEvent,
  dispatchWorkspaceEvent,
} from './useAgentEvents.workspaceDispatchers';

// Vitest runs in Node environment — stub window + CustomEvent for DOM event tests
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

function makePayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'pre_compact',
    sessionId: 'sess-1',
    timestamp: 3000,
    ...overrides,
  };
}

describe('dispatchCompaction', () => {
  it('dispatches PRE_COMPACT for pre_compact', () => {
    const dispatch = vi.fn();
    dispatchCompaction(
      makePayload({ type: 'pre_compact', data: { token_count: 5000 } }),
      dispatch,
    );
    expect(dispatch).toHaveBeenCalledOnce();
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('PRE_COMPACT');
    expect(action.tokenCount).toBe(5000);
  });

  it('dispatches POST_COMPACT for post_compact', () => {
    const dispatch = vi.fn();
    dispatchCompaction(
      makePayload({ type: 'post_compact', data: { token_count: 1200 } }),
      dispatch,
    );
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('POST_COMPACT');
    expect(action.tokenCount).toBe(1200);
  });

  it('defaults token count to 0 when missing', () => {
    const dispatch = vi.fn();
    dispatchCompaction(makePayload({ data: {} }), dispatch);
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('PRE_COMPACT');
    expect(action.tokenCount).toBe(0);
  });
});

describe('dispatchPermissionEvent', () => {
  it('dispatches PERMISSION_EVENT for permission_request', () => {
    const dispatch = vi.fn();
    dispatchPermissionEvent(
      makePayload({
        type: 'permission_request',
        data: { tool_name: 'Bash', permission_type: 'execute' },
      }),
      dispatch,
    );
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('PERMISSION_EVENT');
    expect(action.event.type).toBe('request');
    expect(action.event.toolName).toBe('Bash');
  });

  it('dispatches PERMISSION_EVENT for permission_denied', () => {
    const dispatch = vi.fn();
    dispatchPermissionEvent(
      makePayload({
        type: 'permission_denied',
        data: { reason: 'User rejected' },
      }),
      dispatch,
    );
    const action = dispatch.mock.calls[0][0];
    expect(action.event.type).toBe('denied');
    expect(action.event.reason).toBe('User rejected');
  });
});

describe('dispatchWorkspaceEvent', () => {
  it('fires agent-ide:file-changed DOM event for file_changed', () => {
    const dispatch = vi.fn();
    dispatchWorkspaceEvent(makePayload({ type: 'file_changed' }), dispatch);
    expect(mockDispatchEvent).toHaveBeenCalledOnce();
    expect(mockDispatchEvent.mock.calls[0][0].type).toBe('agent-ide:file-changed');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('fires agent-ide:cwd-changed with detail for cwd_changed', () => {
    const dispatch = vi.fn();
    dispatchWorkspaceEvent(
      makePayload({ type: 'cwd_changed', data: { cwd: '/new/path' } }),
      dispatch,
    );
    expect(mockDispatchEvent).toHaveBeenCalledOnce();
    const event = mockDispatchEvent.mock.calls[0][0];
    expect(event.type).toBe('agent-ide:cwd-changed');
    expect(event.detail.cwd).toBe('/new/path');
  });

  it('does not dispatch for worktree_create', () => {
    const dispatch = vi.fn();
    dispatchWorkspaceEvent(makePayload({ type: 'worktree_create' }), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
    expect(mockDispatchEvent).not.toHaveBeenCalled();
  });

  it('logs worktree_remove without dispatching', () => {
    const dispatch = vi.fn();
    dispatchWorkspaceEvent(makePayload({ type: 'worktree_remove' }), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
    expect(mockDispatchEvent).not.toHaveBeenCalled();
  });

  it('logs config_change without dispatching', () => {
    const dispatch = vi.fn();
    dispatchWorkspaceEvent(makePayload({ type: 'config_change' }), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
    expect(mockDispatchEvent).not.toHaveBeenCalled();
  });

  it('fires cwd-changed with new_cwd fallback key', () => {
    const dispatch = vi.fn();
    dispatchWorkspaceEvent(
      makePayload({ type: 'cwd_changed', data: { new_cwd: '/fallback/path' } }),
      dispatch,
    );
    expect(mockDispatchEvent).toHaveBeenCalledOnce();
    const event = mockDispatchEvent.mock.calls[0][0];
    expect(event.type).toBe('agent-ide:cwd-changed');
    expect(event.detail.cwd).toBe('/fallback/path');
  });
});
