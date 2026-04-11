import { describe, expect, it } from 'vitest';

import { findLastUserMessageId } from './AgentChatBodyHelpers';

describe('findLastUserMessageId', () => {
  it('returns null for empty array', () => {
    expect(findLastUserMessageId([])).toBeNull();
  });

  it('returns last user message id', () => {
    const msgs = [
      { id: '1', role: 'user' },
      { id: '2', role: 'assistant' },
      { id: '3', role: 'user' },
    ] as Parameters<typeof findLastUserMessageId>[0];
    expect(findLastUserMessageId(msgs)).toBe('3');
  });

  it('returns null when no user messages', () => {
    const msgs = [
      { id: '1', role: 'assistant' },
    ] as Parameters<typeof findLastUserMessageId>[0];
    expect(findLastUserMessageId(msgs)).toBeNull();
  });
});
