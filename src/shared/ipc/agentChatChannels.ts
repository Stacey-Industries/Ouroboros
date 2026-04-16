/**
 * shared/ipc/agentChatChannels.ts
 *
 * Agent chat IPC channel constants — self-contained, no imports from main.
 * Shared across main/renderer/preload without process-boundary violations.
 *
 * src/main/agentChat/events.ts re-exports from here so existing main-process
 * imports continue to work without modification.
 */

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
  cancelByThreadId: 'agentChat:cancelByThreadId',
  listMemories: 'agentChat:listMemories',
  createMemory: 'agentChat:createMemory',
  updateMemory: 'agentChat:updateMemory',
  deleteMemory: 'agentChat:deleteMemory',
  getThreadTags: 'agentChat:getThreadTags',
  setThreadTags: 'agentChat:setThreadTags',
  searchThreads: 'agentChat:searchThreads',
  pinThread: 'agentChat:pinThread',
  softDeleteThread: 'agentChat:softDeleteThread',
  restoreDeletedThread: 'agentChat:restoreDeletedThread',
  exportThread: 'agentChat:exportThread',
  importThread: 'agentChat:importThread',
  getThreadCostRollup: 'agentChat:getThreadCostRollup',
  getGlobalCostRollup: 'agentChat:getGlobalCostRollup',
} as const;

export const AGENT_CHAT_EVENT_CHANNELS = {
  thread: 'agentChat:thread',
  message: 'agentChat:message',
  status: 'agentChat:status',
  stream: 'agentChat:stream',
  event: 'agentChat:event',
} as const;

export const AGENT_CHAT_STATUS_NAMES = {
  idle: 'idle',
  submitting: 'submitting',
  running: 'running',
  verifying: 'verifying',
  needsReview: 'needs_review',
  complete: 'complete',
  failed: 'failed',
  cancelled: 'cancelled',
} as const;

export const AGENT_CHAT_EVENT_TYPES = {
  threadUpdated: 'thread_updated',
  messageUpdated: 'message_updated',
  statusChanged: 'status_changed',
  streamChunk: 'stream_chunk',
} as const;

export type AgentChatInvokeChannel =
  (typeof AGENT_CHAT_INVOKE_CHANNELS)[keyof typeof AGENT_CHAT_INVOKE_CHANNELS];

export type AgentChatEventChannel =
  (typeof AGENT_CHAT_EVENT_CHANNELS)[keyof typeof AGENT_CHAT_EVENT_CHANNELS];

export type AgentChatEventType =
  (typeof AGENT_CHAT_EVENT_TYPES)[keyof typeof AGENT_CHAT_EVENT_TYPES];
