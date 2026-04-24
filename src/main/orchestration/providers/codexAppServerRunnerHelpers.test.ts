/**
 * Smoke tests for codexAppServerRunnerHelpers.
 *
 * Covers pure helpers: init/turn param builders, thread/turn id parsing,
 * client subscription fallbacks, approval response construction, and sink
 * status emission.
 */

import { describe, expect, it, vi } from 'vitest';

import type { CodexAppServerMessage } from './codexAppServerEventMapper';
import {
  APPROVAL_REQUEST_METHODS,
  buildApprovalResponse,
  buildInitializeParams,
  buildTurnStartParams,
  type CodexAppServerClient,
  emitBridgeStatus,
  parseThreadId,
  parseTurnId,
  shouldAutoApproveServerApproval,
  subscribeToMessages,
  subscribeToServerRequests,
} from './codexAppServerRunnerHelpers';

describe('buildInitializeParams', () => {
  it('returns client info with the expected shape', () => {
    const params = buildInitializeParams();
    expect(params).toHaveProperty('clientInfo');
    const info = (params as { clientInfo: { name: string; title: string; version: string } })
      .clientInfo;
    expect(info.name).toBe('agent_ide');
    expect(typeof info.version).toBe('string');
  });
});

describe('buildTurnStartParams', () => {
  it('wraps the prompt in a text input array', () => {
    const params = buildTurnStartParams({
      cwd: '/work',
      model: 'gpt-5',
      prompt: 'hello',
      settings: { approvalPolicy: 'on-request' } as never,
      threadId: 'thread-1',
    });
    expect(params).toMatchObject({
      approvalPolicy: 'on-request',
      cwd: '/work',
      model: 'gpt-5',
      threadId: 'thread-1',
      input: [{ type: 'text', text: 'hello' }],
    });
  });

  it('maps dangerous bypass settings to never approval policy for app-server turns', () => {
    const params = buildTurnStartParams({
      cwd: '/work',
      model: 'gpt-5',
      prompt: 'hello',
      settings: {
        approvalPolicy: 'on-request',
        dangerouslyBypassApprovalsAndSandbox: true,
        sandbox: 'workspace-write',
      } as never,
      threadId: 'thread-1',
    });

    expect(params).toMatchObject({
      approvalPolicy: 'never',
      dangerouslyBypassApprovalsAndSandbox: true,
      sandbox: 'workspace-write',
    });
  });
});

describe('shouldAutoApproveServerApproval', () => {
  it('auto-approves app-server approval requests for bypass and never approval settings', () => {
    expect(
      shouldAutoApproveServerApproval({
        approvalPolicy: 'on-request',
        dangerouslyBypassApprovalsAndSandbox: true,
      } as never),
    ).toBe(true);
    expect(
      shouldAutoApproveServerApproval({
        approvalPolicy: 'never',
        dangerouslyBypassApprovalsAndSandbox: false,
      } as never),
    ).toBe(true);
  });

  it('does not auto-approve interactive app-server approval requests', () => {
    expect(
      shouldAutoApproveServerApproval({
        approvalPolicy: 'on-request',
        dangerouslyBypassApprovalsAndSandbox: false,
      } as never),
    ).toBe(false);
  });
});

describe('parseThreadId', () => {
  it('reads thread.id from nested object', () => {
    expect(parseThreadId({ thread: { id: 'abc' } })).toBe('abc');
  });

  it('falls back to threadId key', () => {
    expect(parseThreadId({ threadId: 'xyz' })).toBe('xyz');
  });

  it('returns null for unrecognized shapes', () => {
    expect(parseThreadId(null)).toBeNull();
    expect(parseThreadId({})).toBeNull();
    expect(parseThreadId({ thread: 'not-an-object' })).toBeNull();
  });
});

describe('parseTurnId', () => {
  it('reads turn.id from nested object', () => {
    expect(parseTurnId({ turn: { id: 't1' } })).toBe('t1');
  });

  it('falls back to turnId key', () => {
    expect(parseTurnId({ turnId: 't2' })).toBe('t2');
  });

  it('returns null when absent', () => {
    expect(parseTurnId({})).toBeNull();
  });
});

