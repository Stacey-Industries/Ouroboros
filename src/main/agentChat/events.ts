import type { AgentChatEvent, AgentChatThreadStatus } from './types'

export const AGENT_CHAT_INVOKE_CHANNELS = {
  createThread: 'agentChat:createThread',
  deleteThread: 'agentChat:deleteThread',
  loadThread: 'agentChat:loadThread',
  listThreads: 'agentChat:listThreads',
  sendMessage: 'agentChat:sendMessage',
  resumeLatestThread: 'agentChat:resumeLatestThread',
  getLinkedDetails: 'agentChat:getLinkedDetails',
  branchThread: 'agentChat:branchThread',
  getLinkedTerminal: 'agentChat:getLinkedTerminal',
  getBufferedChunks: 'agentChat:getBufferedChunks',
  revertToSnapshot: 'agentChat:revertToSnapshot',
  cancelTask: 'agentChat:cancelTask',
} as const

export const AGENT_CHAT_EVENT_CHANNELS = {
  thread: 'agentChat:thread',
  message: 'agentChat:message',
  status: 'agentChat:status',
  stream: 'agentChat:stream',
  event: 'agentChat:event',
} as const

export const AGENT_CHAT_STATUS_NAMES = {
  idle: 'idle',
  submitting: 'submitting',
  running: 'running',
  verifying: 'verifying',
  needsReview: 'needs_review',
  complete: 'complete',
  failed: 'failed',
  cancelled: 'cancelled',
} as const satisfies Record<string, AgentChatThreadStatus>

export type AgentChatInvokeChannel =
  (typeof AGENT_CHAT_INVOKE_CHANNELS)[keyof typeof AGENT_CHAT_INVOKE_CHANNELS]

export type AgentChatEventChannel =
  (typeof AGENT_CHAT_EVENT_CHANNELS)[keyof typeof AGENT_CHAT_EVENT_CHANNELS]

export const AGENT_CHAT_EVENT_TYPES = {
  threadUpdated: 'thread_updated',
  messageUpdated: 'message_updated',
  statusChanged: 'status_changed',
  streamChunk: 'stream_chunk',
} as const satisfies Record<string, AgentChatEvent['type']>

export type AgentChatEventType =
  (typeof AGENT_CHAT_EVENT_TYPES)[keyof typeof AGENT_CHAT_EVENT_TYPES]
