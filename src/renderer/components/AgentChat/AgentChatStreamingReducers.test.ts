import { describe, expect, it } from 'vitest'

import { applyChunk, INITIAL_STATE } from './AgentChatStreamingReducers'

describe('applyChunk', () => {
  it('clears streaming token usage when a complete chunk has no tokenUsage', () => {
    const state = {
      ...INITIAL_STATE,
      isStreaming: true,
      streamingMessageId: 'm1',
      streamingTokenUsage: { inputTokens: 18100, outputTokens: 250 },
    }

    const next = applyChunk(state, {
      threadId: 't1',
      messageId: 'm1',
      type: 'complete',
      timestamp: 1,
    })

    expect(next?.streamingTokenUsage).toBeUndefined()
    expect(next?.isStreaming).toBe(false)
  })

  it('preserves final tokenUsage from the complete chunk after stream ends', () => {
    const state = {
      ...INITIAL_STATE,
      isStreaming: true,
      streamingMessageId: 'm1',
      streamingTokenUsage: { inputTokens: 18100, outputTokens: 250 },
    }

    const next = applyChunk(state, {
      threadId: 't1',
      messageId: 'm1',
      type: 'complete',
      timestamp: 1,
      tokenUsage: { inputTokens: 18500, outputTokens: 300 },
    })

    expect(next?.streamingTokenUsage).toEqual({ inputTokens: 18500, outputTokens: 300 })
    expect(next?.isStreaming).toBe(false)
  })
})
