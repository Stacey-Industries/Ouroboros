import type { ModelSlotAssignments } from '../config';
import { getConfigValue } from '../config';
import type {
  OrchestrationMode,
  TaskRequest,
  TaskRequestContextSelection,
  TaskRequestMetadata,
} from '../orchestration/types';
import { buildConversationHistory, getAdaptiveBudgets } from './chatOrchestrationHistorySupport';
import { buildThreadTitle } from './chatTitleDerivation';
import type { ResolvedAgentChatSettings } from './settingsResolver';
import type { AgentChatThreadStore } from './threadStore';
import { isNonEmptyString } from './threadStoreSupport';
import type {
  AgentChatContextSummary,
  AgentChatMessageRecord,
  AgentChatMessageSource,
  AgentChatSendMessageRequest,
  AgentChatSettings,
  AgentChatThreadRecord,
} from './types';

export { deriveSmartTitle, generateLlmTitle } from './chatTitleDerivation';

export interface ResolvedSendOptions {
  mode: OrchestrationMode;
  provider: AgentChatSettings['defaultProvider'];
  verificationProfile: AgentChatSettings['defaultVerificationProfile'];
  /** Model identifier (e.g. 'claude-opus-4-6'). Empty string means provider default. */
  model: string;
  /** Effort level ('low' | 'medium' | 'high' | 'max'). Empty string means default. */
  effort: string;
  /** Permission mode ('default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'). */
  permissionMode: string;
}

export interface PreparedSend {
  messageId: string;
  requestedAt: number;
  taskRequest: TaskRequest;
  thread: AgentChatThreadRecord;
}

const DEFAULT_MODE: OrchestrationMode = 'edit';
const DEFAULT_CHAT_EFFORT = 'medium';

// ---------------------------------------------------------------------------
// Context selection helpers
// ---------------------------------------------------------------------------

function uniqueStrings(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!isNonEmptyString(value)) continue;
    const normalized = value.trim();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function hasExplicitContextSelection(
  sel: Partial<TaskRequestContextSelection> | undefined,
): boolean {
  if (!sel) return false;
  return (
    uniqueStrings(sel.userSelectedFiles).length > 0 ||
    uniqueStrings(sel.pinnedFiles).length > 0 ||
    uniqueStrings(sel.includedFiles).length > 0 ||
    uniqueStrings(sel.excludedFiles).length > 0
  );
}

export function normalizeContextSelection(
  selection: Partial<TaskRequestContextSelection> | undefined,
): Partial<TaskRequestContextSelection> | undefined {
  if (!selection || !hasExplicitContextSelection(selection)) return undefined;
  return {
    userSelectedFiles: uniqueStrings(selection.userSelectedFiles),
    pinnedFiles: uniqueStrings(selection.pinnedFiles),
    includedFiles: uniqueStrings(selection.includedFiles),
    excludedFiles: uniqueStrings(selection.excludedFiles),
  };
}

function buildContextSummary(
  selection: Partial<TaskRequestContextSelection> | undefined,
  usedAdvancedControls: boolean,
): AgentChatContextSummary | undefined {
  const norm = normalizeContextSelection(selection);
  if (!norm && !usedAdvancedControls) return undefined;
  const selectedFileCount = norm
    ? new Set([
        ...(norm.userSelectedFiles ?? []),
        ...(norm.pinnedFiles ?? []),
        ...(norm.includedFiles ?? []),
      ]).size
    : 0;
  return {
    selectedFileCount,
    omittedFileCount: norm?.excludedFiles?.length ?? 0,
    usedAdvancedControls,
  };
}

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

function mapSourceToOrigin(
  source: AgentChatMessageSource | undefined,
): TaskRequestMetadata['origin'] {
  if (source === 'resume') return 'resume';
  if (source === 'api') return 'api';
  return 'panel';
}

function createUserMessage(args: {
  content: string;
  messageId: string;
  request: AgentChatSendMessageRequest;
  requestedAt: number;
  threadId: string;
}): AgentChatMessageRecord {
  const attachmentNames = args.request.attachments?.map((a) => a.name).join(', ');
  const content = attachmentNames
    ? args.content
      ? `${args.content}\n[Attached: ${attachmentNames}]`
      : `[Attached: ${attachmentNames}]`
    : args.content;
  return {
    id: args.messageId,
    threadId: args.threadId,
    role: 'user',
    content,
    createdAt: args.requestedAt,
    contextSummary: buildContextSummary(
      args.request.contextSelection,
      Boolean(args.request.metadata?.usedAdvancedControls),
    ),
  };
}

