/**
 * VirtualizedMessageList.tsx — Chat message list.
 *
 * Renders all messages (persisted + streaming) in a single in-flow list. This
 * matches the Cursor / VS Code Chat / Vercel AI pattern: one component per
 * message, streaming lives in the same DOM flow as prior messages, so the live
 * render can never overlap persisted content during the streaming→persisted
 * handoff. React Compiler (Wave 4) handles memoization.
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

function FlatMessageList(props: VirtualizedMessageListProps): React.ReactElement {
  const { scrollRef, handleScroll } = useVirtualScroll(props.messagesWithStreaming);

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
        {props.messagesWithStreaming.map((message) => (
          <div key={message.id} className="pb-4">
            {renderCard(message, props)}
          </div>
        ))}
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

export function VirtualizedMessageList(props: VirtualizedMessageListProps): React.ReactElement {
  // Flat in-flow list (Cursor/VS Code pattern): streaming message lives in the same
  // DOM flow as persisted messages, so it can never overlap them during the handoff.
  return <FlatMessageList {...props} />;
}
