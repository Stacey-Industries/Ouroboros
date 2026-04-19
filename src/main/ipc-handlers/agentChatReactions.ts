/**
 * agentChatReactions.ts — IPC handlers for Wave 22 Phase A reaction + collapse ops.
 *
 * Registered as a sub-registrar by agentChat.ts via registerReactionHandlers().
 *
 * Wave 41 E.2 — handlers now accept threadId as a second arg and pass it through
 * so SQL ops can scope reactions by (id, threadId) composite PK.
 */

import { AGENT_CHAT_INVOKE_CHANNELS } from '@shared/ipc/agentChatChannels';
import type { ReactionKind } from '@shared/types/agentChat';

import type { AgentChatService } from '../agentChat';
import { addReaction, removeReaction } from '../agentChat/messageReactions';

// ── Kind allowlist ────────────────────────────────────────────────────────────

const ALLOWED_REACTION_KINDS: ReadonlySet<ReactionKind> = new Set(['+1', '-1']);

function isAllowedKind(kind: unknown): kind is ReactionKind {
  return typeof kind === 'string' && ALLOWED_REACTION_KINDS.has(kind as ReactionKind);
}

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
  return async (messageId: unknown, threadId: unknown) => {
    const reactions = await svc.threadStore.getMessageReactions(
      rs(messageId, 'messageId'), rs(threadId, 'threadId'),
    );
    return { success: true, reactions };
  };
}

function makeAddHandler(svc: AgentChatService, rs: RequireStringFn) {
  return async (messageId: unknown, threadId: unknown, kind: unknown) => {
    if (!isAllowedKind(kind)) {
      return { success: false, error: 'invalid-reaction-kind' };
    }
    const reactions = await addReaction(svc.threadStore, {
      messageId: rs(messageId, 'messageId'),
      threadId: rs(threadId, 'threadId'),
      kind,
    });
    return { success: true, reactions };
  };
}

function makeRemoveHandler(svc: AgentChatService, rs: RequireStringFn) {
  return async (messageId: unknown, threadId: unknown, kind: unknown) => {
    if (!isAllowedKind(kind)) {
      return { success: false, error: 'invalid-reaction-kind' };
    }
    const reactions = await removeReaction(svc.threadStore, {
      messageId: rs(messageId, 'messageId'),
      threadId: rs(threadId, 'threadId'),
      kind,
    });
    return { success: true, reactions };
  };
}

function makeCollapseHandler(svc: AgentChatService, rs: RequireStringFn) {
  return async (messageId: unknown, threadId: unknown, collapsed: unknown) => {
    await svc.threadStore.setMessageCollapsed(
      rs(messageId, 'messageId'), rs(threadId, 'threadId'), Boolean(collapsed),
    );
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
