import { beforeEach, describe, expect, it } from 'vitest';

import {
  _resetWorkspaceStateDedupe,
  forgetThread,
  shouldSendWorkspaceState,
} from './workspaceStateDedupe';

describe('shouldSendWorkspaceState', () => {
  beforeEach(() => {
    _resetWorkspaceStateDedupe();
  });

  it('first call for a thread always returns true', () => {
    expect(shouldSendWorkspaceState('t1', '<workspace_state />')).toBe(true);
  });

  it('returns false on identical second call', () => {
    shouldSendWorkspaceState('t1', '<workspace_state>same</workspace_state>');
    expect(shouldSendWorkspaceState('t1', '<workspace_state>same</workspace_state>')).toBe(false);
  });

  it('returns true when content differs', () => {
    shouldSendWorkspaceState('t1', 'A');
    expect(shouldSendWorkspaceState('t1', 'B')).toBe(true);
  });

  it('isolates per-thread caches', () => {
    shouldSendWorkspaceState('t1', 'X');
    expect(shouldSendWorkspaceState('t2', 'X')).toBe(true);
    expect(shouldSendWorkspaceState('t1', 'X')).toBe(false);
  });

  it('forgetThread re-enables emit', () => {
    shouldSendWorkspaceState('t1', 'X');
    forgetThread('t1');
    expect(shouldSendWorkspaceState('t1', 'X')).toBe(true);
  });

  it('empty threadId always emits (no caching)', () => {
    expect(shouldSendWorkspaceState(undefined, 'X')).toBe(true);
    expect(shouldSendWorkspaceState('', 'X')).toBe(true);
  });

  it('evicts oldest when cap exceeded', () => {
    for (let i = 0; i < 105; i++) {
      shouldSendWorkspaceState(`t${i}`, `body-${i}`);
    }
    expect(shouldSendWorkspaceState('t0', 'body-0')).toBe(true);
    expect(shouldSendWorkspaceState('t104', 'body-104')).toBe(false);
  });
});