// ---------------------------------------------------------------------------
// Provider resume helpers
// ---------------------------------------------------------------------------

function getResumeSessionId(
  thread: AgentChatThreadRecord,
  provider: TaskRequest['provider'],
): string | undefined {
  if (thread.latestOrchestration?.provider !== provider) return undefined;
  return provider === 'codex'
    ? thread.latestOrchestration?.codexThreadId
    : thread.latestOrchestration?.claudeSessionId;
}

function resolveResumeInfo(
  thread: AgentChatThreadRecord,
  provider: TaskRequest['provider'],
): {
  canResume: boolean;
  resumeSessionId: string | undefined;
  providerChanged: boolean;
} {
  const lastProvider = thread.latestOrchestration?.provider;
  const providerChanged = !!lastProvider && lastProvider !== provider;
  const resumeSessionId = providerChanged ? undefined : getResumeSessionId(thread, provider);
  return { canResume: !!resumeSessionId, resumeSessionId, providerChanged };
}

function logResumeSkipped(
  thread: AgentChatThreadRecord,
  provider: TaskRequest['provider'],
  model: string,
  info: {
    providerChanged: boolean;
    resumeSessionId: string | undefined;
  },
): void {
  console.log('[agentChat:resume] resume skipped:', {
    resumeSessionId: info.resumeSessionId ?? 'undefined',
    providerChanged: info.providerChanged,
    currentProvider: provider,
    lastProvider: thread.latestOrchestration?.provider ?? 'undefined',
    currentModel: model || '(empty)',
    hasOrchestration: !!thread.latestOrchestration,
    claudeSessionId: thread.latestOrchestration?.claudeSessionId ?? 'undefined',
  });
}

// ---------------------------------------------------------------------------
// Task request builder
// ---------------------------------------------------------------------------

function applyBudgetCap(
  taskRequest: TaskRequest,
  model: string,
  thread: AgentChatThreadRecord,
): TaskRequest {
  const budgets = getAdaptiveBudgets(model, thread);
  if (!budgets.contextPacketMaxTokens) return taskRequest;
  return {
    ...taskRequest,
    budget: { ...taskRequest.budget, maxTokens: budgets.contextPacketMaxTokens },
  };
}

function buildBaseTaskRequest(args: {
  content: string;
  request: AgentChatSendMessageRequest;
  requestedAt: number;
  resolved: ResolvedSendOptions;
  thread: AgentChatThreadRecord;
  currentModel: string;
  canResume: boolean;
  resumeSessionId: string | undefined;
}): TaskRequest {
  return {
    workspaceRoots: [args.thread.workspaceRoot],
    goal: args.content,
    mode: args.resolved.mode,
    provider: args.resolved.provider,
    verificationProfile: args.resolved.verificationProfile,
    model: args.currentModel || undefined,
    effort: args.resolved.effort || undefined,
    permissionMode:
      args.resolved.permissionMode !== 'default' ? args.resolved.permissionMode : undefined,
    contextSelection: normalizeContextSelection(args.request.contextSelection),
    conversationHistory: args.canResume
      ? []
      : buildConversationHistory(args.thread.messages, args.currentModel, args.thread),
    resumeFromSessionId: args.canResume ? args.resumeSessionId : undefined,
    goalAttachments: args.request.attachments?.length ? args.request.attachments : undefined,
    metadata: {
      origin: mapSourceToOrigin(args.request.metadata?.source),
      label: args.thread.title,
      requestedAt: args.requestedAt,
    },
  };
}

function buildTaskRequest(args: {
  content: string;
  request: AgentChatSendMessageRequest;
  requestedAt: number;
  resolved: ResolvedSendOptions;
  thread: AgentChatThreadRecord;
}): TaskRequest {
  const currentModel = args.resolved.model || '';
  const { canResume, resumeSessionId, providerChanged } = resolveResumeInfo(
    args.thread,
    args.resolved.provider,
  );
  if (!canResume && args.thread.messages.some((m) => m.role === 'assistant')) {
    logResumeSkipped(args.thread, args.resolved.provider, currentModel, {
      providerChanged,
      resumeSessionId,
    });
  }
  args.thread.turnCount = (args.thread.turnCount ?? 0) + 1;
  const base = buildBaseTaskRequest({ ...args, currentModel, canResume, resumeSessionId });
  return applyBudgetCap(base, currentModel, args.thread);
}

