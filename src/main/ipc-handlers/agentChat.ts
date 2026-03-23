/**
 * agentChat.ts — IPC handlers for agent chat.
 *
 * Wires the AgentChatService to ipcMain.handle() for all
 * agentChat invoke channels, and forwards events to the renderer.
 */

import { type BrowserWindow, ipcMain } from 'electron';

import {
  AGENT_CHAT_EVENT_CHANNELS,
  AGENT_CHAT_INVOKE_CHANNELS,
  type AgentChatService,
  createAgentChatService,
} from '../agentChat';
import {
  buildAgentChatOrchestrationLink,
  mapOrchestrationStatusToAgentChatStatus,
} from '../agentChat/chatOrchestrationBridgeSupport';
import { projectAgentChatSession } from '../agentChat/eventProjector';
import { type SessionMemoryEntry, sessionMemoryStore } from '../agentChat/sessionMemory';
import { agentChatThreadStore } from '../agentChat/threadStore';
import type {
  AgentChatCreateThreadRequest,
  AgentChatOrchestrationLink,
  AgentChatSendMessageRequest,
} from '../agentChat/types';
import { broadcastToWebClients } from '../web/webServer';
import {
  invalidateSnapshotCache,
  loadPersistedContextCache,
  startContextRefreshTimer,
  stopContextRefreshTimer,
  terminateContextWorker,
  warmSnapshotCache,
} from './agentChatContext';
import { createMinimalOrchestration, type MinimalOrchestration } from './agentChatOrchestration';

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
}

async function getLinkedTerminalHandler(svc: AgentChatService, threadId: string) {
  const result = await svc.loadThread(threadId);
  if (!result.success || !result.thread)
    return { success: false, error: result.error ?? 'Thread not found' };
  const link = result.thread.latestOrchestration;
  return { success: true, ...formatLinkedTerminal(link) };
}

function formatLinkedTerminal(link: AgentChatOrchestrationLink | null | undefined) {
  return {
    provider: link?.provider ?? null,
    claudeSessionId: link?.claudeSessionId ?? null,
    codexThreadId: link?.codexThreadId ?? null,
    linkedTerminalId: link?.linkedTerminalId ?? null,
  };
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
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.getLinkedTerminal, (threadId: unknown) =>
    getLinkedTerminalHandler(svc, requireValidString(threadId, 'threadId')),
  );
}

function registerMemoryHandlers(channels: string[]): void {
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.listMemories, async (workspaceRoot: unknown) => {
    const root = requireValidString(workspaceRoot, 'workspaceRoot');
    return { success: true, memories: await sessionMemoryStore.loadMemories(root) };
  });
  register(
    channels,
    AGENT_CHAT_INVOKE_CHANNELS.createMemory,
    async (workspaceRoot: unknown, entry: unknown) => {
      const root = requireValidString(workspaceRoot, 'workspaceRoot');
      const obj = requireValidObject(entry, 'memory entry');
      const newEntry = sessionMemoryStore.createEntry('manual', {
        type: (obj.type as SessionMemoryEntry['type']) || 'preference',
        content: requireValidString(obj.content, 'content'),
        relevantFiles: Array.isArray(obj.relevantFiles) ? (obj.relevantFiles as string[]) : [],
      });
      await sessionMemoryStore.saveMemories(root, [newEntry]);
      return { success: true, memory: newEntry };
    },
  );
  register(
    channels,
    AGENT_CHAT_INVOKE_CHANNELS.updateMemory,
    async (workspaceRoot: unknown, memoryId: unknown, updates: unknown) => {
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
    },
  );
  register(
    channels,
    AGENT_CHAT_INVOKE_CHANNELS.deleteMemory,
    async (workspaceRoot: unknown, memoryId: unknown) => {
      const root = requireValidString(workspaceRoot, 'workspaceRoot');
      const id = requireValidString(memoryId, 'memoryId');
      const deleted = await sessionMemoryStore.deleteEntry(root, id);
      if (!deleted) return { success: false, error: 'Memory not found' };
      return { success: true };
    },
  );
}

// ─── Session event projection ─────────────────────────────────────────────────

type SafeSend = (channel: string | undefined, data: unknown) => void;

async function projectAndSendSessionUpdate(
  svc: AgentChatService,
  session: Parameters<Parameters<MinimalOrchestration['onSessionUpdate']>[0]>[0],
  safeSend: SafeSend,
): Promise<void> {
  const threadId =
    svc.bridge.findThreadIdForSession(session.id) ??
    svc.bridge.findThreadIdForSession(session.taskId);
  if (!threadId) return;
  const threadResult = await svc.loadThread(threadId);
  const linkedThread = threadResult.success ? threadResult.thread : undefined;
  if (!linkedThread) return;

  const activeThreadIds = svc.bridge.getActiveThreadIds();
  const isActivelyStreaming = activeThreadIds.includes(linkedThread.id);

  const projected = await projectAgentChatSession({
    session,
    thread: linkedThread,
    threadStore: agentChatThreadStore,
  });

  if (projected.changed && !isActivelyStreaming) {
    safeSend(AGENT_CHAT_EVENT_CHANNELS.thread, projected.thread);
  }

  const link = buildAgentChatOrchestrationLink(session);
  safeSend(AGENT_CHAT_EVENT_CHANNELS.status, {
    threadId: linkedThread.id,
    workspaceRoot: linkedThread.workspaceRoot,
    status: mapOrchestrationStatusToAgentChatStatus(session.status),
    latestMessageId: projected.latestMessageId,
    latestOrchestration: link,
    updatedAt: projected.thread.updatedAt,
  });
}

function registerEventForwarders(svc: AgentChatService, win: BrowserWindow): void {
  const safeSend: SafeSend = (channel, data) => {
    if (channel && !win.isDestroyed()) win.webContents.send(channel, data);
    if (channel) broadcastToWebClients(channel, data);
  };

  const orch = getOrchestration();
  cleanupFns.push(
    orch.onSessionUpdate((session) => {
      void (async () => {
        try {
          await projectAndSendSessionUpdate(svc, session, safeSend);
        } catch (error) {
          console.error('[agentChat] session-update projection failed:', error);
        }
      })();
    }),
  );
  cleanupFns.push(
    svc.bridge.onStreamChunk((chunk) => {
      safeSend(AGENT_CHAT_EVENT_CHANNELS.stream, chunk);
    }),
  );
}

// ─── Main registration entry point ───────────────────────────────────────────

export function registerAgentChatHandlers(win?: BrowserWindow): string[] {
  if (cleanupFns.length > 0) {
    for (const fn of cleanupFns) fn();
    cleanupFns.length = 0;
  }

  const channels: string[] = [];
  const svc = getService();

  registerThreadHandlers(channels, svc);
  registerMessageHandlers(channels, svc);
  registerMemoryHandlers(channels);

  if (win) registerEventForwarders(svc, win);

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
  service = null;
  orchestration = null;
}
