/**
 * AgentChatBodyHelpers.tsx — Helper functions and components for AgentChatConversationBody.
 * Extracted to keep AgentChatConversationBody.tsx under the 300-line limit.
 */
import React, { useMemo } from 'react';

import type { AgentChatMessageRecord, AgentChatThreadRecord } from '../../types/electron';
import { PendingUserBubble } from './AgentChatMessageComponents';
import { buildFilteredMessages, buildSyntheticStreamingMessage } from './AgentChatStreamingHelpers';
import { AgentChatStreamingMessage } from './AgentChatStreamingMessage';
import type { AgentChatStreamingState } from './useAgentChatStreaming';

export function findLastUserMessageId(messages: AgentChatMessageRecord[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].id;
  }
  return null;
}

export function useMessagesWithStreaming(
  activeThread: AgentChatThreadRecord | null,
  streaming: AgentChatStreamingState,
  onStop: (() => Promise<void>) | undefined,
): AgentChatMessageRecord[] {
  const threadIsActive =
    activeThread?.status === 'submitting' || activeThread?.status === 'running';
  const streamingIsActive = streaming.isStreaming || streaming.blocks.length > 0 || threadIsActive;
  const streamingAlreadyPersisted = Boolean(
    streaming.streamingMessageId &&
    activeThread?.messages.some((m) => m.id === streaming.streamingMessageId),
  );
  return useMemo(() => {
    if (!activeThread) return [];
    const filtered = buildFilteredMessages(activeThread.messages);
    if (streamingIsActive && !streamingAlreadyPersisted) {
      filtered.push(
        buildSyntheticStreamingMessage({
          activeThread,
          streamingBlocks: streaming.blocks,
          streamingMessageId: streaming.streamingMessageId ?? undefined,
          activeTextContent: streaming.activeTextContent,
          isStreaming: streaming.isStreaming,
          threadIsActive,
          onStop,
        }),
      );
    }
    return filtered;
  }, [
    activeThread,
    streaming,
    streamingIsActive,
    streamingAlreadyPersisted,
    threadIsActive,
    onStop,
  ]);
}

export function PendingStreamingView({
  scrollRef,
  onScroll,
  pendingUserMessage,
  onStop,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  pendingUserMessage: string;
  onStop?: () => Promise<void>;
}): React.ReactElement {
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="selectable flex flex-1 flex-col overflow-y-auto px-4 py-3"
    >
      <div className="mt-auto space-y-4">
        <PendingUserBubble text={pendingUserMessage} />
        <AgentChatStreamingMessage
          blocks={[]}
          isStreaming={true}
          activeTextContent=""
          onStop={onStop}
        />
      </div>
    </div>
  );
}
