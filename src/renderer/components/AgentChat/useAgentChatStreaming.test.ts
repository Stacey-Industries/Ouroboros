import { describe, expect, it } from 'vitest';

import type { AgentChatStreamingState } from './AgentChatStreamingReducers';
import { INITIAL_STATE } from './AgentChatStreamingReducers';
import { mergeReplayState, selectStreamingState } from './useAgentChatStreaming';
import type { ChatStateDiffProjection } from './useChatStateDiffProjection';

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
    const replayed = buildState({
      blocks: [{ kind: 'text', content: 'hello' }],
      activeTextContent: 'hello',
    });

    expect(mergeReplayState(INITIAL_STATE, replayed)).toEqual(replayed);
  });

  it('prefers the richer replayed state when a live chunk arrived before replay completed', () => {
    const existing = buildState({
      blocks: [{ kind: 'text', content: 'lo' }],
      activeTextContent: 'lo',
    });
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
    const replayed = buildState({
      blocks: [{ kind: 'text', content: 'partial' }],
      activeTextContent: 'partial',
    });

    expect(mergeReplayState(existing, replayed)).toEqual(existing);
  });
});

describe('selectStreamingState', () => {
  function emptyProjection(): ChatStateDiffProjection {
    return { status: null, accumulatedText: '', activeTurnId: undefined, seq: -1 };
  }

  function projectionWithTurn(turnId: string): ChatStateDiffProjection {
    return {
      status: 'streaming',
      accumulatedText: 'response text',
      activeTurnId: turnId,
      seq: 3,
    };
  }

  it('returns legacyState when projection has no active turn (the smoke-failure case)', () => {
    // Regression test for Wave 86 smoke failure (2026-05-12). When the user
    // sends via the OLD chat IPC handler, the new-path state machine never
    // gets a turn registered, so projection.activeTurnId stays undefined.
    // Without this guard, projectionToStreamingState returns empty state and
    // overrides legacyState → chat UI stalls on the streaming placeholder.
    const legacyState = buildState({
      blocks: [{ kind: 'text', content: 'hello from the legacy path' }],
      activeTextContent: 'hello from the legacy path',
    });
    expect(selectStreamingState(emptyProjection(), legacyState)).toEqual(legacyState);
  });

  it('returns the projection adapter output when projection has an active turn', () => {
    const legacyState = buildState({
      blocks: [{ kind: 'text', content: 'old data' }],
      activeTextContent: 'old data',
    });
    const result = selectStreamingState(projectionWithTurn('turn-1'), legacyState);

    expect(result.activeTextContent).toBe('response text');
    expect(result.streamingMessageId).toBe('turn-1');
    expect(result.isStreaming).toBe(true);
    // The projection wins over the legacy block array.
    expect(result.blocks).toEqual([{ kind: 'text', content: 'response text' }]);
  });

  it('returns INITIAL_STATE-shaped legacy state cleanly when both are empty', () => {
    expect(selectStreamingState(emptyProjection(), INITIAL_STATE)).toEqual(INITIAL_STATE);
  });
});
