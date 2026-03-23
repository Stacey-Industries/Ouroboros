/**
 * AgentChatConversationBody.tsx — Body and composer sub-components for AgentChatConversation.
 * Extracted to keep AgentChatConversation.tsx under the 300-line limit.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
} from '../../types/electron';
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
import { AgentChatStreamingMessage } from './AgentChatStreamingMessage';
import type { AgentChatStreamingState } from './useAgentChatStreaming';

/* ---------- File-modifying tool set ---------- */

const FILE_MODIFYING_TOOLS_SET = new Set([
  'Write', 'Edit', 'MultiEdit', 'write_file', 'edit_file', 'multi_edit',
  'NotebookEdit', 'create_file',
]);

/* ---------- Scroll hook ---------- */

export function useSmartAutoScroll(deps: unknown[]): {
  scrollRef: React.RefObject<HTMLDivElement>;
  onScroll: () => void;
} {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 50;
  }, []);

  const onScroll = useCallback(() => { checkNearBottom(); }, [checkNearBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && isNearBottomRef.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { scrollRef: scrollRef as React.RefObject<HTMLDivElement>, onScroll };
}

/* ---------- Streaming helpers ---------- */

function dispatchDiffReviewEvent(thread: AgentChatThreadRecord, streaming: AgentChatStreamingState): void {
  let lastAssistant: AgentChatMessageRecord | undefined;
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    if (thread.messages[i].role === 'assistant') { lastAssistant = thread.messages[i]; break; }
  }
  const snapshotHash = lastAssistant?.orchestration?.preSnapshotHash;
  if (!snapshotHash || !thread.workspaceRoot) return;
  const fileEditBlocks = streaming.blocks.filter(
    (b) => b.kind === 'tool_use' && FILE_MODIFYING_TOOLS_SET.has(b.tool),
  );
  if (fileEditBlocks.length === 0) return;
  const filePaths = [...new Set(fileEditBlocks.filter((b) => b.filePath).map((b) => b.filePath as string))];
  window.dispatchEvent(new CustomEvent('agent-ide:open-diff-review', {
    detail: { sessionId: lastAssistant!.id, snapshotHash, projectRoot: thread.workspaceRoot, filePaths },
  }));
}

export function useStreamingCompletionEffect(activeThread: AgentChatThreadRecord | null, streaming: AgentChatStreamingState): void {
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = streaming.isStreaming;
    if (!wasStreaming || streaming.isStreaming || streaming.blocks.length === 0) return;
    if (!activeThread) return;
    dispatchDiffReviewEvent(activeThread, streaming);
  }, [streaming, activeThread]);
}

function buildFilteredMessages(messages: AgentChatMessageRecord[]): AgentChatMessageRecord[] {
  return messages.filter((message) => {
    if (message.role !== 'status') return true;
    const kind = (message as { statusKind?: string }).statusKind;
    return kind !== 'context' && kind !== 'progress' && kind !== 'verification';
  });
}

function buildSyntheticStreamingMessage(
  activeThread: AgentChatThreadRecord,
  streaming: AgentChatStreamingState,
  threadIsActive: boolean,
  onStop: (() => Promise<void>) | undefined,
): AgentChatMessageRecord {
  return {
    id: streaming.streamingMessageId || `streaming-${Date.now()}`,
    threadId: activeThread.id,
    role: 'assistant',
    content: streaming.activeTextContent || '',
    createdAt: Date.now(),
    blocks: streaming.blocks.length > 0 ? streaming.blocks : undefined,
    _streaming: true,
    _streamingState: { isStreaming: threadIsActive || streaming.isStreaming, onStop },
  } as AgentChatMessageRecord & { _streaming: boolean; _streamingState: unknown };
}

/* ---------- Edit state hook ---------- */

export function useEditState(activeThread: AgentChatThreadRecord | null, onEdit: (msg: AgentChatMessageRecord) => void) {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const handleStartEdit = useCallback((message: AgentChatMessageRecord) => {
    setEditingMessageId(message.id);
    setEditDraft(message.content);
  }, []);

  const handleCancelEdit = useCallback(() => { setEditingMessageId(null); setEditDraft(''); }, []);

  const handleEditSubmit = useCallback(() => {
    const trimmed = editDraft.trim();
    if (!trimmed || !editingMessageId) return;
    const original = activeThread?.messages.find((m) => m.id === editingMessageId);
    if (original) onEdit({ ...original, content: trimmed });
    setEditingMessageId(null);
    setEditDraft('');
  }, [editDraft, editingMessageId, activeThread, onEdit]);

  return { editingMessageId, editDraft, setEditDraft, handleStartEdit, handleCancelEdit, handleEditSubmit };
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
  pendingUserMessage?: string | null;
  isSending: boolean;
  error: string | null;
  scrollRef: React.RefObject<HTMLDivElement>;
  onScroll: () => void;
}

