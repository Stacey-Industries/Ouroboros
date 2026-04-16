/**
 * preloadSupplementalAgentChatApis.ts — agentChat IPC relay for the preload bridge.
 *
 * Extracted from preloadSupplementalApis.ts to keep that file under the 300-line
 * ESLint limit. Exports `agentChatApi` which is spread into supplementalApis.
 */

import {
  AGENT_CHAT_EVENT_CHANNELS,
  AGENT_CHAT_INVOKE_CHANNELS,
} from '@shared/ipc/agentChatChannels';
import { ipcRenderer } from 'electron';

import type {
  AgentChatAPI,
  AgentChatEvent,
  AgentChatMessageRecord,
  AgentChatStreamChunk,
  AgentChatThreadRecord,
  AgentChatThreadStatusSnapshot,
} from '../renderer/types/electron';

function onChannel<T>(channel: string, callback: (data: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, data: T): void => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const agentChatApi: AgentChatAPI = {
  createThread: (request) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.createThread, request),
  deleteThread: (threadId) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.deleteThread, threadId),
  loadThread: (threadId) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.loadThread, threadId),
  listThreads: (workspaceRoot) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.listThreads, workspaceRoot),
  sendMessage: (request) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.sendMessage, request),
  resumeLatestThread: (workspaceRoot) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.resumeLatestThread, workspaceRoot),
  getLinkedDetails: (link) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.getLinkedDetails, link),
  branchThread: (threadId, fromMessageId) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.branchThread, threadId, fromMessageId),
  getLinkedTerminal: (threadId) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.getLinkedTerminal, threadId),
  getBufferedChunks: (threadId) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.getBufferedChunks, threadId),
  revertToSnapshot: (threadId, messageId) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.revertToSnapshot, threadId, messageId),
  cancelTask: (taskId) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.cancelTask, taskId),
  cancelByThreadId: (threadId) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.cancelByThreadId, threadId),
  listMemories: (workspaceRoot) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.listMemories, workspaceRoot),
  createMemory: (workspaceRoot, entry) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.createMemory, workspaceRoot, entry),
  updateMemory: (workspaceRoot, memoryId, updates) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.updateMemory, workspaceRoot, memoryId, updates),
  deleteMemory: (workspaceRoot, memoryId) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.deleteMemory, workspaceRoot, memoryId),
  getThreadTags: (threadId) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.getThreadTags, threadId),
  setThreadTags: (threadId, tags) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.setThreadTags, threadId, tags),
  searchThreads: (payload) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.searchThreads, payload),
  pinThread: (threadId, pinned) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.pinThread, { threadId, pinned }),
  softDeleteThread: (threadId) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.softDeleteThread, { threadId }),
  restoreDeletedThread: (threadId) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.restoreDeletedThread, { threadId }),
  exportThread: (threadId, format) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.exportThread, threadId, format),
  importThread: (content, format) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.importThread, content, format),
  getThreadCostRollup: (payload) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.getThreadCostRollup, payload),
  getGlobalCostRollup: (payload) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.getGlobalCostRollup, payload),
  getLinkedTerminals: (threadId) =>
    ipcRenderer.invoke(AGENT_CHAT_INVOKE_CHANNELS.getLinkedTerminals, threadId),
  onThreadUpdate: (callback) =>
    onChannel<AgentChatThreadRecord>(AGENT_CHAT_EVENT_CHANNELS.thread, callback),
  onMessageUpdate: (callback) =>
    onChannel<AgentChatMessageRecord>(AGENT_CHAT_EVENT_CHANNELS.message, callback),
  onStatusChange: (callback) =>
    onChannel<AgentChatThreadStatusSnapshot>(AGENT_CHAT_EVENT_CHANNELS.status, callback),
  onStreamChunk: (callback) =>
    onChannel<AgentChatStreamChunk>(AGENT_CHAT_EVENT_CHANNELS.stream, callback),
  onEvent: (callback) =>
    onChannel<AgentChatEvent>(AGENT_CHAT_EVENT_CHANNELS.event, callback),
};
