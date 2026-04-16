/**
 * agentChatFork.ts — IPC handlers for Wave 23 Phase A fork/branch ops.
 *
 * Registered as a sub-registrar by agentChat.ts via registerForkHandlers().
 */

import { AGENT_CHAT_INVOKE_CHANNELS } from '@shared/ipc/agentChatChannels';
import type { AgentChatForkThreadRequest } from '@shared/types/agentChatResults';

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

export interface ForkHandlerDeps {
  channels: string[];
  svc: AgentChatService;
  register: RegisterFn;
  requireValidString: RequireStringFn;
  requireValidObject: RequireObjectFn;
}

// ── Individual handler builders ───────────────────────────────────────────────

function makeForkHandler(svc: AgentChatService, ro: RequireObjectFn, rs: RequireStringFn) {
  return async (payload: unknown) => {
    const obj = ro(payload, 'forkThread payload');
    const req: AgentChatForkThreadRequest = {
      sourceThreadId: rs(obj.sourceThreadId, 'sourceThreadId'),
      fromMessageId: rs(obj.fromMessageId, 'fromMessageId'),
      includeHistory: Boolean(obj.includeHistory),
      isSideChat: obj.isSideChat === true,
    };
    try {
      const thread = await svc.threadStore.forkThread(req);
      return { success: true, threadId: thread.id, thread };
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }
  };
}

function makeRenameBranchHandler(svc: AgentChatService, ro: RequireObjectFn, rs: RequireStringFn) {
  return async (payload: unknown) => {
    const obj = ro(payload, 'renameBranch payload');
    const threadId = rs(obj.threadId, 'threadId');
    const name = rs(obj.name, 'name');
    try {
      await svc.threadStore.renameBranch(threadId, name);
      return { success: true };
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }
  };
}

function makeListBranchesHandler(svc: AgentChatService, ro: RequireObjectFn, rs: RequireStringFn) {
  return async (payload: unknown) => {
    const obj = ro(payload, 'listBranches payload');
    const rootThreadId = rs(obj.rootThreadId, 'rootThreadId');
    try {
      const branches = await svc.threadStore.listBranches(rootThreadId);
      return { success: true, branches };
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }
  };
}

// ── Registrar ─────────────────────────────────────────────────────────────────

export function registerForkHandlers(deps: ForkHandlerDeps): void {
  const { channels, svc, register, requireValidString: rs, requireValidObject: ro } = deps;
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.forkThread, makeForkHandler(svc, ro, rs));
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.renameBranch, makeRenameBranchHandler(svc, ro, rs));
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.listBranches, makeListBranchesHandler(svc, ro, rs));
}
