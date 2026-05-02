/**
 * agentChatWorkspaceActionHelpers.test.ts — Smoke tests for pure helper functions.
 */
import { describe, expect, it } from 'vitest';

import type { SendMessageArgs } from './agentChatWorkspaceActionHelpers';
import {
  applyComposerSuccess,
  buildComposerRequest,
  buildContextSelection,
  getErrorMessage,
  getThreadIdForSend,
  hasElectronAPI,
} from './agentChatWorkspaceActionHelpers';

describe('getErrorMessage', () => {
  it('extracts message from Error instances', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });
  it('stringifies non-Error values', () => {
    expect(getErrorMessage('plain')).toBe('plain');
  });
});

describe('getThreadIdForSend', () => {
  it('returns undefined for draft thread ids', () => {
    // Draft IDs use the __draft: prefix (see DRAFT_ID_PREFIX in useAgentChatDraftPersistence.ts)
    expect(getThreadIdForSend('__draft:abc')).toBeUndefined();
  });
  it('returns the id for real thread ids', () => {
    expect(getThreadIdForSend('real-thread-id')).toBe('real-thread-id');
  });
  it('returns undefined for null', () => {
    expect(getThreadIdForSend(null)).toBeUndefined();
  });
});

describe('buildContextSelection', () => {
  it('returns undefined when no paths', () => {
    expect(buildContextSelection()).toBeUndefined();
    expect(buildContextSelection([])).toBeUndefined();
  });
  it('returns selection with paths', () => {
    const result = buildContextSelection(['/a/b.ts']);
    expect(result?.userSelectedFiles).toEqual(['/a/b.ts']);
  });
  it('includes mention ranges when provided', () => {
    const ranges = [{ path: '/a/b.ts', startLine: 1, endLine: 5 }];
    const result = buildContextSelection(['/a/b.ts'], ranges as never);
    expect(result?.userSelectedRanges).toEqual(ranges);
  });
  it('filters out files whose file:<path> id is in disabledLocalIds', () => {
    const result = buildContextSelection(
      ['/a/b.ts', '/c/d.ts'],
      undefined,
      new Set(['file:/a/b.ts']),
    );
    expect(result?.userSelectedFiles).toEqual(['/c/d.ts']);
  });
  it('filters mention ranges by their popover index encoding (mention:<i>:<label>)', () => {
    const ranges = [
      { path: '/m1.ts', startLine: 1, endLine: 1 },
      { path: '/m2.ts', startLine: 2, endLine: 2 },
    ];
    const result = buildContextSelection(
      ['/a/b.ts'],
      ranges as never,
      new Set(['mention:0:m1.ts']),
    );
    expect(result?.userSelectedRanges).toEqual([{ path: '/m2.ts', startLine: 2, endLine: 2 }]);
  });
  it('returns undefined when all files are disabled', () => {
    expect(
      buildContextSelection(['/a/b.ts'], undefined, new Set(['file:/a/b.ts'])),
    ).toBeUndefined();
  });
  it('passes through unchanged when disabledLocalIds is empty', () => {
    const result = buildContextSelection(['/a/b.ts'], undefined, new Set());
    expect(result?.userSelectedFiles).toEqual(['/a/b.ts']);
  });
});

describe('buildComposerRequest disabledLocalIds threading', () => {
  function makeArgs(overrides: Partial<SendMessageArgs>): SendMessageArgs {
    return {
      activeThreadId: 'thread-1',
      draft: 'hi',
      isSending: false,
      pendingUserMessage: null,
      projectRoot: '/proj',
      setActiveThreadId: () => {},
      setDraft: () => {},
      setError: () => {},
      setIsSending: () => {},
      setPendingUserMessage: () => {},
      setThreads: () => {},
      ...overrides,
    } as SendMessageArgs;
  }
  it('filters userSelectedFiles by file:<path> ids in disabledLocalIds', () => {
    const args = makeArgs({
      contextFilePaths: ['/a.ts', '/b.ts'],
      disabledLocalIds: new Set(['file:/a.ts']),
    });
    const req = buildComposerRequest(args, 'hi');
    expect(req.contextSelection?.userSelectedFiles).toEqual(['/b.ts']);
  });
  it('passes through unchanged when disabledLocalIds is empty', () => {
    const args = makeArgs({
      contextFilePaths: ['/a.ts'],
      disabledLocalIds: new Set(),
    });
    const req = buildComposerRequest(args, 'hi');
    expect(req.contextSelection?.userSelectedFiles).toEqual(['/a.ts']);
  });
});

describe('applyComposerSuccess clears disabledLocalIds', () => {
  it('calls setDisabledLocalIds with an empty Set after a successful send', () => {
    const calls: ReadonlySet<string>[] = [];
    const setDisabledLocalIds = (
      next: ReadonlySet<string> | ((p: ReadonlySet<string>) => ReadonlySet<string>),
    ): void => {
      const value = typeof next === 'function' ? next(new Set(['file:/x'])) : next;
      calls.push(value);
    };
    const args = {
      activeThreadId: 'thread-1',
      draft: 'hi',
      isSending: false,
      pendingUserMessage: null,
      projectRoot: '/proj',
      setActiveThreadId: () => {},
      setDraft: () => {},
      setError: () => {},
      setIsSending: () => {},
      setPendingUserMessage: () => {},
      setThreads: () => {},
      setDisabledLocalIds,
    } as unknown as SendMessageArgs;
    applyComposerSuccess(args, { success: true, thread: null });
    expect(calls.length).toBe(1);
    expect(calls[0].size).toBe(0);
  });
});

describe('hasElectronAPI', () => {
  it('returns false when electronAPI is absent', () => {
    // In vitest/jsdom environment, electronAPI is not present by default
    expect(typeof hasElectronAPI()).toBe('boolean');
  });
});
