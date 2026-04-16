/**
 * VirtualizedMessageList.tsx — Chat message list.
 *
 * Renders all messages (persisted + streaming) in a single in-flow list. This
 * matches the Cursor / VS Code Chat / Vercel AI pattern: one component per
 * message, streaming lives in the same DOM flow as prior messages, so the live
 * render can never overlap persisted content during the streaming→persisted
 * handoff. React Compiler (Wave 4) handles memoization.
 */

import React, { useMemo } from 'react';

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
import type { BranchForkEntry } from './BranchIndicator';
import { BranchIndicator } from './BranchIndicator';
import { useVirtualScroll } from './useVirtualScroll';

export interface VirtualizedMessageListProps {
  activeThread: AgentChatThreadRecord;
  /** All workspace threads — used to compute per-message branch fork indicators. */
  allThreads?: AgentChatThreadRecord[];
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
  onRerunSuccess?: (newThreadId: string) => void;
  pendingUserMessage?: string | null;
  isSending: boolean;
  error: string | null;
}

/** Build a map of messageId → branch forks for the current thread's children. */
function useForksByMessageId(
  activeThreadId: string,
  allThreads: AgentChatThreadRecord[] | undefined,
): Map<string, BranchForkEntry[]> {
  return useMemo(() => {
    const map = new Map<string, BranchForkEntry[]>();
    if (!allThreads) return map;
    for (const t of allThreads) {
      if (t.parentThreadId !== activeThreadId) continue;
      if (!t.forkOfMessageId) continue;
      const label = t.branchName ?? t.title;
      const existing = map.get(t.forkOfMessageId) ?? [];
      existing.push({ threadId: t.id, branchName: label });
      map.set(t.forkOfMessageId, existing);
    }
    return map;
  }, [activeThreadId, allThreads]);
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
      onRerunSuccess={p.onRerunSuccess}
    />
  );
}

function MessageRows({
  messagesWithStreaming,
  forksByMessageId,
  activeThreadId,
  onSelectThread,
  props,
}: {
  messagesWithStreaming: AgentChatMessageRecord[];
  forksByMessageId: Map<string, BranchForkEntry[]>;
  activeThreadId: string;
  onSelectThread?: (id: string) => void;
  props: VirtualizedMessageListProps;
}): React.ReactElement {
  return (
    <>
      {messagesWithStreaming.map((message) => {
        const forks = forksByMessageId.get(message.id);
        return (
          <div key={message.id} className="pb-4">
            {renderCard(message, props)}
            {forks && onSelectThread && (
              <BranchIndicator
                forks={forks}
                currentThreadId={activeThreadId}
                onSelect={onSelectThread}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function FlatMessageList(props: VirtualizedMessageListProps): React.ReactElement {
  const { scrollRef, handleScroll } = useVirtualScroll(props.messagesWithStreaming);
  const forksByMessageId = useForksByMessageId(props.activeThread.id, props.allThreads);

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
        <MessageRows
          messagesWithStreaming={props.messagesWithStreaming}
          forksByMessageId={forksByMessageId}
          activeThreadId={props.activeThread.id}
          onSelectThread={props.onSelectThread}
          props={props}
        />
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
