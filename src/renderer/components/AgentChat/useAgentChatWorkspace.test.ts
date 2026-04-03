import { describe, expect, it } from 'vitest';

import type { ChatOverrides } from './ChatControlsBar';
import { resolveChatOverridesForThread } from './useAgentChatWorkspace';

const SAVED_OVERRIDES: ChatOverrides = {
  model: 'gpt-5.4',
  effort: 'high',
  permissionMode: 'auto',
};

describe('resolveChatOverridesForThread', () => {
  it('prefers saved per-thread overrides when present', () => {
    expect(
      resolveChatOverridesForThread({
        activeThreadId: 'thread-1',
        activeThreadModel: 'sonnet',
        saved: SAVED_OVERRIDES,
      }),
    ).toEqual(SAVED_OVERRIDES);
  });

  it('uses the top-of-list default model for draft chats', () => {
    expect(
      resolveChatOverridesForThread({
        activeThreadId: null,
      }),
    ).toEqual({
      model: 'opus[1m]',
      effort: 'medium',
      permissionMode: 'default',
    });
  });

  it('restores the thread model for existing conversations after reload', () => {
    expect(
      resolveChatOverridesForThread({
        activeThreadId: 'thread-1',
        activeThreadModel: 'claude-opus-4-6',
        activeThreadEffort: 'high',
      }),
    ).toEqual({
      model: 'claude-opus-4-6',
      effort: 'high',
      permissionMode: 'default',
    });
  });

  it('falls back to the default model and effort when an existing thread has no saved values', () => {
    expect(
      resolveChatOverridesForThread({
        activeThreadId: 'thread-1',
      }),
    ).toEqual({
      model: 'opus[1m]',
      effort: 'medium',
      permissionMode: 'default',
    });
  });
});
