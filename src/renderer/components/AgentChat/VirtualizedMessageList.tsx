/**
 * VirtualizedMessageList.tsx — Virtualized message rendering for long conversations.
 *
 * Uses @tanstack/react-virtual for dynamic-height virtualization.
 * The streaming message (last item if actively streaming) is rendered OUTSIDE
 * the virtualizer to avoid constant re-measurement during streaming.
 */

import React from 'react';

import type {
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
} from '../../types/electron';
import { AgentChatBranchIndicator } from './AgentChatBranchIndicator';
import {
  FailedBanner,
  InlineError,
  MessageCard,
  PendingUserBubble,
} from './AgentChatMessageComponents';
import { useVirtualScroll } from './useVirtualScroll';

export interface VirtualizedMessageListProps {
  activeThread: AgentChatThreadRecord;
  messagesWithStreaming: AgentChatMessageRecord[];
  lastUserMessageId: string | null;
  editingMessageId: string | null;
  editDraft: string;
  onCancelEdit: () => void;
  onStartEdit: (message: AgentChatMessageRecord) => void;
  onEditDraftChange: (value: string) => void;
  onEditSubmit: () => void;
  onRetry: (message: AgentChatMessageRecord) => void;
  onBranch: (message: AgentChatMessageRecord) => void;
  onRevert?: (message: AgentChatMessageRecord) => void;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  onSelectThread?: (threadId: string) => void;
  pendingUserMessage?: string | null;
  isSending: boolean;
  error: string | null;
}

function renderCard(
  message: AgentChatMessageRecord,
  p: VirtualizedMessageListProps,
): React.ReactNode {
  return (
    <MessageCard
      message={message}
      editingMessageId={p.editingMessageId}
      editDraft={p.editDraft}
      isLastUserMessage={message.id === p.lastUserMessageId}
      threadStatus={p.activeThread.status}
      workspaceRoot={p.activeThread.workspaceRoot}
      onCancelEdit={p.onCancelEdit}
      onEdit={p.onStartEdit}
      onEditDraftChange={p.onEditDraftChange}
      onEditSubmit={p.onEditSubmit}
      onRetry={p.onRetry}
      onBranch={p.onBranch}
      onRevert={p.onRevert}
      onOpenLinkedDetails={p.onOpenLinkedDetails}
    />
  );
}

export function VirtualizedMessageList(props: VirtualizedMessageListProps): React.ReactElement {
  const { scrollRef, handleScroll, virtualizer, virtualizedMessages, streamingMessage } =
    useVirtualScroll(props.messagesWithStreaming);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      aria-live="polite"
      aria-relevant="additions"
      className="selectable flex flex-1 flex-col overflow-y-auto px-4 py-3"
    >
      <div className="mt-auto">
        {props.activeThread.branchInfo && props.onSelectThread && (
          <div className="mb-4">
            <AgentChatBranchIndicator
              branchInfo={props.activeThread.branchInfo}
              onSwitchToParent={props.onSelectThread}
            />
          </div>
        )}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtualizer.getVirtualItems().map((vi) => (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <div className="pb-4">{renderCard(virtualizedMessages[vi.index], props)}</div>
            </div>
          ))}
        </div>
        {streamingMessage && <div className="pb-4">{renderCard(streamingMessage, props)}</div>}
        {props.pendingUserMessage && props.isSending && (
          <div className="pb-4">
            <PendingUserBubble text={props.pendingUserMessage} />
          </div>
        )}
        <FailedBanner activeThread={props.activeThread} />
        <InlineError error={props.error} />
      </div>
    </div>
  );
}
