import { describe, expect, it } from 'vitest';

import type { AgentChatStreamingState } from './AgentChatStreamingReducers';
import { INITIAL_STATE } from './AgentChatStreamingReducers';
import { mergeReplayState } from './useAgentChatStreaming';

function buildState(overrides: Partial<AgentChatStreamingState>): AgentChatStreamingState {
  return {
    ...INITIAL_STATE,
    isStreaming: true,
    streamingMessageId: 'message-1',
    ...overrides,
  };
}

describe('mergeReplayState', () => {
  it('uses replayed state when no live state exists yet', () => {
    const replayed = buildState({ blocks: [{ kind: 'text', content: 'hello' }], activeTextContent: 'hello' });

    expect(mergeReplayState(INITIAL_STATE, replayed)).toEqual(replayed);
  });

  it('prefers the richer replayed state when a live chunk arrived before replay completed', () => {
    const existing = buildState({ blocks: [{ kind: 'text', content: 'lo' }], activeTextContent: 'lo' });
    const replayed = buildState({
      blocks: [{ kind: 'text', content: 'hello' }],
      activeTextContent: 'hello',
      streamingTokenUsage: { inputTokens: 100, outputTokens: 10 },
    });

    expect(mergeReplayState(existing, replayed)).toEqual(replayed);
  });

  it('keeps an already completed live state instead of regressing to a stale replay', () => {
    const existing = buildState({
      isStreaming: false,
      blocks: [{ kind: 'text', content: 'final answer' }],
      activeTextContent: 'final answer',
    });
    const replayed = buildState({ blocks: [{ kind: 'text', content: 'partial' }], activeTextContent: 'partial' });

    expect(mergeReplayState(existing, replayed)).toEqual(existing);
  });
});
