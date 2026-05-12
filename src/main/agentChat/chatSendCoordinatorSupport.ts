import type {
  AgentChatMessageRecord,
  AgentChatSendMessageRequest,
  AgentChatThreadRecord,
} from '@shared/types/agentChat';
import type {
  CanonicalChatEvent,
  MessageId,
  ThreadId,
  TurnId,
} from '@shared/types/canonicalChatEvent';

import { getConfigValue } from '../config';
import type { ChatPersistenceLayer } from './chatPersistenceLayer';
import type { ChatStateBroadcaster } from './chatStateBroadcaster';
import type { ChatCommandPayload, EventNormalizer } from './eventNormalizer';
import type { IdentityRegistry } from './identityRegistry';
import { resolveAgentChatSettings, type ResolvedAgentChatSettings } from './settingsResolver';
import type { AgentChatThreadStore } from './threadStore';

export type TerminalKind = 'completed' | 'failed' | 'cancelled';

export interface DispatchProviderArgs {
  taskRequest: import('../orchestration/types').TaskRequest;
  threadId: string;
  turnId: TurnId;
  onProgress: (progress: import('../orchestration/types').ProviderProgressEvent) => void;
  onTerminal: (kind: TerminalKind, message?: string) => void;
}

export interface DispatchProviderResult {
  kill: () => void | Promise<void>;
}

export type DispatchProvider = (
  args: DispatchProviderArgs,
) => DispatchProviderResult | Promise<DispatchProviderResult>;

export interface SubmitSendDeps {
  broadcaster: ChatStateBroadcaster;
  registry: IdentityRegistry;
  normalizer: EventNormalizer;
  persistence: ChatPersistenceLayer;
  dispatchProvider?: DispatchProvider;
  threadStore?: AgentChatThreadStore;
  getSettings?: () => ResolvedAgentChatSettings;
  createId?: () => string;
  now?: () => number;
}

export interface ActiveSendRecord {
  dispatch: (event: CanonicalChatEvent) => void;
  eventLog: CanonicalChatEvent[];
  finalized: boolean;
  kill: () => void | Promise<void>;
  messageId: MessageId;
  persistence: ChatPersistenceLayer;
  providerSessionAssigned: boolean;
  registry: IdentityRegistry;
  startedTools: Set<string>;
  threadId: ThreadId;
  turnId: TurnId;
}

const activeSends = new Map<TurnId, ActiveSendRecord>();
const fallbackThreads = new Map<string, AgentChatThreadRecord>();

export function buildSettings(): ResolvedAgentChatSettings {
  return resolveAgentChatSettings({
    agentChatSettings: getConfigValue('agentChatSettings'),
    claudeCliSettings: getConfigValue('claudeCliSettings'),
    codexCliSettings: getConfigValue('codexCliSettings'),
  });
}

export function createThreadStore(threadStore?: AgentChatThreadStore) {
  return threadStore ?? createFallbackThreadStore();
}

export async function findPreviousAssistantMessage(
  threadStore: Pick<AgentChatThreadStore, 'loadThread'>,
  threadId?: string,
): Promise<string | undefined> {
  if (!threadId) return undefined;
  const thread = await threadStore.loadThread(threadId);
  return [...(thread?.messages ?? [])]
    .reverse()
    .find((message) => message.role === 'assistant' && message.content)?.content;
}

