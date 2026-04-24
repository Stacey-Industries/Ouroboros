/**
 * chatOrchestrationRequestSupportHelpers.ts — Internal helpers for request preparation.
 *
 * Extracted from chatOrchestrationRequestSupport.ts to keep the file under the ESLint
 * max-lines limit. Contains context normalization, task-request building, and
 * send-options resolution helpers.
 */

import log from '../logger';
import type {
  OrchestrationMode,
  TaskRequest,
  TaskRequestContextSelection,
  TaskRequestMetadata,
} from '../orchestration/types';
import { buildConversationHistory, getAdaptiveBudgets } from './chatOrchestrationHistorySupport';
import { isNonEmptyString } from './threadStoreSupport';
import type {
  AgentChatContextSummary,
  AgentChatMessageSource,
  AgentChatSendMessageRequest,
  AgentChatSettings,
  AgentChatThreadRecord,
} from './types';

export { buildResolvedOptions } from './chatOrchestrationRequestSupportOptions';

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
  // ── Wave 26 Phase C inference controls ──
  /** Sampling temperature (0.0 – 1.0). Pass-through to provider. */
  temperature?: number;
  /** Maximum output tokens. Pass-through to provider. */
  maxTokens?: number;
  /** Stop sequences. Pass-through to provider. */
  stopSequences?: string[];
  /** Top-p sampling. Pass-through to provider. */
  topP?: number;
  /** Top-k sampling. Pass-through to provider. */
  topK?: number;
  /** JSON schema string for structured output. */
  jsonSchema?: string | null;
  // ── Wave 26 Phase D tool toggles ──
  /**
   * Comma-separated allowedTools string for the Claude Code CLI.
   * Resolved from: session toolOverrides > profile enabledTools > undefined (all tools).
   */
  allowedTools?: string;
}

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

// Wave 26 Phase C: inference control fields extracted to keep buildBaseTaskRequest under 40 lines
function pickInferenceFields(
  resolved: ResolvedSendOptions,
): Pick<
  TaskRequest,
  'temperature' | 'maxTokens' | 'stopSequences' | 'topP' | 'topK' | 'jsonSchema' | 'allowedTools'
> {
  return {
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    stopSequences: resolved.stopSequences,
    topP: resolved.topP,
    topK: resolved.topK,
    jsonSchema: resolved.jsonSchema,
    allowedTools: resolved.allowedTools || undefined,
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
    sessionId: args.thread.id,
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
    ...pickInferenceFields(args.resolved),
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
  const { canResume, resumeSessionId, providerChanged, modelChanged } = resolveResumeInfo(
    args.thread,
    args.resolved.provider,
    currentModel,
  );
  if (!canResume && args.thread.messages.some((m) => m.role === 'assistant')) {
    logResumeSkipped(args.thread, args.resolved.provider, currentModel, {
      providerChanged,
      modelChanged,
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
  currentModel: string,
): {
  canResume: boolean;
  resumeSessionId: string | undefined;
  providerChanged: boolean;
  modelChanged: boolean;
} {
  const lastProvider = thread.latestOrchestration?.provider;
  const providerChanged = !!lastProvider && lastProvider !== provider;
  // Conservative model-change detection: only treat as a change when BOTH sides
  // are non-empty and they differ. Resuming across models reuses cached
  // thinking-block signatures keyed on the prior model, which mismatches on the
  // new one — the CLI rejects the resume or the conversation diverges.
  const previousModel = thread.latestOrchestration?.model ?? '';
  const modelChanged = !!previousModel && !!currentModel && previousModel !== currentModel;
  const shouldInvalidate = providerChanged || modelChanged;
  const resumeSessionId = shouldInvalidate ? undefined : getResumeSessionId(thread, provider);
  return { canResume: !!resumeSessionId, resumeSessionId, providerChanged, modelChanged };
}

function logResumeSkipped(
  thread: AgentChatThreadRecord,
  provider: TaskRequest['provider'],
  model: string,
  info: { providerChanged: boolean; modelChanged: boolean; resumeSessionId: string | undefined },
): void {
  log.info('resume skipped:', {
    resumeSessionId: info.resumeSessionId ?? 'undefined',
    providerChanged: info.providerChanged,
    modelChanged: info.modelChanged,
    currentProvider: provider,
    lastProvider: thread.latestOrchestration?.provider ?? 'undefined',
    currentModel: model || '(empty)',
    previousModel: thread.latestOrchestration?.model ?? '(empty)',
    hasOrchestration: !!thread.latestOrchestration,
    claudeSessionId: thread.latestOrchestration?.claudeSessionId ?? 'undefined',
  });
}
