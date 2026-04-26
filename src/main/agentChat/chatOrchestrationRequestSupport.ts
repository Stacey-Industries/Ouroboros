import { randomUUID } from 'crypto';

import { getConfigValue } from '../config';
import log from '../logger';
import { logRouterOverride, logRoutingDecision, routePromptSync } from '../router';
import { flushAnnotations, trackChatTurn } from '../router/qualitySignalCollector';
import { shadowRouteChatPrompt } from '../router/routerShadow';
import type { ResolvedSendOptions } from './chatOrchestrationRequestSupportHelpers';
import {
  buildContextSummary,
  buildResolvedOptions,
  buildTaskRequest,
} from './chatOrchestrationRequestSupportHelpers';
import { buildThreadTitle } from './chatTitleDerivation';
import type { ResolvedAgentChatSettings } from './settingsResolver';
import type { AgentChatThreadStore } from './threadStore';
import { isNonEmptyString } from './threadStoreSupport';
import type {
  AgentChatMessageRecord,
  AgentChatSendMessageRequest,
  AgentChatThreadRecord,
} from './types';

export type { ResolvedSendOptions } from './chatOrchestrationRequestSupportHelpers';
export { normalizeContextSelection } from './chatOrchestrationRequestSupportHelpers';
export { deriveSmartTitle, generateLlmTitle } from './chatTitleDerivation';

export interface PreparedSend {
  messageId: string;
  requestedAt: number;
  taskRequest: import('../orchestration/types').TaskRequest;
  thread: AgentChatThreadRecord;
  /** How the model was selected for this send ('rule', 'classifier', 'user', etc.). */
  routedBy?: string;
  /**
   * Router traceId for this send — populated when the router fires and a
   * context packet is built. Forwarded to ActiveStreamContext.outcomeTraceId
   * so the Phase B outcome observer can correlate tool-call touches.
   */
  outcomeTraceId?: string;
}

// ---------------------------------------------------------------------------
// Model router integration
// ---------------------------------------------------------------------------

interface RouterOverrideResult {
  overrides: AgentChatSendMessageRequest['overrides'] | undefined;
  routedBy?: string;
  tier?: string;
  traceId?: string | null;
}

function runShadowRouting(
  request: AgentChatSendMessageRequest,
  previousAssistantMessage: string | undefined,
  routerConfig: ReturnType<typeof getConfigValue<'routerSettings'>>,
): { traceId?: string | null; tier?: string } {
  try {
    shadowRouteChatPrompt({
      prompt: request.content,
      sessionId: request.threadId ?? '',
      workspaceRoot: request.workspaceRoot,
    });
  } catch (err) {
    log.warn('[router:shadow:chat] error during shadow routing:', err);
  }

  const decision = routePromptSync(request.content, previousAssistantMessage, routerConfig);
  const traceId = logRoutingDecision(request.content, decision, {
    interactionType: 'chat',
    workspaceRoot: request.workspaceRoot,
  });
  return { traceId, tier: decision?.tier };
}

function applyOverridePath(
  request: AgentChatSendMessageRequest,
  previousAssistantMessage: string | undefined,
): RouterOverrideResult {
  // Wave 53: even when the user overrides the model, run feature extraction +
  // decision logging in shadow mode so router-decisions.jsonl gets a feature-
  // populated entry on every prompt. The override still wins for model selection.
  const routerConfig = getConfigValue('routerSettings');
  if (!routerConfig?.enabled || routerConfig.shadowMode === false) {
    if (routerConfig?.enabled) {
      // shadow disabled — preserve legacy log-override-if-differs behavior
      const decision = routePromptSync(request.content, previousAssistantMessage, routerConfig);
      if (decision && decision.model !== request.overrides?.model) {
        logRouterOverride(decision.tier, request.overrides!.model!, request.content.slice(0, 100));
      }
    }
    return { overrides: request.overrides, routedBy: 'user-override' };
  }

  const { traceId, tier } = runShadowRouting(request, previousAssistantMessage, routerConfig);
  return { overrides: request.overrides, routedBy: 'user-override', tier, traceId };
}

function applyRouterOverride(
  request: AgentChatSendMessageRequest,
  previousAssistantMessage?: string,
): RouterOverrideResult {
  if (request.overrides?.model) {
    return applyOverridePath(request, previousAssistantMessage);
  }

  const routerConfig = getConfigValue('routerSettings');
  if (!routerConfig?.enabled) return { overrides: request.overrides };

  const { traceId, tier } = runShadowRouting(request, previousAssistantMessage, routerConfig);
  // Re-derive decision for routedBy (shadow already logged it; this is cheap).
  const decision = routePromptSync(request.content, previousAssistantMessage, routerConfig);
  if (!decision) return { overrides: request.overrides, traceId, tier };

  log.info('[router] injecting model override:', decision.model);
  return {
    overrides: { ...request.overrides, model: decision.model },
    routedBy: decision.routedBy,
    tier: decision.tier,
    traceId,
  };
}

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

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
// Public API
// ---------------------------------------------------------------------------

function resolveAutoEffort(tier?: string, model?: string): string {
  if (tier === 'HAIKU') return 'low';
  if (tier === 'OPUS') return 'high';
  if (tier === 'SONNET') return 'medium';
  if (model?.includes('haiku')) return 'low';
  if (model?.includes('opus')) return 'high';
  return 'medium';
}

export function resolveSendOptions(
  settings: ResolvedAgentChatSettings,
  request: AgentChatSendMessageRequest,
  previousAssistantMessage?: string,
): ResolvedSendOptions {
  const provider = request.overrides?.provider ?? settings.defaultProvider;
  const {
    overrides,
    routedBy,
    tier,
    traceId: routerTraceId,
  } = applyRouterOverride(request, previousAssistantMessage);

  // Wave 29.5 Phase B (H1): outcomeTraceId is always set so every send produces
  // training rows regardless of router state. Router-on path uses the router's id
  // (already logged via logRoutingDecision); router-off path mints a fresh UUID.
  const outcomeTraceId = routerTraceId ?? randomUUID();

  // Wave 53: gate quality-signal emission on outcomeTraceId (always set) rather
  // than routerTraceId (often null pre-shadow-mode). This unblocks regenerate /
  // correction detection for every chat turn, not just router-routed ones.
  trackChatTurn({ traceId: outcomeTraceId, threadId: request.threadId, prompt: request.content });
  flushAnnotations();

  const resolved = { ...buildResolvedOptions(settings, provider, overrides), routedBy };
  if (resolved.effort === 'auto') resolved.effort = resolveAutoEffort(tier, resolved.model);
  // Without app-server transport, Codex only supports non-interactive modes.
  // acceptEdits and plan require the app-server IPC channel; clamp to auto.
  if (provider === 'codex') {
    const interactiveModes = new Set(['acceptEdits', 'plan']);
    if (interactiveModes.has(resolved.permissionMode)) {
      const appServerEnabled = getConfigValue('ecosystem')?.codexAppServerTransport === true;
      if (!appServerEnabled) resolved.permissionMode = 'auto';
    }
  }
  resolved.outcomeTraceId = outcomeTraceId;
  return resolved;
}

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
    routedBy: args.resolved.routedBy,
    outcomeTraceId: args.resolved.outcomeTraceId,
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