function createFallbackThreadStore() {
  return {
    async appendMessage(threadId: string, message: AgentChatMessageRecord) {
      const thread = fallbackThreads.get(threadId);
      if (!thread) throw new Error(`Chat thread not found: ${threadId}`);
      const next = { ...thread, messages: [...thread.messages, message], updatedAt: Date.now() };
      fallbackThreads.set(threadId, next);
      return next;
    },
    async createThread(args: { workspaceRoot: string; title: string }) {
      const now = Date.now();
      const thread: AgentChatThreadRecord = {
        version: 1,
        id: `thread-${now}`,
        workspaceRoot: args.workspaceRoot,
        createdAt: now,
        updatedAt: now,
        title: args.title,
        status: 'idle',
        messages: [],
      };
      fallbackThreads.set(thread.id, thread);
      return thread;
    },
    async loadThread(threadId: string) {
      return fallbackThreads.get(threadId) ?? null;
    },
    async updateThread(threadId: string, patch: Record<string, unknown>) {
      const thread = fallbackThreads.get(threadId);
      if (!thread) throw new Error(`Chat thread not found: ${threadId}`);
      const next = { ...thread, ...patch, updatedAt: Date.now() };
      fallbackThreads.set(threadId, next);
      return next;
    },
  };
}

export function ensureFallbackThread(request: AgentChatSendMessageRequest): void {
  if (!request.threadId || fallbackThreads.has(request.threadId)) return;
  const now = Date.now();
  fallbackThreads.set(request.threadId, {
    version: 1,
    id: request.threadId,
    workspaceRoot: request.workspaceRoot,
    createdAt: now,
    updatedAt: now,
    title: 'Fallback thread',
    status: 'idle',
    messages: [],
  });
}

function resolveModelForEvent(
  settings: ResolvedAgentChatSettings,
  resolved: ReturnType<import('./chatOrchestrationRequestSupport').resolveSendOptions>,
): string {
  if (resolved.model) return resolved.model;
  if (resolved.provider === 'codex') return settings.codexCliSettings.model || 'provider-default';
  return settings.claudeCliSettings.model || 'provider-default';
}

export function resolveCommandPayload(args: {
  preSnapshotHash: string | null;
  request: AgentChatSendMessageRequest;
  resolved: ReturnType<import('./chatOrchestrationRequestSupport').resolveSendOptions>;
  settings: ResolvedAgentChatSettings;
  threadId: ThreadId;
}): ChatCommandPayload {
  const { attachments, contextSelection, metadata, overrides, skillExpansion, workspaceRoot } =
    args.request;
  return {
    attachments,
    contextSelection,
    metadata,
    overrides,
    skillExpansion,
    threadId: args.threadId,
    workspaceRoot,
    content: args.request.content.trim(),
    preSnapshotHash: args.preSnapshotHash,
    resolvedProvider: args.resolved.provider,
    resolvedModel: resolveModelForEvent(args.settings, args.resolved),
    resolvedEffort: args.resolved.effort || null,
    resolvedPermissionMode: args.resolved.permissionMode || null,
  };
}

export function createActiveSendRecord(args: {
  broadcaster: ChatStateBroadcaster;
  commandPayload: ChatCommandPayload;
  messageId: string;
  normalizer: EventNormalizer;
  persistence: ChatPersistenceLayer;
  registry: IdentityRegistry;
  turnId: TurnId;
}): ActiveSendRecord {
  const threadId = args.commandPayload.threadId as ThreadId;
  args.registry.registerTurn(threadId, args.turnId);
  args.persistence.insertAlias({ threadId, turnId: args.turnId, createdAt: Date.now() });
  args.broadcaster.ensureThread(threadId);
  const record: ActiveSendRecord = {
    dispatch: (event) => {
      record.eventLog.push(event);
      args.broadcaster.dispatch(event);
    },
    eventLog: [],
    finalized: false,
    kill: () => undefined,
    messageId: args.messageId as MessageId,
    persistence: args.persistence,
    providerSessionAssigned: false,
    registry: args.registry,
    startedTools: new Set<string>(),
    threadId,
    turnId: args.turnId,
  };
  record.dispatch(args.normalizer.fromCommand(args.commandPayload, args.turnId));
  return record;
}

export function registerActiveSend(record: ActiveSendRecord): void {
  activeSends.set(record.turnId, record);
}

export function removeActiveSend(turnId: TurnId): ActiveSendRecord | undefined {
  const record = activeSends.get(turnId);
  if (record) activeSends.delete(turnId);
  return record;
}
