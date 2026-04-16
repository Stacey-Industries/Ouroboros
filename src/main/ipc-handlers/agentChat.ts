/**
 * agentChat.ts — IPC handlers for agent chat.
 *
 * Wires the AgentChatService to ipcMain.handle() for all
 * agentChat invoke channels, and forwards events to the renderer.
 *
 * Event forwarding + session projection live in agentChatEventForwarders.ts.
 */

import { ipcMain } from 'electron';

import {
  AGENT_CHAT_INVOKE_CHANNELS,
  type AgentChatService,
  createAgentChatService,
} from '../agentChat';
import { type SessionMemoryEntry, sessionMemoryStore } from '../agentChat/sessionMemory';
import type {
  AgentChatCreateThreadRequest,
  AgentChatOrchestrationLink,
  AgentChatSendMessageRequest,
} from '../agentChat/types';
import { getLinkedSessionIds } from '../pty';
import {
  invalidateSnapshotCache,
  loadPersistedContextCache,
  startContextRefreshTimer,
  stopContextRefreshTimer,
  terminateContextWorker,
  warmSnapshotCache,
} from './agentChatContext';
import { registerCostRollupHandlers } from './agentChatCost';
import { registerEventForwarders } from './agentChatEventForwarders';
import { registerExportImportHandlers } from './agentChatExportImport';
import { registerForkHandlers } from './agentChatFork';
import { createMinimalOrchestration, type MinimalOrchestration } from './agentChatOrchestration';
import { registerReactionHandlers } from './agentChatReactions';

// Re-export public API consumed by other modules (files.ts, git.ts, etc.)
export {
  invalidateSnapshotCache,
  loadPersistedContextCache,
  startContextRefreshTimer,
  stopContextRefreshTimer,
  terminateContextWorker,
  warmSnapshotCache,
};

let orchestration: MinimalOrchestration | null = null;

function getOrchestration(): MinimalOrchestration {
  if (!orchestration) orchestration = createMinimalOrchestration();
  return orchestration;
}

let service: AgentChatService | null = null;
const cleanupFns: Array<() => void> = [];
let registeredChannels: string[] = [];

function getService(): AgentChatService {
  if (!service) {
    service = createAgentChatService({ orchestration: getOrchestration() });
  }
  return service;
}

// ─── Runtime input validation helpers ────────────────────────────────────────

function requireValidString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${name}: expected non-empty string, got ${typeof value}`);
  }
  return value.trim();
}

function requireValidObject(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${name}: expected object, got ${typeof value}`);
  }
  return value as Record<string, unknown>;
}

// ─── Channel registration helper ─────────────────────────────────────────────

function register(
  channels: string[],
  channel: string,
  handler: (...args: unknown[]) => unknown,
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      return await handler(...args);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  channels.push(channel);
}

// ─── Sub-registrars ───────────────────────────────────────────────────────────

function registerThreadHandlers(channels: string[], svc: AgentChatService): void {
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.createThread, (request: unknown) => {
    const obj = requireValidObject(request, 'createThread request');
    requireValidString(obj.workspaceRoot, 'workspaceRoot');
    return svc.createThread(request as AgentChatCreateThreadRequest);
  });
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.deleteThread, (threadId: unknown) =>
    svc.deleteThread(requireValidString(threadId, 'threadId')),
  );
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.loadThread, (threadId: unknown) =>
    svc.loadThread(requireValidString(threadId, 'threadId')),
  );
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.listThreads, (workspaceRoot: unknown) =>
    svc.listThreads(workspaceRoot as string | undefined),
  );
  register(
    channels,
    AGENT_CHAT_INVOKE_CHANNELS.branchThread,
    (threadId: unknown, fromMessageId: unknown) =>
      svc.branchThread(
        requireValidString(threadId, 'threadId'),
        requireValidString(fromMessageId, 'fromMessageId'),
      ),
  );
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.resumeLatestThread, (workspaceRoot: unknown) =>
    svc.resumeLatestThread(requireValidString(workspaceRoot, 'workspaceRoot')),
  );
  register(
    channels,
    AGENT_CHAT_INVOKE_CHANNELS.revertToSnapshot,
    (threadId: unknown, messageId: unknown) =>
      svc.revertToSnapshot(
        requireValidString(threadId, 'threadId'),
        requireValidString(messageId, 'messageId'),
      ),
  );
  registerReRunHandler(channels, svc);
}

