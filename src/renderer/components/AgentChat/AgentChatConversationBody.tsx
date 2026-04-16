/**
 * AgentChatConversationBody.tsx — Body and composer sub-components for AgentChatConversation.
 * Extracted to keep AgentChatConversation.tsx under the 300-line limit.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useAgentConflicts } from '../../hooks/useAgentConflicts';
import type {
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
} from '../../types/electron';
import {
  findLastUserMessageId,
  PendingStreamingView,
  useMessagesWithStreaming,
} from './AgentChatBodyHelpers';
import { AgentChatBranchIndicator } from './AgentChatBranchIndicator';
import {
  EmptyConversationState,
  FailedBanner,
  InlineError,
  LoadingState,
  MessageCard,
  MissingProjectState,
  PendingUserBubble,
} from './AgentChatMessageComponents';
import { useAgentChatThread } from './agentChatSelectors';
import { dispatchDiffReviewEvent } from './AgentChatStreamingHelpers';
import { AgentConflictBanner } from './AgentConflictBanner';
import type { AgentChatStreamingState } from './useAgentChatStreaming';
import { VirtualizedMessageList } from './VirtualizedMessageList';

/* ---------- Scroll hook ---------- */

export function useSmartAutoScroll(deps: unknown[]): {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
} {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 50;
  }, []);

  const onScroll = useCallback(() => {
    checkNearBottom();
  }, [checkNearBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && isNearBottomRef.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { scrollRef: scrollRef as React.RefObject<HTMLDivElement | null>, onScroll };
}

/* ---------- Streaming completion effect ---------- */

export function useStreamingCompletionEffect(
  activeThread: AgentChatThreadRecord | null,
  streaming: AgentChatStreamingState,
): void {
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = streaming.isStreaming;
    if (!wasStreaming || streaming.isStreaming || streaming.blocks.length === 0) return;
    if (!activeThread) return;
    dispatchDiffReviewEvent(activeThread, streaming.blocks);
  }, [streaming, activeThread]);
}

/* ---------- Edit state hook ---------- */

export function useEditState(
  activeThread: AgentChatThreadRecord | null,
  onEdit: (msg: AgentChatMessageRecord) => void,
) {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const handleStartEdit = useCallback((message: AgentChatMessageRecord) => {
    setEditingMessageId(message.id);
    setEditDraft(message.content);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditDraft('');
  }, []);

  const handleEditSubmit = useCallback(() => {
    const trimmed = editDraft.trim();
    if (!trimmed || !editingMessageId) return;
    const original = activeThread?.messages.find((m) => m.id === editingMessageId);
    if (original) onEdit({ ...original, content: trimmed });
    setEditingMessageId(null);
    setEditDraft('');
  }, [editDraft, editingMessageId, activeThread, onEdit]);

  return {
    editingMessageId,
    editDraft,
    setEditDraft,
    handleStartEdit,
    handleCancelEdit,
    handleEditSubmit,
  };
}

/* ---------- Message list ---------- */

interface MessageListProps {
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
  onRerunSuccess?: (newThreadId: string) => void;
  pendingUserMessage?: string | null;
  isSending: boolean;
  error: string | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}

function MessageCards(props: MessageListProps): React.ReactElement {
  return (
    <>
      {props.messagesWithStreaming.map((message) => (
        <MessageCard
          key={message.id}
          message={message}
          editingMessageId={props.editingMessageId}
          editDraft={props.editDraft}
          isLastUserMessage={message.id === props.lastUserMessageId}
          threadStatus={props.activeThread.status}
          workspaceRoot={props.activeThread.workspaceRoot}
          onCancelEdit={props.onCancelEdit}
          onEdit={props.onStartEdit}
          onEditDraftChange={props.onEditDraftChange}
          onEditSubmit={props.onEditSubmit}
          onRetry={props.onRetry}
          onBranch={props.onBranch}
          onRevert={props.onRevert}
          onOpenLinkedDetails={props.onOpenLinkedDetails}
          onRerunSuccess={props.onRerunSuccess}
        />
      ))}
    </>
  );
}

export function MessageList(props: MessageListProps): React.ReactElement {
  return (
    <div
      ref={props.scrollRef}
      onScroll={props.onScroll}
      aria-live="polite"
      aria-relevant="additions"
      className="selectable flex flex-1 flex-col overflow-y-auto px-4 py-3"
    >
      <div className="mt-auto space-y-4">
        {props.activeThread.branchInfo && props.onSelectThread && (
          <AgentChatBranchIndicator
            branchInfo={props.activeThread.branchInfo}
            onSwitchToParent={props.onSelectThread}
          />
        )}
        <MessageCards {...props} />
        {props.pendingUserMessage && props.isSending && (
          <PendingUserBubble text={props.pendingUserMessage} />
        )}
        <FailedBanner activeThread={props.activeThread} />
        <InlineError error={props.error} />
      </div>
    </div>
  );
}

