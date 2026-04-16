/**
 * agentChatCost.ts — IPC handlers for per-thread and global cost rollups.
 *
 * Sub-registrar pattern: receives the shared channels array, register helper,
 * and requireValid* helpers from the parent agentChat.ts registrar.
 */

import type { AgentChatService } from '../agentChat';
import { AGENT_CHAT_INVOKE_CHANNELS } from '../agentChat';
import {
  computeGlobalCostRollup,
  computeThreadCostRollup,
} from '../agentChat/threadCostRollup';

// ─── Types shared with parent ─────────────────────────────────────────────────

type RegisterFn = (
  channels: string[],
  channel: string,
  handler: (...args: unknown[]) => unknown,
) => void;

type RequireStringFn = (value: unknown, name: string) => string;
type RequireObjectFn = (value: unknown, name: string) => Record<string, unknown>;

export interface CostHandlerDeps {
  channels: string[];
  svc: AgentChatService;
  register: RegisterFn;
  requireValidString: RequireStringFn;
  requireValidObject: RequireObjectFn;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleThreadCostRollup(
  payload: unknown,
  svc: AgentChatService,
  requireValidObject: RequireObjectFn,
  requireValidString: RequireStringFn,
): Promise<unknown> {
  const obj = requireValidObject(payload, 'getThreadCostRollup payload');
  const threadId = requireValidString(obj.threadId, 'threadId');
  const result = await svc.loadThread(threadId);
  if (!result.success || !result.thread) {
    return { success: false, error: result.error ?? 'Thread not found' };
  }
  const rollup = computeThreadCostRollup(threadId, result.thread.messages);
  return { success: true, rollup };
}

async function handleGlobalCostRollup(
  payload: unknown,
  svc: AgentChatService,
  requireValidObject: RequireObjectFn,
): Promise<unknown> {
  const obj = payload != null ? requireValidObject(payload, 'getGlobalCostRollup payload') : {};
  const timeRange = obj.timeRange as { from: number; to: number } | undefined;
  const listResult = await svc.listThreads();
  if (!listResult.success || !listResult.threads) {
    return { success: false, error: listResult.error ?? 'Failed to list threads' };
  }
  const threads = timeRange
    ? listResult.threads.filter(
        (t) => t.createdAt >= timeRange.from && t.createdAt <= timeRange.to,
      )
    : listResult.threads;
  const perThread = threads.map((t) => computeThreadCostRollup(t.id, t.messages));
  const rollup = computeGlobalCostRollup(perThread);
  return { success: true, rollup, threads: perThread };
}

// ─── Sub-registrar ────────────────────────────────────────────────────────────

export function registerCostRollupHandlers(deps: CostHandlerDeps): void {
  const { channels, svc, register, requireValidString, requireValidObject } = deps;
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.getThreadCostRollup, (payload) =>
    handleThreadCostRollup(payload, svc, requireValidObject, requireValidString),
  );
  register(channels, AGENT_CHAT_INVOKE_CHANNELS.getGlobalCostRollup, (payload) =>
    handleGlobalCostRollup(payload, svc, requireValidObject),
  );
}
