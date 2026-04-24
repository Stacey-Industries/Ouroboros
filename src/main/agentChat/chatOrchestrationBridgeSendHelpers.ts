/**
 * chatOrchestrationBridgeSendHelpers.ts — Low-level send-flow helpers.
 *
 * Extracted from chatOrchestrationBridgeSend.ts to keep file line counts
 * under the ESLint limit. Contains fail helpers and link-inheritance logic.
 */

import log from '../logger';
import {
  buildAgentChatOrchestrationLink,
  buildSendFailureResult,
  createOrchestrationFailure,
  persistThreadLinkage,
} from './chatOrchestrationBridgeSupport';
import type { PreparedSend } from './chatOrchestrationRequestSupport';
import type { AgentChatThreadStore } from './threadStore';
import type { AgentChatOrchestrationLink, AgentChatSendResult } from './types';

export async function failPendingSend(args: {
  error: string;
  link?: AgentChatOrchestrationLink;
  messageId?: string;
  thread?: PreparedSend['thread'];
  threadStore: AgentChatThreadStore;
}): Promise<AgentChatSendResult> {
  if (!args.thread || !args.messageId) {
    return buildSendFailureResult({ error: args.error, orchestration: args.link });
  }
  const thread = await persistThreadLinkage({
    error: createOrchestrationFailure(args.error),
    link: args.link,
    messageId: args.messageId,
    status: 'failed',
    thread: args.thread,
    threadStore: args.threadStore,
  });
  return buildSendFailureResult({
    error: args.error,
    messageId: args.messageId,
    orchestration: args.link,
    thread,
  });
}

export function inheritExistingLinkFields(
  link: AgentChatOrchestrationLink,
  existing: AgentChatOrchestrationLink,
): void {
  if (!link.claudeSessionId && existing.claudeSessionId)
    link.claudeSessionId = existing.claudeSessionId;
  if (!link.codexThreadId && existing.codexThreadId) link.codexThreadId = existing.codexThreadId;
  if (!link.model && existing.model) link.model = existing.model;
  if (!link.effort && existing.effort) link.effort = existing.effort;
}

export { buildAgentChatOrchestrationLink, log, persistThreadLinkage };