/* ---------- ConversationBody ---------- */

export interface ConversationBodyProps {
  activeThread: AgentChatThreadRecord | null;
  streaming: AgentChatStreamingState;
  error: string | null;
  hasProject: boolean;
  isSending: boolean;
  isLoading: boolean;
  onEdit: (message: AgentChatMessageRecord) => void;
  onRetry: (message: AgentChatMessageRecord) => void;
  onBranch: (message: AgentChatMessageRecord) => void;
  onRevert?: (message: AgentChatMessageRecord) => void;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  onStop?: () => Promise<void>;
  pendingUserMessage?: string | null;
  onSelectThread?: (threadId: string) => void;
  onDraftChange?: (value: string) => void;
  onRerunSuccess?: (newThreadId: string) => void;
}

function useConversationBodyState(props: ConversationBodyProps) {
  const { onEdit, onStop, activeThread, streaming } = props;
  useStreamingCompletionEffect(activeThread, streaming);
  const editState = useEditState(activeThread, onEdit);
  const { scrollRef, onScroll } = useSmartAutoScroll([
    activeThread?.messages.length,
    activeThread?.status,
    streaming.blocks.length,
    streaming.activeTextContent,
  ]);
  const messagesWithStreaming = useMessagesWithStreaming(activeThread, streaming, onStop);
  return { ...editState, scrollRef, onScroll, messagesWithStreaming };
}

type BodyState = ReturnType<typeof useConversationBodyState>;

function ConflictBanners({ activeThread }: { activeThread: AgentChatThreadRecord }): React.ReactElement | null {
  const sessionId = activeThread.latestOrchestration?.claudeSessionId;
  const { reports } = useAgentConflicts(sessionId);

  function handleDismiss(sessionA: string, sessionB: string): void {
    void window.electronAPI?.agentConflict?.dismiss(sessionA, sessionB);
  }

  if (reports.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-4 pt-2">
      {reports.map((r) => (
        <AgentConflictBanner key={`${r.sessionA}||${r.sessionB}`} report={r} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}

function ConversationBodyWithThread(
  props: ConversationBodyProps &
    BodyState & { activeThread: NonNullable<ConversationBodyProps['activeThread']> },
): React.ReactElement {
  const { threads } = useAgentChatThread();
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ConflictBanners activeThread={props.activeThread} />
      <VirtualizedMessageList
        activeThread={props.activeThread}
        allThreads={threads}
        messagesWithStreaming={props.messagesWithStreaming}
        lastUserMessageId={findLastUserMessageId(props.activeThread.messages)}
        editingMessageId={props.editingMessageId}
        editDraft={props.editDraft}
        onCancelEdit={props.handleCancelEdit}
        onStartEdit={props.handleStartEdit}
        onEditDraftChange={props.setEditDraft}
        onEditSubmit={props.handleEditSubmit}
        onRetry={props.onRetry}
        onBranch={props.onBranch}
        onRevert={props.onRevert}
        onOpenLinkedDetails={props.onOpenLinkedDetails}
        onSelectThread={props.onSelectThread}
        onRerunSuccess={props.onRerunSuccess}
        pendingUserMessage={props.pendingUserMessage}
        isSending={props.isSending}
        error={props.error}
      />
    </div>
  );
}

export function ConversationBody(props: ConversationBodyProps): React.ReactElement {
  const state = useConversationBodyState(props);
  const { scrollRef, onScroll } = state;
  const { onStop, activeThread } = props;
  if (!props.hasProject) return <MissingProjectState />;
  if (props.isLoading) return <LoadingState />;
  if (!activeThread) {
    if (props.isSending && props.pendingUserMessage)
      return (
        <PendingStreamingView
          scrollRef={scrollRef}
          onScroll={onScroll}
          pendingUserMessage={props.pendingUserMessage}
          onStop={onStop}
        />
      );
    return <EmptyConversationState onSelectPrompt={props.onDraftChange} />;
  }
  return <ConversationBodyWithThread {...props} {...state} activeThread={activeThread} />;
}

export type { ComposerSectionProps } from './AgentChatComposerSection';
export { ComposerSection } from './AgentChatComposerSection';
