/**
 * agentChatReactions.ts — IPC handlers for Wave 22 Phase A reaction + collapse ops.
 *
 * Registered as a sub-registrar by agentChat.ts via registerReactionHandlers().
 */

import { AGENT_CHAT_INVOKE_CHANNELS } from '@shared/ipc/agentChatChannels';

import type { AgentChatService } from '../agentChat';
import { addReaction, removeReaction } from '../agentChat/messageReactions';

// ── Types ─────────────────────────────────────────────────────────────────────

type RegisterFn = (
  channels: string[],
  channel: string,
  handler: (...args: unknown[]) => unknown,
) => void;

type RequireStringFn = (value: unknown, name: string) => string;

export interface ReactionHandlerDeps {
  channels: string[];
  svc: AgentChatService;
  register: RegisterFn;
  requireValidString: RequireStringFn;
}

// ── Individual handler builders ───────────────────────────────────────────────

function makeGetHandler(svc: AgentChatService, rs: RequireStringFn) {
  return async (messageId: unknown) => {
    const reactions = await svc.threadStore.getMessageReactions(rs(messageId, 'messageId'));
    return { success: true, reactions };
  };
}

function makeAddHandler(svc: AgentChatService, rs: RequireStringFn) {
  return async (messageId: unknown, kind: unknown) => {
    const reactions = await addReaction(svc.threadStore, rs(messageId, 'messageId'), rs(kind, 'kind'));
    return { success: true, reactions };
  };
}

function makeRemoveHandler(svc: AgentChatService, rs: RequireStringFn) {
  return async (messageId: unknown, kind: unknown) => {
    const reactions = await removeReaction(svc.threadStore, rs(messageId, 'messageId'), rs(kind, 'kind'));
    return { success: true, reactions };
  };
}

function makeCollapseHandler(svc: AgentChatService, rs: RequireStringFn) {
  return async (messageId: unknown, collapsed: unknown) => {
    await svc.threadStore.setMessageCollapsed(rs(messageId, 'messageId'), Boolean(collapsed));
    return { success: true };
  };
}

// ── Registrar ─────────────────────────────────────────────────────────────────

export function registerReactionHandlers(deps: ReactionHandlerDeps): void {
  const { channels, svc, register, requireValidString: rs } = deps;
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.getMessageReactions, makeGetHandler(svc, rs));
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.addMessageReaction, makeAddHandler(svc, rs));
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.removeMessageReaction, makeRemoveHandler(svc, rs));
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.setMessageCollapsed, makeCollapseHandler(svc, rs));
}
