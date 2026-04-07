import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CHAT_OVERRIDES,
  resolveChatOverridesForThread,
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
});
