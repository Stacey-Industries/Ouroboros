/**
 * useAgentChatWorkspaceHooks.ts — Internal hooks extracted from useAgentChatWorkspace.ts
 * to keep file sizes under the 300-line limit.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { EXPLAIN_TERMINAL_ERROR_EVENT } from '../../hooks/appEventNames';
import type { AgentChatThreadRecord, ImageAttachment } from '../../types/electron';
import type { SendMessageArgs } from './agentChatWorkspaceActions';
import { sendComposerMessage } from './agentChatWorkspaceSendFlows';
import { createDraftThreadId } from './useAgentChatDraftPersistence';
import { useAgentChatLinkedDetails } from './useAgentChatLinkedDetails';
import type { QueuedMessage } from './useAgentChatWorkspace';

interface UseQueueAutoSendArgs {
  activeThreadId: string | null;
  threadIsBusy: boolean;
  isSending: boolean;
  queuedMessages: QueuedMessage[];
  setQueuedMessages: React.Dispatch<React.SetStateAction<QueuedMessage[]>>;
  /** Send content directly without touching the composer draft state. */
  sendWithContent: (content: string) => Promise<void>;
}

export function useQueueAutoSend(args: UseQueueAutoSendArgs): void {
  const {
    activeThreadId,
    threadIsBusy,
    isSending,
    queuedMessages,
    setQueuedMessages,
    sendWithContent,
  } = args;
  const queueRef = useRef(queuedMessages);
  queueRef.current = queuedMessages;
  const prevThreadBusyRef = useRef(threadIsBusy);
  const prevThreadIdRef = useRef(activeThreadId);
  const [pendingAutoSend, setPendingAutoSend] = useState<string | null>(null);
  useEffect(() => {
    const wasBusy = prevThreadBusyRef.current;
    const threadChanged = prevThreadIdRef.current !== activeThreadId;
    prevThreadBusyRef.current = threadIsBusy;
    prevThreadIdRef.current = activeThreadId;
    if (threadChanged) return;
    if (wasBusy && !threadIsBusy && !isSending && queueRef.current.length > 0) {
      const next = queueRef.current[0];
      setQueuedMessages((prev) => prev.slice(1));
      setPendingAutoSend(next.content);
    }
  }, [activeThreadId, threadIsBusy, isSending, setQueuedMessages]);
  useEffect(() => {
    if (pendingAutoSend !== null) {
      setPendingAutoSend(null);
      void sendWithContent(pendingAutoSend);
    }
  }, [pendingAutoSend, sendWithContent]);
}

export function useExplainErrorListener(setDraft: (v: string) => void): void {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt: string }>).detail;
      if (detail?.prompt) setDraft(detail.prompt);
    };
    window.addEventListener(EXPLAIN_TERMINAL_ERROR_EVENT, handler);
    return () => window.removeEventListener(EXPLAIN_TERMINAL_ERROR_EVENT, handler);
  }, [setDraft]);
}

export function useWrappedSendMessage(args: {
  draft: string;
  attachments: ImageAttachment[];
  isSending: boolean;
  threadIsBusyRef: React.MutableRefObject<boolean>;
  addToQueue: (content: string) => void;
  setDraft: (v: string) => void;
  sendMessage: () => Promise<void>;
}): () => Promise<void> {
  const { draft, attachments, isSending, threadIsBusyRef, addToQueue, setDraft, sendMessage } =
    args;
  return useCallback(async () => {
    const content = draft.trim();
    const hasAttachments = attachments.length > 0;
    if (!content && !hasAttachments) return;
    if (threadIsBusyRef.current || isSending) {
      addToQueue(content || '[image attachment]');
      setDraft('');
      return;
    }
    await sendMessage();
  }, [draft, attachments, isSending, addToQueue, setDraft, sendMessage, threadIsBusyRef]);
}

/**
 * Returns a stable callback that sends `content` directly via sendComposerMessage
 * WITHOUT touching the composer draft state. Used by auto-send and force-send
 * queue drain paths so the composer textarea is never populated with the sent content.
 */
export function useSendWithContent(argsRef: React.MutableRefObject<SendMessageArgs>): (
  content: string,
) => Promise<void> {
  return useCallback(
    async (content: string) => {
      await sendComposerMessage({ ...argsRef.current, draft: content });
    },
    [argsRef],
  );
}

export function useSendQueuedNow(
  setQueuedMessages: React.Dispatch<React.SetStateAction<QueuedMessage[]>>,
  stopTask: () => Promise<void>,
): (id: string) => Promise<void> {
  return useCallback(
    async (id: string) => {
      setQueuedMessages((prev) => {
        const item = prev.find((m) => m.id === id);
        if (!item) return prev;
        return [item, ...prev.filter((m) => m.id !== id)];
      });
      await stopTask();
    },
    [setQueuedMessages, stopTask],
  );
}

interface WorkspaceControllerSlice {
  draft: string;
  attachments: ImageAttachment[];
  isSending: boolean;
  addToQueue: (content: string) => void;
  setDraft: (v: string) => void;
  queuedMessages: QueuedMessage[];
  setQueuedMessages: React.Dispatch<React.SetStateAction<QueuedMessage[]>>;
  activeThread: AgentChatThreadRecord | null;
  threadState: {
    activeThreadId: string | null;
    setActiveThreadId: (id: string) => void;
    setError: (e: string | null) => void;
  };
}

function useStartNewChat(controller: WorkspaceControllerSlice): () => void {
  const { setDraft, threadState } = controller;
  return useCallback(() => {
    const draftId = createDraftThreadId();
    setDraft('');
    threadState.setActiveThreadId(draftId);
    threadState.setError(null);
  }, [setDraft, threadState]);
}

export function useWorkspaceHooks(
  controller: WorkspaceControllerSlice,
  actions: { sendMessage: () => Promise<void>; stopTask: () => Promise<void> },
  sendMessageArgsRef: React.MutableRefObject<SendMessageArgs>,
) {
  const threadIsBusy =
    controller.activeThread?.status === 'submitting' ||
    controller.activeThread?.status === 'running';
  const threadIsBusyRef = useRef(threadIsBusy);
  threadIsBusyRef.current = threadIsBusy;

  const sendMessage = useWrappedSendMessage({
    draft: controller.draft,
    attachments: controller.attachments,
    isSending: controller.isSending,
    threadIsBusyRef,
    addToQueue: controller.addToQueue,
    setDraft: controller.setDraft,
    sendMessage: actions.sendMessage,
  });

  const sendWithContent = useSendWithContent(sendMessageArgsRef);

  useQueueAutoSend({
    activeThreadId: controller.threadState.activeThreadId,
    threadIsBusy,
    isSending: controller.isSending,
    queuedMessages: controller.queuedMessages,
    setQueuedMessages: controller.setQueuedMessages,
    sendWithContent,
  });

  const sendQueuedMessageNow = useSendQueuedNow(controller.setQueuedMessages, actions.stopTask);
  useExplainErrorListener(controller.setDraft);
  const detailsState = useAgentChatLinkedDetails({ activeThread: controller.activeThread });
  const startNewChat = useStartNewChat(controller);

  return { sendMessage, sendQueuedMessageNow, detailsState, startNewChat };
}
