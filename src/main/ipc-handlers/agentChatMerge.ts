/**
 * agentChatMerge.ts — IPC handlers for Wave 23 Phase D merge-to-main op.
 *
 * Registered as a sub-registrar by agentChat.ts via registerMergeHandlers().
 */

import { AGENT_CHAT_INVOKE_CHANNELS } from '@shared/ipc/agentChatChannels';

import type { AgentChatService } from '../agentChat';
import { getErrorMessage } from '../agentChat/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type RegisterFn = (
  channels: string[],
  channel: string,
  handler: (...args: unknown[]) => unknown,
) => void;

type RequireStringFn = (value: unknown, name: string) => string;
type RequireObjectFn = (value: unknown, name: string) => Record<string, unknown>;

export interface MergeHandlerDeps {
  channels: string[];
  svc: AgentChatService;
  register: RegisterFn;
  requireValidString: RequireStringFn;
  requireValidObject: RequireObjectFn;
}

// ── Handler builder ───────────────────────────────────────────────────────────

function makeMergeHandler(svc: AgentChatService, ro: RequireObjectFn, rs: RequireStringFn) {
  return async (payload: unknown) => {
    const obj = ro(payload, 'mergeSideChat payload');
    const sideChatId = rs(obj.sideChatId, 'sideChatId');
    const mainThreadId = rs(obj.mainThreadId, 'mainThreadId');
    const summary = rs(obj.summary, 'summary');
    const includeMessageIds = Array.isArray(obj.includeMessageIds)
      ? (obj.includeMessageIds as unknown[]).filter((v): v is string => typeof v === 'string')
      : undefined;

    try {
      const result = await svc.threadStore.mergeSideChat({
        sideChatId,
        mainThreadId,
        summary,
        includeMessageIds,
      });
      return result;
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }
  };
}

// ── Registrar ─────────────────────────────────────────────────────────────────

export function registerMergeHandlers(deps: MergeHandlerDeps): void {
  const { channels, svc, register, requireValidString: rs, requireValidObject: ro } = deps;
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.mergeSideChat, makeMergeHandler(svc, ro, rs));
}