// ---------------------------------------------------------------------------
// Thread resolution
// ---------------------------------------------------------------------------

async function resolveThreadForSend(args: {
  content: string;
  request: AgentChatSendMessageRequest;
  threadStore: AgentChatThreadStore;
}): Promise<AgentChatThreadRecord> {
  const { content, request, threadStore } = args;
  if (isNonEmptyString(request.threadId)) {
    const thread = await threadStore.loadThread(request.threadId);
    if (!thread) throw new Error(`Chat thread not found: ${request.threadId}`);
    if (thread.workspaceRoot !== request.workspaceRoot) {
      throw new Error(
        `Chat thread ${request.threadId} does not belong to ${request.workspaceRoot}`,
      );
    }
    return thread;
  }
  return threadStore.createThread({
    workspaceRoot: request.workspaceRoot,
    title: buildThreadTitle(content),
  });
}

// ---------------------------------------------------------------------------
// Send options resolution
// ---------------------------------------------------------------------------

function resolveProviderModel(
  settings: ResolvedAgentChatSettings,
  provider: AgentChatSettings['defaultProvider'],
): string {
  return provider === 'codex' ? settings.codexCliSettings.model : settings.claudeCliSettings.model;
}

function resolvePermissionMode(
  settings: ResolvedAgentChatSettings,
  provider: AgentChatSettings['defaultProvider'],
): string {
  return provider === 'codex' ? 'default' : settings.claudeCliSettings.permissionMode || 'default';
}

function resolveModelWithSlot(
  override: string | undefined,
  settings: ResolvedAgentChatSettings,
  provider: AgentChatSettings['defaultProvider'],
): string {
  const slots = getConfigValue('modelSlots') as ModelSlotAssignments | undefined;
  const slotDefault = slots?.agentChat || '';
  return override || slotDefault || resolveProviderModel(settings, provider);
}

function buildResolvedOptions(
  settings: ResolvedAgentChatSettings,
  provider: AgentChatSettings['defaultProvider'],
  overrides: NonNullable<AgentChatSendMessageRequest['overrides']> | undefined,
): ResolvedSendOptions {
  return {
    provider,
    verificationProfile: overrides?.verificationProfile ?? settings.defaultVerificationProfile,
    mode: overrides?.mode ?? DEFAULT_MODE,
    model: resolveModelWithSlot(overrides?.model, settings, provider),
    effort: overrides?.effort || DEFAULT_CHAT_EFFORT,
    permissionMode: overrides?.permissionMode || resolvePermissionMode(settings, provider),
  };
}

export function resolveSendOptions(
  settings: ResolvedAgentChatSettings,
  request: AgentChatSendMessageRequest,
): ResolvedSendOptions {
  const provider = request.overrides?.provider ?? settings.defaultProvider;
  return buildResolvedOptions(settings, provider, request.overrides);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function preparePendingSend(args: {
  content: string;
  createId: () => string;
  now: () => number;
  request: AgentChatSendMessageRequest;
  resolved: ResolvedSendOptions;
  threadStore: AgentChatThreadStore;
}): Promise<PreparedSend> {
  const requestedAt = args.now();
  let thread = await resolveThreadForSend({
    content: args.content,
    request: args.request,
    threadStore: args.threadStore,
  });
  const messageId = args.createId();
  const message = createUserMessage({
    content: args.content,
    messageId,
    request: args.request,
    requestedAt,
    threadId: thread.id,
  });
  thread = await args.threadStore.appendMessage(thread.id, message);
  thread = await args.threadStore.updateThread(thread.id, { status: 'submitting' });
  return {
    messageId,
    requestedAt,
    taskRequest: buildTaskRequest({
      content: args.content,
      request: args.request,
      requestedAt,
      resolved: args.resolved,
      thread,
    }),
    thread,
  };
}

export function validateSendRequest(request: AgentChatSendMessageRequest): string | null {
  if (!isNonEmptyString(request.workspaceRoot))
    return 'A workspace root is required to send a chat message.';
  if (!isNonEmptyString(request.content) && !request.attachments?.length)
    return 'Cannot send an empty chat message.';
  if (request.attachments) {
    const MAX_SIZE = 5 * 1024 * 1024;
    for (const att of request.attachments) {
      if (att.sizeBytes > MAX_SIZE) return `Attachment "${att.name}" exceeds the 5 MB limit.`;
    }
    if (request.attachments.length > 5) return 'You can attach at most 5 images per message.';
  }
  return null;
}
