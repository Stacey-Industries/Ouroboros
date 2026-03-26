/**
 * AgentChatTabBarHooks.ts — Hooks for AgentChatTabBar linked session tracking.
 * Extracted to keep AgentChatTabBarParts.tsx under the 300-line limit.
 */
import { useEffect, useState } from 'react';

import type { AgentChatThreadRecord } from '../../types/electron';

export type LinkedSession = { provider: 'claude-code' | 'codex' | null; sessionId: string | null };

export function resolveLinkedProvider(
  provider: unknown,
  codexThreadId?: string | null,
  claudeSessionId?: string | null,
): LinkedSession['provider'] {
  return provider === 'claude-code' || provider === 'codex'
    ? provider
    : codexThreadId
      ? 'codex'
      : claudeSessionId
        ? 'claude-code'
        : null;
}

function getInitialLinkedSession(thread: AgentChatThreadRecord | null): LinkedSession {
  const orchestration = thread?.latestOrchestration;
  return {
    provider: resolveLinkedProvider(
      orchestration?.provider,
      orchestration?.codexThreadId,
      orchestration?.claudeSessionId,
    ),
    sessionId: orchestration?.codexThreadId ?? orchestration?.claudeSessionId ?? null,
  };
}

function useLinkedTerminalPoll(
  thread: AgentChatThreadRecord | null,
  setState: React.Dispatch<React.SetStateAction<LinkedSession>>,
): void {
  useEffect(() => {
    if (!thread?.id || !window.electronAPI?.agentChat?.getLinkedTerminal) {
      setState({ provider: null, sessionId: null });
      return;
    }
    let cancelled = false;
    const query = () => {
      void window.electronAPI.agentChat.getLinkedTerminal(thread.id).then((result) => {
        if (cancelled || !result?.success) return;
        const provider = resolveLinkedProvider(
          result.provider,
          result.codexThreadId,
          result.claudeSessionId,
        );
        const sessionId = result.codexThreadId ?? result.claudeSessionId ?? null;
        if (provider && sessionId) setState({ provider, sessionId });
      });
    };
    query();
    const isActive =
      thread.status === 'submitting' ||
      thread.status === 'running' ||
      thread.status === 'verifying';
    const intervalId = isActive ? setInterval(query, 2000) : undefined;
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [thread?.id, thread?.status, setState]);
}

export function useLinkedSessionId(thread: AgentChatThreadRecord | null): LinkedSession {
  const [state, setState] = useState<LinkedSession>(() => getInitialLinkedSession(thread));
  const orchestration = thread?.latestOrchestration;
  useEffect(() => {
    if (orchestration?.codexThreadId) {
      setState({ provider: 'codex', sessionId: orchestration.codexThreadId });
      return;
    }
    if (orchestration?.claudeSessionId) {
      setState({ provider: 'claude-code', sessionId: orchestration.claudeSessionId });
      return;
    }
    setState((previous) => {
      const rawProvider = orchestration?.provider;
      const provider: LinkedSession['provider'] =
        rawProvider === 'claude-code' || rawProvider === 'codex' ? rawProvider : previous.provider;
      return { provider, sessionId: previous.sessionId };
    });
  }, [orchestration?.claudeSessionId, orchestration?.codexThreadId, orchestration?.provider]);
  useLinkedTerminalPoll(thread, setState);
  return state;
}