type RerunOv = { model?: string; effort?: string; permissionMode?: string };

function castRerunOverrides(v: unknown): RerunOv | undefined {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as RerunOv) : undefined;
}

function registerReRunHandler(channels: string[], svc: AgentChatService): void {
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.reRunFromMessage,
    (threadId: unknown, messageId: unknown, overrides: unknown) => svc.reRunFromMessage(
      requireValidString(threadId, 'threadId'),
      requireValidString(messageId, 'messageId'),
      castRerunOverrides(overrides),
    ),
  );
}

function registerMessageHandlers(channels: string[], svc: AgentChatService): void {
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.sendMessage, (request: unknown) => {
    const obj = requireValidObject(request, 'sendMessage request');
    requireValidString(obj.content, 'content');
    return svc.sendMessage(request as AgentChatSendMessageRequest);
  });
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.getLinkedDetails, (link: unknown) => {
    requireValidObject(link, 'getLinkedDetails link');
    return svc.getLinkedDetails(link as AgentChatOrchestrationLink);
  });
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.getBufferedChunks, (threadId: unknown) =>
    svc.getBufferedChunks(requireValidString(threadId, 'threadId')),
  );
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.cancelTask, (taskId: unknown) =>
    getOrchestration().cancelTask(requireValidString(taskId, 'taskId')),
  );
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.cancelByThreadId, (threadId: unknown) => {
    const id = requireValidString(threadId, 'threadId');
    const taskId = svc.bridge.findTaskIdForThread(id);
    if (taskId) return getOrchestration().cancelTask(taskId);
    svc.bridge.registerPendingCancel(id);
    return { success: true };
  });
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.getLinkedTerminal, (threadId: unknown) =>
    getLinkedTerminalHandler(svc, requireValidString(threadId, 'threadId')),
  );
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.getLinkedTerminals, (threadId: unknown) => ({
    success: true,
    sessionIds: getLinkedSessionIds(requireValidString(threadId, 'threadId')),
  }));
}

function extractLinkFields(link: AgentChatOrchestrationLink | null | undefined) {
  if (!link) return { provider: null, claudeSessionId: null, codexThreadId: null, linkedTerminalId: null };
  return {
    provider: link.provider ?? null,
    claudeSessionId: link.claudeSessionId ?? null,
    codexThreadId: link.codexThreadId ?? null,
    linkedTerminalId: link.linkedTerminalId ?? null,
  };
}

async function getLinkedTerminalHandler(svc: AgentChatService, threadId: string) {
  const result = await svc.loadThread(threadId);
  if (!result.success || !result.thread)
    return { success: false, error: result.error ?? 'Thread not found' };
  return { success: true, ...extractLinkFields(result.thread.latestOrchestration) };
}

function registerMemoryHandlers(channels: string[]): void {
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.listMemories, async (workspaceRoot: unknown) => {
    const root = requireValidString(workspaceRoot, 'workspaceRoot');
    return { success: true, memories: await sessionMemoryStore.loadMemories(root) };
  });
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.createMemory, handleCreateMemory);
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.updateMemory, handleUpdateMemory);
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.deleteMemory, handleDeleteMemory);
}

async function handleCreateMemory(workspaceRoot: unknown, entry: unknown) {
  const root = requireValidString(workspaceRoot, 'workspaceRoot');
  const obj = requireValidObject(entry, 'memory entry');
  const newEntry = sessionMemoryStore.createEntry('manual', {
    type: (obj.type as SessionMemoryEntry['type']) || 'preference',
    content: requireValidString(obj.content, 'content'),
    relevantFiles: Array.isArray(obj.relevantFiles) ? (obj.relevantFiles as string[]) : [],
  });
  await sessionMemoryStore.saveMemories(root, [newEntry]);
  return { success: true, memory: newEntry };
}

async function handleUpdateMemory(workspaceRoot: unknown, memoryId: unknown, updates: unknown) {
  const root = requireValidString(workspaceRoot, 'workspaceRoot');
  const id = requireValidString(memoryId, 'memoryId');
  const obj = requireValidObject(updates, 'updates');
  const updated = await sessionMemoryStore.updateEntry(
    root,
    id,
    obj as Partial<Pick<SessionMemoryEntry, 'content' | 'type' | 'relevantFiles'>>,
  );
  if (!updated) return { success: false, error: 'Memory not found' };
  return { success: true, memory: updated };
}