export function MessageList(props: MessageListProps): React.ReactElement {
  return (
    <div ref={props.scrollRef} onScroll={props.onScroll} className="selectable flex flex-1 flex-col overflow-y-auto px-4 py-3">
      <div className="mt-auto space-y-4">
        {props.activeThread.branchInfo && props.onSelectThread && (
          <AgentChatBranchIndicator branchInfo={props.activeThread.branchInfo} onSwitchToParent={props.onSelectThread} />
        )}
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
          />
        ))}
        {props.pendingUserMessage && props.isSending && <PendingUserBubble text={props.pendingUserMessage} />}
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
}

function findLastUserMessageId(messages: AgentChatMessageRecord[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].id;
  }
  return null;
}

function useMessagesWithStreaming(
  activeThread: AgentChatThreadRecord | null,
  streaming: AgentChatStreamingState,
  onStop: (() => Promise<void>) | undefined,
): AgentChatMessageRecord[] {
  const threadIsActive = activeThread?.status === 'submitting' || activeThread?.status === 'running';
  const streamingIsActive = streaming.isStreaming || streaming.blocks.length > 0 || threadIsActive;
  const streamingAlreadyPersisted = Boolean(
    streaming.streamingMessageId && activeThread?.messages.some((m) => m.id === streaming.streamingMessageId),
  );
  return useMemo(() => {
    if (!activeThread) return [];
    const filtered = buildFilteredMessages(activeThread.messages);
    if (streamingIsActive && !streamingAlreadyPersisted) {
      filtered.push(buildSyntheticStreamingMessage(activeThread, streaming, threadIsActive, onStop));
    }
    return filtered;
  }, [activeThread, streaming, streamingIsActive, streamingAlreadyPersisted, threadIsActive, onStop]);
}

function PendingStreamingView({
  scrollRef, onScroll, pendingUserMessage, onStop,
}: { scrollRef: React.RefObject<HTMLDivElement>; onScroll: () => void; pendingUserMessage: string; onStop?: () => Promise<void> }): React.ReactElement {
  return (
    <div ref={scrollRef} onScroll={onScroll} className="selectable flex flex-1 flex-col overflow-y-auto px-4 py-3">
      <div className="mt-auto space-y-4">
        <PendingUserBubble text={pendingUserMessage} />
        <AgentChatStreamingMessage blocks={[]} isStreaming={true} activeTextContent="" onStop={onStop} />
      </div>
    </div>
  );
}

export function ConversationBody(props: ConversationBodyProps): React.ReactElement {
  const { onEdit, onStop, activeThread, streaming } = props;
  useStreamingCompletionEffect(activeThread, streaming);

  const { editingMessageId, editDraft, setEditDraft, handleStartEdit, handleCancelEdit, handleEditSubmit } = useEditState(activeThread, onEdit);
  const { scrollRef, onScroll } = useSmartAutoScroll([
    activeThread?.messages.length, activeThread?.status, streaming.blocks.length, streaming.activeTextContent,
  ]);
  const messagesWithStreaming = useMessagesWithStreaming(activeThread, streaming, onStop);

  if (!props.hasProject) return <MissingProjectState />;
  if (props.isLoading) return <LoadingState />;
  if (!activeThread) {
    if (props.isSending && props.pendingUserMessage) {
      return <PendingStreamingView scrollRef={scrollRef} onScroll={onScroll} pendingUserMessage={props.pendingUserMessage} onStop={onStop} />;
    }
    return <EmptyConversationState onSelectPrompt={props.onDraftChange} />;
  }

  return (
    <MessageList
      activeThread={activeThread}
      messagesWithStreaming={messagesWithStreaming}
      lastUserMessageId={findLastUserMessageId(activeThread.messages)}
      editingMessageId={editingMessageId}
      editDraft={editDraft}
      onCancelEdit={handleCancelEdit}
      onStartEdit={handleStartEdit}
      onEditDraftChange={setEditDraft}
      onEditSubmit={handleEditSubmit}
      onRetry={props.onRetry}
      onBranch={props.onBranch}
      onRevert={props.onRevert}
      onOpenLinkedDetails={props.onOpenLinkedDetails}
      onSelectThread={props.onSelectThread}
      pendingUserMessage={props.pendingUserMessage}
      isSending={props.isSending}
      error={props.error}
      scrollRef={scrollRef}
      onScroll={onScroll}
    />
  );
}

export type { ComposerSectionProps } from './AgentChatComposerSection';
export { ComposerSection } from './AgentChatComposerSection';
