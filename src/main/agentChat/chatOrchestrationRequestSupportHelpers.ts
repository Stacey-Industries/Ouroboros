/**
 * chatOrchestrationRequestSupportHelpers.ts — Internal helpers for request preparation.
 *
 * Extracted from chatOrchestrationRequestSupport.ts to keep the file under the ESLint
 * max-lines limit. Contains context normalization, task-request building, and
 * send-options resolution helpers.
 */

import type { ModelSlotAssignments } from '../config';
import { getConfigValue } from '../config';
import log from '../logger';
import type {
  OrchestrationMode,
  TaskRequest,
  TaskRequestContextSelection,
  TaskRequestMetadata,
} from '../orchestration/types';
import { buildConversationHistory, getAdaptiveBudgets } from './chatOrchestrationHistorySupport';
import type { ResolvedAgentChatSettings } from './settingsResolver';
import { isNonEmptyString } from './threadStoreSupport';
import type {
  AgentChatContextSummary,
  AgentChatMessageSource,
  AgentChatSendMessageRequest,
  AgentChatSettings,
  AgentChatThreadRecord,
} from './types';

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
  /** How the model was selected: 'rule', 'classifier', 'llm', 'user', or undefined (provider default). */
  routedBy?: string;
  /**
   * Router traceId for this send, forwarded from applyRouterOverride.
   * Used by the Phase B context outcome observer to link decisions ↔ outcomes.
   */
  outcomeTraceId?: string;
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
  const normalized: Partial<TaskRequestContextSelection> = {
    userSelectedFiles: uniqueStrings(selection.userSelectedFiles),
    pinnedFiles: uniqueStrings(selection.pinnedFiles),
    includedFiles: uniqueStrings(selection.includedFiles),
    excludedFiles: uniqueStrings(selection.excludedFiles),
  };
  if (selection.userSelectedRanges?.length) {
    normalized.userSelectedRanges = selection.userSelectedRanges;
  }
  return normalized;
}

export function buildContextSummary(
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
// Metadata / origin helper
// ---------------------------------------------------------------------------

export function mapSourceToOrigin(
  source: AgentChatMessageSource | undefined,
): TaskRequestMetadata['origin'] {
  if (source === 'resume') return 'resume';
  if (source === 'api') return 'api';
  return 'panel';
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

export function buildBaseTaskRequest(args: {
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
    skillExpansion: args.request.skillExpansion || undefined,
    metadata: {
      origin: mapSourceToOrigin(args.request.metadata?.source),
      label: args.thread.title,
      requestedAt: args.requestedAt,
    },
  };
}

export function buildTaskRequest(args: {
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
// Provider resume helpers (used by buildTaskRequest)
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
): { canResume: boolean; resumeSessionId: string | undefined; providerChanged: boolean } {
  const lastProvider = thread.latestOrchestration?.provider;
  const providerChanged = !!lastProvider && lastProvider !== provider;
  const resumeSessionId = providerChanged ? undefined : getResumeSessionId(thread, provider);
  return { canResume: !!resumeSessionId, resumeSessionId, providerChanged };
}

function logResumeSkipped(
  thread: AgentChatThreadRecord,
  provider: TaskRequest['provider'],
  model: string,
  info: { providerChanged: boolean; resumeSessionId: string | undefined },
): void {
  log.info('resume skipped:', {
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
// Send options resolution helpers
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
  hasExplicitProviderOverride: boolean,
): string {
  const slots = getConfigValue('modelSlots') as ModelSlotAssignments | undefined;
  const slotDefault = slots?.agentChat || '';
  if (override) return override;
  if (!hasExplicitProviderOverride && slotDefault) return slotDefault;
  return resolveProviderModel(settings, provider) || 'sonnet';
}

/** Resolve effort + permission from overrides or defaults. */
function resolveEffortAndPermission(
  settings: ResolvedAgentChatSettings,
  provider: AgentChatSettings['defaultProvider'],
  overrides: NonNullable<AgentChatSendMessageRequest['overrides']> | undefined,
): { effort: string; permissionMode: string } {
  return {
    effort: overrides?.effort || DEFAULT_CHAT_EFFORT,
    permissionMode: overrides?.permissionMode || resolvePermissionMode(settings, provider),
  };
}

export function buildResolvedOptions(
  settings: ResolvedAgentChatSettings,
  provider: AgentChatSettings['defaultProvider'],
  overrides: NonNullable<AgentChatSendMessageRequest['overrides']> | undefined,
): ResolvedSendOptions {
  const verificationProfile =
    overrides?.verificationProfile ?? settings.defaultVerificationProfile;
  const mode = overrides?.mode ?? DEFAULT_MODE;
  const model = resolveModelWithSlot(overrides?.model, settings, provider, Boolean(overrides?.provider));
  const { effort, permissionMode } = resolveEffortAndPermission(settings, provider, overrides);
  return { provider, verificationProfile, mode, model, effort, permissionMode };
}