describe('subscribeToMessages', () => {
  it('uses onNotification when available', () => {
    const unsub = vi.fn();
    const onNotification = vi.fn(() => unsub);
    const handler = vi.fn();
    const result = subscribeToMessages(
      { onNotification } as unknown as CodexAppServerClient,
      handler,
    );
    expect(onNotification).toHaveBeenCalledWith(handler);
    expect(result).toBe(unsub);
  });

  it('falls back to onMessage when onNotification is missing', () => {
    const unsub = vi.fn();
    const onMessage = vi.fn(() => unsub);
    const result = subscribeToMessages({ onMessage } as unknown as CodexAppServerClient, vi.fn());
    expect(onMessage).toHaveBeenCalled();
    expect(result).toBe(unsub);
  });

  it('returns a no-op when neither subscription is available', () => {
    const result = subscribeToMessages({} as CodexAppServerClient, vi.fn());
    expect(typeof result).toBe('function');
    expect(() => result()).not.toThrow();
  });
});

describe('subscribeToServerRequests', () => {
  it('delegates to onServerRequest when present', () => {
    const unsub = vi.fn();
    const onServerRequest = vi.fn(() => unsub);
    const result = subscribeToServerRequests(
      { onServerRequest } as unknown as CodexAppServerClient,
      vi.fn(),
    );
    expect(onServerRequest).toHaveBeenCalled();
    expect(result).toBe(unsub);
  });

  it('returns a no-op when onServerRequest is absent', () => {
    const result = subscribeToServerRequests({} as CodexAppServerClient, vi.fn());
    expect(typeof result).toBe('function');
  });
});

describe('buildApprovalResponse', () => {
  it('returns permissions object for permissions approval when accepted', () => {
    const msg: CodexAppServerMessage = {
      method: 'item/permissions/requestApproval',
      params: { permissions: { writeFile: true } },
      id: 1,
    } as unknown as CodexAppServerMessage;

    expect(buildApprovalResponse(msg, true)).toEqual({
      permissions: { writeFile: true },
      scope: 'turn',
    });
  });

  it('returns empty permissions object when declined on permission approval', () => {
    const msg: CodexAppServerMessage = {
      method: 'item/permissions/requestApproval',
      params: { permissions: { writeFile: true } },
      id: 1,
    } as unknown as CodexAppServerMessage;

    expect(buildApprovalResponse(msg, false)).toEqual({ permissions: {}, scope: 'turn' });
  });

  it('returns decision=accept/decline for non-permission approvals', () => {
    const msg: CodexAppServerMessage = {
      method: 'item/commandExecution/requestApproval',
      params: {},
      id: 2,
    } as unknown as CodexAppServerMessage;

    expect(buildApprovalResponse(msg, true)).toEqual({ decision: 'accept' });
    expect(buildApprovalResponse(msg, false)).toEqual({ decision: 'decline' });
  });
});

describe('emitBridgeStatus', () => {
  it('emits a streaming event with the message embedded in textDelta', () => {
    const emit = vi.fn();
    emitBridgeStatus(
      { emit } as never,
      { sessionId: 'sess', provider: 'codex' } as never,
      'hello',
      7,
    );
    expect(emit).toHaveBeenCalledTimes(1);
    const event = emit.mock.calls[0][0];
    expect(event.status).toBe('streaming');
    expect(event.message).toBe('hello');
    expect(event.contentBlock.blockIndex).toBe(7);
    expect(event.contentBlock.textDelta).toContain('hello');
  });
});

describe('APPROVAL_REQUEST_METHODS', () => {
  it('contains the three known approval request methods', () => {
    expect(APPROVAL_REQUEST_METHODS.has('item/commandExecution/requestApproval')).toBe(true);
    expect(APPROVAL_REQUEST_METHODS.has('item/fileChange/requestApproval')).toBe(true);
    expect(APPROVAL_REQUEST_METHODS.has('item/permissions/requestApproval')).toBe(true);
  });
});