async function handleDeleteMemory(workspaceRoot: unknown, memoryId: unknown) {
  const root = requireValidString(workspaceRoot, 'workspaceRoot');
  const id = requireValidString(memoryId, 'memoryId');
  const deleted = await sessionMemoryStore.deleteEntry(root, id);
  if (!deleted) return { success: false, error: 'Memory not found' };
  return { success: true };
}

function registerTagHandlers(channels: string[], svc: AgentChatService): void {
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.getThreadTags, async (threadId: unknown) => {
    const id = requireValidString(threadId, 'threadId');
    const tags = await svc.threadStore.getTags(id);
    return { success: true, tags };
  });
  register(
    channels,
    AGENT_CHAT_INVOKE_CHANNELS.setThreadTags,
    async (threadId: unknown, tags: unknown) => {
      const id = requireValidString(threadId, 'threadId');
      if (!Array.isArray(tags)) throw new Error('Invalid tags: expected array');
      await svc.threadStore.setTags(id, tags as string[]);
      return { success: true };
    },
  );
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.searchThreads, (payload: unknown) => {
    const obj = requireValidObject(payload, 'searchThreads payload');
    const query = requireValidString(obj.query, 'query');
    const limit = typeof obj.limit === 'number' ? obj.limit : undefined;
    const threadId = typeof obj.threadId === 'string' ? obj.threadId : undefined;
    const results = svc.threadStore.searchThreads(query, { limit, threadId });
    return { success: true, results };
  });
}

function registerPinDeleteHandlers(channels: string[], svc: AgentChatService): void {
  register(
    channels,
    AGENT_CHAT_INVOKE_CHANNELS.pinThread,
    async (payload: unknown) => {
      const obj = requireValidObject(payload, 'pinThread payload');
      const id = requireValidString(obj.threadId, 'threadId');
      const pinned = Boolean(obj.pinned);
      await svc.threadStore.pinThread(id, pinned);
      return { success: true };
    },
  );
  register(
    channels,
    AGENT_CHAT_INVOKE_CHANNELS.softDeleteThread,
    async (payload: unknown) => {
      const obj = requireValidObject(payload, 'softDeleteThread payload');
      const id = requireValidString(obj.threadId, 'threadId');
      await svc.threadStore.softDeleteThread(id);
      return { success: true };
    },
  );
  register(
    channels,
    AGENT_CHAT_INVOKE_CHANNELS.restoreDeletedThread,
    async (payload: unknown) => {
      const obj = requireValidObject(payload, 'restoreDeletedThread payload');
      const id = requireValidString(obj.threadId, 'threadId');
      await svc.threadStore.restoreDeletedThread(id);
      return { success: true };
    },
  );
}

// ─── Main registration entry point ───────────────────────────────────────────

export function registerAgentChatHandlers(): string[] {
  if (cleanupFns.length > 0) {
    for (const fn of cleanupFns) fn();
    cleanupFns.length = 0;
  }

  const channels: string[] = [];
  const svc = getService();

  registerThreadHandlers(channels, svc);
  registerMessageHandlers(channels, svc);
  registerMemoryHandlers(channels);
  registerTagHandlers(channels, svc);
  registerPinDeleteHandlers(channels, svc);
  registerCostRollupHandlers({ channels, svc, register, requireValidString, requireValidObject });
  registerReactionHandlers({ channels, svc, register, requireValidString });
  registerForkHandlers({ channels, svc, register, requireValidString, requireValidObject });
  registerExportImportHandlers({ channels, svc, register, requireValidString, exportChannel: AGENT_CHAT_INVOKE_CHANNELS.exportThread, importChannel: AGENT_CHAT_INVOKE_CHANNELS.importThread });
  registerEventForwarders(svc, getOrchestration(), cleanupFns);

  registeredChannels = channels;
  return channels;
}

export function cleanupAgentChatHandlers(): void {
  for (const fn of cleanupFns) fn();
  cleanupFns.length = 0;
  for (const channel of registeredChannels) ipcMain.removeHandler(channel);
  registeredChannels = [];
  stopContextRefreshTimer();
  terminateContextWorker();
  // NOTE: service and orchestration are intentionally preserved across window
  // close/reopen to keep the bridge's buffered stream chunks + onProviderEvent
  // subscription alive. registerAgentChatHandlers re-attaches IPC forwarders on
  // reopen; the renderer replays buffered chunks via getBufferedChunks().
}
