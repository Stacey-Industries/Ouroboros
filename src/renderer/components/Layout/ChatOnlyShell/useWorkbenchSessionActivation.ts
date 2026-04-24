import { useCallback, useRef, useState } from 'react';

import type { AgentChatThreadRecord, SessionRecord } from '../../../types/electron';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}

function compareThreads(left: AgentChatThreadRecord, right: AgentChatThreadRecord): number {
  if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
  if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
  return left.id.localeCompare(right.id);
}

export function resolvePreferredThreadId(
  session: SessionRecord,
  threads: AgentChatThreadRecord[],
): string | null {
  if (session.conversationThreadId) {
    const linkedThread = threads.find((thread) => thread.id === session.conversationThreadId);
    if (linkedThread) return linkedThread.id;
  }

  let latestThread: AgentChatThreadRecord | null = null;
  for (const thread of threads) {
    if (thread.workspaceRoot !== session.projectRoot) continue;
    if (!latestThread || compareThreads(thread, latestThread) < 0) {
      latestThread = thread;
    }
  }

  return latestThread?.id ?? null;
}

export interface WorkbenchSessionActivationActions {
  selectThread?: (threadId: string | null) => void;
}

export interface UseWorkbenchSessionActivationOptions {
  sessions?: SessionRecord[];
  threads?: AgentChatThreadRecord[];
  refreshSessions?: () => void | Promise<void>;
  actions?: WorkbenchSessionActivationActions;
}

export interface UseWorkbenchSessionActivationResult {
  activateSession: (sessionId: string) => Promise<boolean>;
  activatingSessionId: string | null;
}

export function useWorkbenchSessionActivation(
  options: UseWorkbenchSessionActivationOptions,
): UseWorkbenchSessionActivationResult {
  const { sessions = [], threads = [], refreshSessions = () => undefined, actions } = options;
  const [activatingSessionId, setActivatingSessionId] = useState<string | null>(null);
  const activationLockRef = useRef(false);

  const activateSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      if (activationLockRef.current || !hasElectronAPI()) {
        return false;
      }

      const session = sessions.find((candidate) => candidate.id === sessionId);
      const preferredThreadId = session ? resolvePreferredThreadId(session, threads) : undefined;

      activationLockRef.current = true;
      setActivatingSessionId(sessionId);

      try {
        const result = await window.electronAPI.sessionCrud.activate(sessionId);
        if (!result.success) return false;

        await Promise.resolve(refreshSessions());

        if (session) {
          actions?.selectThread?.(preferredThreadId ?? null);
        }

        return true;
      } finally {
        activationLockRef.current = false;
        setActivatingSessionId((current) => (current === sessionId ? null : current));
      }
    },
    [actions, refreshSessions, sessions, threads],
  );

  return { activateSession, activatingSessionId };
}
