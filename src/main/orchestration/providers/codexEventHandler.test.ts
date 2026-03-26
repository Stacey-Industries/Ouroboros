import { describe, expect, it, vi } from 'vitest'

import { buildCodexEventHandler } from './codexEventHandler'

describe('buildCodexEventHandler', () => {
  it('uses non-cached input tokens for Codex context usage', () => {
    const emit = vi.fn()
    const { getUsage, handler } = buildCodexEventHandler({ emit }, {
      provider: 'codex',
      sessionId: 'session-1',
    })

    handler({
      type: 'turn.completed',
      usage: {
        input_tokens: 18100,
        cached_input_tokens: 8900,
        output_tokens: 250,
      },
    })

    expect(getUsage()).toEqual({ inputTokens: 18100, outputTokens: 250 })
  })
})
