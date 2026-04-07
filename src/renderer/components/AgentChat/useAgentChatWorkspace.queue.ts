/**
 * Queue actions hook extracted from useAgentChatWorkspace to stay within max-lines.
 * Manages per-thread queued messages (messages sent while agent is busy).
 */
import { type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';

export interface QueuedMessage {
  id: string;
  content: string;
  queuedAt: number;
}

let queueIdCounter = 0;

type QueueMap = Map<string | null, QueuedMessage[]>;
type SetQueue = (action: SetStateAction<QueuedMessage[]>) => void;

export function useQueueActions(activeThreadId: string | null, setDraft: (v: string) => void) {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const queueMapRef = useRef<QueueMap>(new Map());

  useEffect(() => {
    setQueuedMessages(queueMapRef.current.get(activeThreadId) ?? []);
  }, [activeThreadId]);

  const setForThread: SetQueue = useCallback(
    (action) => {
      setQueuedMessages((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        queueMapRef.current.set(activeThreadId, next);
        return next;
      });
    },
    [activeThreadId],
  );

  const addToQueue = useCallback(
    (content: string) => {
      setForThread((prev) => [
        ...prev,
        { id: `queued-${++queueIdCounter}`, content, queuedAt: Date.now() },
      ]);
    },
    [setForThread],
  );

  const editQueuedMessage = useCallback(
    (id: string) => {
      setForThread((prev) => {
        const item = prev.find((m) => m.id === id);
        if (item) setDraft(item.content);
        return prev.filter((m) => m.id !== id);
      });
    },
    [setDraft, setForThread],
  );

  const deleteQueuedMessage = useCallback(
    (id: string) => {
      setForThread((prev) => prev.filter((m) => m.id !== id));
    },
    [setForThread],
  );

  return {
    queuedMessages,
    setQueuedMessages: setForThread,
    addToQueue,
    editQueuedMessage,
    deleteQueuedMessage,
  };
}
