/**
 * agentChatUiHelpers.ts — Agent chat UI helper functions.
 */

import {
  FOCUS_AGENT_CHAT_EVENT,
  OPEN_ORCHESTRATION_SESSION_EVENT,
} from './appEventNames';
import type { ToastType } from './useToast';

export type ToastFn = (message: string, type?: ToastType, options?: Record<string, unknown>) => unknown

interface AgentChatHandlerArgs {
  projectRoot: string | null
  toast: ToastFn
}

interface AgentChatStatusHandlerArgs {
  seenStatuses: Set<string>
  status: unknown
  toast: ToastFn
}

export function createResumeLatestAgentChatThreadHandler(args: AgentChatHandlerArgs): EventListener {
  return () => {
    if (!args.projectRoot) {
      args.toast('No project open', 'error');
      return;
    }

    void (async () => {
      try {
        const result = await window.electronAPI.agentChat.listThreads(args.projectRoot!);
        const threads = result.threads;
        if (!threads || threads.length === 0) {
          args.toast('No agent chat threads found', 'error');
          return;
        }
        const sorted = [...threads].sort((a, b) => b.createdAt - a.createdAt);
        const thread = sorted[0];
        window.dispatchEvent(new CustomEvent(FOCUS_AGENT_CHAT_EVENT, { detail: { threadId: thread.id } }));
      } catch (err) {
        args.toast(err instanceof Error ? err.message : 'Failed to resume agent chat thread', 'error');
      }
    })();
  };
}

export function createOpenLatestAgentChatDetailsHandler(args: AgentChatHandlerArgs): EventListener {
  return () => {
    if (!args.projectRoot) {
      args.toast('No project open', 'error');
      return;
    }

    void (async () => {
      try {
        const result = await window.electronAPI.agentChat.listThreads(args.projectRoot!);
        const threads = result.threads;
        if (!threads || threads.length === 0) {
          args.toast('No agent chat threads found', 'error');
          return;
        }
        const sorted = [...threads].sort((a, b) => b.createdAt - a.createdAt);
        const thread = sorted[0];
        const sessionId = thread.latestOrchestration?.sessionId;
        if (sessionId) {
          window.dispatchEvent(new CustomEvent(OPEN_ORCHESTRATION_SESSION_EVENT, { detail: { sessionId } }));
        } else {
          args.toast('No linked orchestration session found', 'error');
        }
      } catch (err) {
        args.toast(err instanceof Error ? err.message : 'Failed to open agent chat details', 'error');
      }
    })();
  };
}

export function handleAgentChatStatusEvent(args: AgentChatStatusHandlerArgs): void {
  const status = args.status;
  if (
    status !== null &&
    typeof status === 'object' &&
    'threadId' in (status as Record<string, unknown>) &&
    'status' in (status as Record<string, unknown>)
  ) {
    const record = status as { threadId: string; status: string };
    const key = `${record.threadId}:${record.status}`;
    if (args.seenStatuses.has(key)) return;
    args.seenStatuses.add(key);

    if (record.status === 'complete') {
      args.toast('Agent chat completed');
    } else if (record.status === 'failed') {
      args.toast('Agent chat failed', 'error');
    }
  }
}
