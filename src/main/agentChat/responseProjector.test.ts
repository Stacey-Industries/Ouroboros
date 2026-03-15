import { describe, expect, test } from 'vitest'

import { buildAssistantMessageId, buildThreadWithAssistantMessage } from './chatOrchestrationBridgeSupport'
import {
  formatDuration,
  formatToolsSummary,
  projectProviderFailureToAssistantMessage,
  projectProviderResultToAssistantMessage,
} from './responseProjector'
import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types'

describe('projectProviderResultToAssistantMessage', () => {
  test('creates assistant message with response text', () => {
    const result = projectProviderResultToAssistantMessage({
      threadId: 'thread-1',
      messageId: 'msg-1',
      responseText: 'Hello, world!',
      timestamp: 1000,
    })

    expect(result.role).toBe('assistant')
    expect(result.content).toBe('Hello, world!')
    expect(result.id).toBe('msg-1')
    expect(result.threadId).toBe('thread-1')
    expect(result.createdAt).toBe(1000)
  })

  test('handles empty response text', () => {
    const result = projectProviderResultToAssistantMessage({
      threadId: 'thread-1',
      messageId: 'msg-1',
      responseText: '',
      timestamp: 1000,
    })

    expect(result.content).toBe('(No response)')
  })

  test('includes orchestration link when provided', () => {
    const link = { taskId: 't1', sessionId: 's1', attemptId: 'a1' }
    const result = projectProviderResultToAssistantMessage({
      threadId: 'thread-1',
      messageId: 'msg-1',
      responseText: 'Done',
      orchestrationLink: link,
      timestamp: 1000,
    })

    expect(result.orchestration).toEqual(link)
  })

  test('formats cost to 4 decimal places', () => {
    const result = projectProviderResultToAssistantMessage({
      threadId: 'thread-1',
      messageId: 'msg-1',
      responseText: 'Done',
      costUsd: 0.0123456,
      timestamp: 1000,
    })

    expect(result.costSummary).toBe('$0.0123')
  })
})

describe('formatToolsSummary', () => {
  test('formats tools summary with deduplication', () => {
    const tools = [
      { name: 'Read' },
      { name: 'Edit' },
      { name: 'Read' },
      { name: 'Bash' },
    ]

    const summary = formatToolsSummary(tools)
    expect(summary).toBe('Used 4 tools: Read, Edit, Bash')
  })

  test('caps tools summary at 5 names', () => {
    const tools = [
      { name: 'Read' },
      { name: 'Edit' },
      { name: 'Bash' },
      { name: 'Grep' },
      { name: 'Glob' },
      { name: 'Write' },
      { name: 'Search' },
    ]

    const summary = formatToolsSummary(tools)
    expect(summary).toBe('Used 7 tools: Read, Edit, Bash, Grep, Glob and 2 more')
  })

  test('returns empty string for no tools', () => {
    expect(formatToolsSummary([])).toBe('')
  })

  test('handles single tool', () => {
    expect(formatToolsSummary([{ name: 'Read' }])).toBe('Used 1 tool: Read')
  })
})

describe('formatDuration', () => {
  test('formats sub-second as < 1s', () => {
    expect(formatDuration(500)).toBe('< 1s')
    expect(formatDuration(999)).toBe('< 1s')
  })

  test('formats duration in seconds', () => {
    expect(formatDuration(1000)).toBe('1s')
    expect(formatDuration(5500)).toBe('6s')
    expect(formatDuration(30000)).toBe('30s')
  })

  test('formats duration in minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m')
    expect(formatDuration(90000)).toBe('1m 30s')
    expect(formatDuration(125000)).toBe('2m 5s')
  })
})

describe('projectProviderFailureToAssistantMessage', () => {
  test('creates failure message with error', () => {
    const result = projectProviderFailureToAssistantMessage({
      threadId: 'thread-1',
      messageId: 'msg-1',
      errorMessage: 'Provider timed out',
      timestamp: 1000,
    })

    expect(result.role).toBe('assistant')
    expect(result.content).toBe('')
    expect(result.error).toEqual({
      code: 'orchestration_failed',
      message: 'Provider timed out',
      recoverable: true,
    })
  })
})

describe('buildAssistantMessageId', () => {
  test('returns deterministic id from sessionId', () => {
    const id = buildAssistantMessageId(() => 'generated-id', 'session-abc')
    expect(id).toBe('agent-chat:session-abc:assistant')
  })
})

describe('buildThreadWithAssistantMessage', () => {
  const baseThread: AgentChatThreadRecord = {
    version: 1,
    id: 'thread-1',
    workspaceRoot: '/workspace',
    createdAt: 1000,
    updatedAt: 1000,
    title: 'Test',
    status: 'idle',
    messages: [],
  }

  const makeMessage = (id: string, createdAt: number): AgentChatMessageRecord => ({
    id,
    threadId: 'thread-1',
    role: 'assistant',
    content: 'Hello',
    createdAt,
  })

  test('appends new message', () => {
    const msg = makeMessage('msg-1', 2000)
    const result = buildThreadWithAssistantMessage(baseThread, msg)

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toEqual(msg)
    expect(result.updatedAt).toBe(2000)
  })

  test('replaces existing by id', () => {
    const existingMsg = makeMessage('msg-1', 1500)
    const threadWithMsg: AgentChatThreadRecord = {
      ...baseThread,
      messages: [existingMsg],
    }

    const updatedMsg = { ...makeMessage('msg-1', 2000), content: 'Updated' }
    const result = buildThreadWithAssistantMessage(threadWithMsg, updatedMsg)

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].content).toBe('Updated')
    expect(result.updatedAt).toBe(2000)
  })
})
