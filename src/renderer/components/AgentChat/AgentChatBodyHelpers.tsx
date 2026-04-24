/**
 * AgentChatBodyHelpers.tsx — Helper functions and components for AgentChatConversationBody.
 * Extracted to keep AgentChatConversationBody.tsx under the 300-line limit.
 */
import log from 'electron-log/renderer';
import React, { useMemo, useRef } from 'react';

import type { AgentChatMessageRecord, AgentChatThreadRecord } from '../../types/electron';
import { PendingUserBubble } from './AgentChatMessageComponents';
import { buildFilteredMessages, buildSyntheticStreamingMessage } from './AgentChatStreamingHelpers';
import { StreamingStatusMessage } from './streamingUtils';
import type { AgentChatStreamingState } from './useAgentChatStreaming';

export function findLastUserMessageId(messages: AgentChatMessageRecord[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].id;
  }
  return null;
}

function logMessagesSignature(
  threadId: string,
  filtered: AgentChatMessageRecord[],
  lastSignatureRef: React.MutableRefObject<string>,
  meta: { synthetic: boolean; streamingAlreadyPersisted: boolean; streamingMsgId: string | null },
): void {
  const signature = filtered.map((m) => `${m.role}:${m.id.slice(-6)}`).join(',');
  if (signature === lastSignatureRef.current) return;
  lastSignatureRef.current = signature;
  log.info(
    '[trace:chat-order] messagesWithStreaming',
    'thread:',
    threadId.slice(-6),
    'count:',
    filtered.length,
    'synthetic:',
    meta.synthetic,
    'streamingAlreadyPersisted:',
    meta.streamingAlreadyPersisted,
    'streamingMsgId:',
    meta.streamingMsgId ? meta.streamingMsgId.slice(-6) : 'null',
    'ids:',
    signature,
  );
}

interface PushSyntheticOpts {
  filtered: AgentChatMessageRecord[];
  activeThread: AgentChatThreadRecord;
  streaming: AgentChatStreamingState;
  threadIsActive: boolean;
  streamingAlreadyPersisted: boolean;
  onStop: (() => Promise<void>) | undefined;
}

function maybePushSyntheticMessage(opts: PushSyntheticOpts): boolean {
  const { filtered, activeThread, streaming, threadIsActive, streamingAlreadyPersisted, onStop } = opts;
  if (!streamingIsActiveFor(streaming, threadIsActive) || streamingAlreadyPersisted) return false;
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
  return true;
}

function streamingIsActiveFor(streaming: AgentChatStreamingState, threadIsActive: boolean): boolean {
  return streaming.isStreaming || streaming.blocks.length > 0 || threadIsActive;
}

export function useMessagesWithStreaming(
  activeThread: AgentChatThreadRecord | null,
  streaming: AgentChatStreamingState,
  onStop: (() => Promise<void>) | undefined,
): AgentChatMessageRecord[] {
  const threadIsActive =
    activeThread?.status === 'submitting' || activeThread?.status === 'running';
  const streamingAlreadyPersisted = Boolean(
    streaming.streamingMessageId &&
    activeThread?.messages.some((m) => m.id === streaming.streamingMessageId),
  );
  const lastSignatureRef = useRef<string>('');
  return useMemo(() => {
    if (!activeThread) return [];
    const filtered = buildFilteredMessages(activeThread.messages);
    const synthetic = maybePushSyntheticMessage(
      { filtered, activeThread, streaming, threadIsActive, streamingAlreadyPersisted, onStop },
    );
    logMessagesSignature(activeThread.id, filtered, lastSignatureRef, {
      synthetic,
      streamingAlreadyPersisted,
      streamingMsgId: streaming.streamingMessageId ?? null,
    });
    return filtered;
  }, [
    activeThread,
    streaming,
    threadIsActive,
    streamingAlreadyPersisted,
    onStop,
  ]);
}

/** Shown before the first streaming blocks arrive — just the user bubble + status spinner. */
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
        <StreamingStatusMessage onStop={onStop} />
      </div>
    </div>
  );
}
