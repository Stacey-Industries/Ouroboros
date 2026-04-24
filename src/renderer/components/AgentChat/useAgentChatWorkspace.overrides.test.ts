/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CHAT_OVERRIDES,
  resolveChatOverridesForThread,
  usePerThreadOverrides,
} from './useAgentChatWorkspace.overrides';

describe('resolveChatOverridesForThread', () => {
  it('returns saved overrides when provided', () => {
    const saved = { model: 'sonnet', effort: 'high', permissionMode: 'default' as const };
    const result = resolveChatOverridesForThread({
      activeThreadId: 'thread-1',
      saved,
    });
    expect(result).toBe(saved);
  });

  it('returns defaults for a draft thread (no saved)', () => {
    const result = resolveChatOverridesForThread({
      activeThreadId: null,
    });
    expect(result).toEqual(DEFAULT_CHAT_OVERRIDES);
  });

  it('picks up thread model/effort from active thread when not saved', () => {
    const result = resolveChatOverridesForThread({
      activeThreadId: 'thread-2',
      activeThreadModel: 'claude-3-5-sonnet',
      activeThreadEffort: 'low',
    });
    expect(result.model).toBe('claude-3-5-sonnet');
    expect(result.effort).toBe('low');
  });

  it('falls back to default model when thread model is null', () => {
    const result = resolveChatOverridesForThread({
      activeThreadId: 'thread-3',
      activeThreadModel: null,
      activeThreadEffort: null,
    });
    expect(result.model).toBe(DEFAULT_CHAT_OVERRIDES.model);
    expect(result.effort).toBe(DEFAULT_CHAT_OVERRIDES.effort);
  });

  it('promotes overrides from a generated draft thread id to the persisted thread id', () => {
    const { result, rerender } = renderHook(
      ({ threadId, model, effort }) => usePerThreadOverrides(threadId, model, effort),
      {
        initialProps: {
          threadId: '__draft:123',
          model: null as string | null,
          effort: null as string | null,
        },
      },
    );

    act(() => {
      result.current.setChatOverrides({
        model: 'gpt-5.4',
        effort: 'high',
        permissionMode: 'plan',
        profileId: 'profile-1',
      });
    });

    rerender({
      threadId: 'thread-123',
      model: 'claude-sonnet-4-6',
      effort: 'medium',
    });

    expect(result.current.chatOverrides).toEqual({
      model: 'gpt-5.4',
      effort: 'high',
      permissionMode: 'plan',
      profileId: 'profile-1',
    });
  });
});
