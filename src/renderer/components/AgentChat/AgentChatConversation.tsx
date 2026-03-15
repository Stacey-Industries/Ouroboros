import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentChatContentBlock,
  AgentChatLinkedDetailsResult,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
} from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { formatTimestamp, formatTimestampFull } from './agentChatFormatters';
import { AgentChatBlockRenderer } from './AgentChatBlockRenderer';
import { AgentChatComposer } from './AgentChatComposer';
import { AgentChatDetailsDrawer } from './AgentChatDetailsDrawer';
import {
  AssistantMessageActions,
  UserMessageActions,
} from './AgentChatMessageActions';
import { MessageMarkdown } from './MessageMarkdown';
import { AgentChatBranchIndicator } from './AgentChatBranchIndicator';
import { AgentChatStreamingMessage } from './AgentChatStreamingMessage';
import { useAgentChatStreaming } from './useAgentChatStreaming';
import type { PinnedFile } from './useAgentChatContext';
import type { MentionItem } from './MentionAutocomplete';

export interface AgentChatConversationProps {
  activeThread: AgentChatThreadRecord | null;
  canSend: boolean;
  closeDetails: () => void;
  details: AgentChatLinkedDetailsResult | null;
  detailsError: string | null;
  detailsIsLoading: boolean;
  draft: string;
  error: string | null;
  hasProject: boolean;
  isDetailsOpen: boolean;
  isLoading: boolean;
  isSending: boolean;
  pendingUserMessage?: string | null;
  onDraftChange: (value: string) => void;
  onEdit: (message: AgentChatMessageRecord) => void;
  onRetry: (message: AgentChatMessageRecord) => void;
  onBranch: (message: AgentChatMessageRecord) => void;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  onOpenLinkedTask: () => void;
  onSend: () => Promise<void>;
  onStop?: () => Promise<void>;
  // Context integration
  pinnedFiles?: PinnedFile[];
  onRemoveFile?: (path: string) => void;
  contextSummary?: string | null;
  autocompleteResults?: FileEntry[];
  isAutocompleteOpen?: boolean;
  onAutocompleteQuery?: (query: string) => void;
  onSelectFile?: (file: FileEntry) => void;
  onCloseAutocomplete?: () => void;
  onOpenAutocomplete?: () => void;
  // Mention system
  mentions?: MentionItem[];
  onAddMention?: (mention: MentionItem) => void;
  onRemoveMention?: (key: string) => void;
  allFiles?: FileEntry[];
  // Thread navigation (for branch indicator)
  onSelectThread?: (threadId: string) => void;
}

function ContextSummaryRow({ message }: { message: AgentChatMessageRecord }): React.ReactElement | null {
  if (!message.contextSummary) return null;
  const { omittedFileCount, selectedFileCount, usedAdvancedControls } = message.contextSummary;
  const parts = [
    `${selectedFileCount} file${selectedFileCount === 1 ? '' : 's'}`,
    omittedFileCount > 0 ? `${omittedFileCount} excluded` : null,
    usedAdvancedControls ? 'advanced' : null,
  ].filter(Boolean);
  return <div className="mt-1 text-[11px] text-[var(--text-muted)]">{parts.join(' \u00b7 ')}</div>;
}

function VerificationSummaryRow({ message }: { message: AgentChatMessageRecord }): React.ReactElement | null {
  if (!message.verificationPreview) return null;
  const { profile, status, summary } = message.verificationPreview;
  const content = [profile, status, summary || null].filter(Boolean).join(' \u00b7 ');
  return <div className="mt-1 text-[11px] text-[var(--text-muted)]">{content}</div>;
}

function ErrorInline({ message }: { message: AgentChatMessageRecord }): React.ReactElement | null {
  if (!message.error) return null;
  return <div className="mt-1 text-[11px] text-[var(--error,#f85149)]">{message.error.message}</div>;
}

function ToolsSummaryRow({ message }: { message: AgentChatMessageRecord }): React.ReactElement | null {
  if (!message.toolsSummary) return null;
  return <div className="mt-1 text-[11px] text-[var(--text-muted)]">{message.toolsSummary}</div>;
}

function CostDurationRow({ message }: { message: AgentChatMessageRecord }): React.ReactElement | null {
  const parts: string[] = [];
  if (message.costSummary) parts.push(message.costSummary);
  if (message.durationSummary) parts.push(message.durationSummary);
  if (parts.length === 0) return null;
  return <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{parts.join(' \u2022 ')}</div>;
}

function MessageActionLink(props: {
  message: AgentChatMessageRecord;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
}): React.ReactElement | null {
  if (!props.message.orchestration) return null;
  return (
    <button
      onClick={() => void props.onOpenLinkedDetails(props.message.orchestration)}
      className="mt-1 text-[11px] text-[var(--accent)] transition-opacity duration-100 hover:opacity-80"
    >
      View details
    </button>
  );
}

function UserMessage(props: {
  message: AgentChatMessageRecord;
  isEditing: boolean;
  editDraft: string;
  isLastUserMessage: boolean;
  threadStatus: string;
  onCancelEdit: () => void;
  onEdit: (message: AgentChatMessageRecord) => void;
  onEditDraftChange: (value: string) => void;
  onEditSubmit: () => void;
  onRetry: (message: AgentChatMessageRecord) => void;
  onBranch: (message: AgentChatMessageRecord) => void;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
}): React.ReactElement {
  if (props.isEditing) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm px-3.5 py-2.5" style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}>
          <textarea
            autoFocus
            value={props.editDraft}
            onChange={(e) => props.onEditDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                props.onEditSubmit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                props.onCancelEdit();
              }
            }}
            className="w-full resize-none rounded-lg border bg-[var(--bg)] p-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            style={{ borderColor: 'var(--border)', fontFamily: 'var(--font-ui)', minHeight: '60px' }}
            rows={3}
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              onClick={props.onCancelEdit}
              className="rounded px-2 py-0.5 text-[11px] opacity-80 hover:opacity-100"
            >
              Cancel
            </button>
            <button
              onClick={props.onEditSubmit}
              className="rounded px-2 py-0.5 text-[11px] font-medium opacity-90 hover:opacity-100"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex justify-end gap-1.5">
      <UserMessageActions
        message={props.message}
        isLastUserMessage={props.isLastUserMessage}
        threadStatus={props.threadStatus}
        onEdit={props.onEdit}
        onRetry={props.onRetry}
        onBranch={props.onBranch}
      />
      <div className="max-w-[85%] rounded-xl rounded-br-sm px-3.5 py-2.5" style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{props.message.content || ' '}</div>
        <ContextSummaryRow message={props.message} />
        <div className="mt-1 text-right text-[10px] opacity-60" title={formatTimestampFull(props.message.createdAt)}>{formatTimestamp(props.message.createdAt)}</div>
      </div>
    </div>
  );
}

/**
 * Renders content blocks for a completed assistant message.
 * Only used when message.blocks is populated; otherwise falls back to MessageMarkdown.
 *
 * Passes `allBlocks` so the block renderer can detect and group consecutive
 * tool_use blocks. Blocks inside a group are marked with `skipRender` to
 * prevent double-rendering.
 */
function AssistantBlocksContent({ blocks }: { blocks: AgentChatContentBlock[] }): React.ReactElement {
  // Pre-compute which blocks are "consumed" by a preceding tool group
  const skipSet = new Set<number>();
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].kind === 'tool_use' && !skipSet.has(i)) {
      // Count consecutive tool_use run starting at i
      let runLen = 0;
      for (let j = i; j < blocks.length && blocks[j].kind === 'tool_use'; j++) {
        runLen++;
      }
      if (runLen >= 2) {
        // Mark indices 1..runLen-1 as skipped (the first one renders the group)
        for (let k = i + 1; k < i + runLen; k++) {
          skipSet.add(k);
        }
      }
    }
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => (
        <AgentChatBlockRenderer
          key={`${block.kind}-${index}`}
          block={block}
          index={index}
          isStreaming={false}
          isLastBlock={index === blocks.length - 1}
          allBlocks={blocks}
          skipRender={skipSet.has(index)}
        />
      ))}
    </div>
  );
}

function AssistantMessage(props: {
  message: AgentChatMessageRecord;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  onBranch: (message: AgentChatMessageRecord) => void;
}): React.ReactElement {
  const hasBlocks = props.message.blocks && props.message.blocks.length > 0;

  return (
    <div className="group flex justify-start">
      <div className="max-w-[85%]">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}>
            C
          </div>
          <span className="text-[11px] text-[var(--text-muted)]" title={formatTimestampFull(props.message.createdAt)}>{formatTimestamp(props.message.createdAt)}</span>
          <AssistantMessageActions message={props.message} onBranch={props.onBranch} />
        </div>
        <div className="rounded-xl rounded-tl-sm px-3.5 py-2.5" style={{ backgroundColor: 'var(--bg)', borderLeft: '2px solid var(--accent)' }}>
          {hasBlocks ? (
            <AssistantBlocksContent blocks={props.message.blocks!} />
          ) : (
            <MessageMarkdown content={props.message.content || ' '} />
          )}
          <VerificationSummaryRow message={props.message} />
          <ErrorInline message={props.message} />
          <ToolsSummaryRow message={props.message} />
          <CostDurationRow message={props.message} />
          <MessageActionLink message={props.message} onOpenLinkedDetails={props.onOpenLinkedDetails} />
        </div>
      </div>
    </div>
  );
}

function StatusMessage(props: { message: AgentChatMessageRecord }): React.ReactElement {
  const [pulsing, setPulsing] = React.useState(true);

  React.useEffect(() => {
    // Trigger the pulse animation on mount, clear after 300ms
    const timer = setTimeout(() => setPulsing(false), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex justify-center">
      <div
        className={`rounded-full px-3 py-1 text-[11px] text-[var(--text-muted)] ${pulsing ? 'agent-chat-status-pulse' : ''}`}
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
      >
        {props.message.content || 'Status update'}
      </div>
    </div>
  );
}

function MessageCard(props: {
  message: AgentChatMessageRecord;
  editingMessageId: string | null;
  editDraft: string;
  isLastUserMessage: boolean;
  threadStatus: string;
  onCancelEdit: () => void;
  onEdit: (message: AgentChatMessageRecord) => void;
  onEditDraftChange: (value: string) => void;
  onEditSubmit: () => void;
  onRetry: (message: AgentChatMessageRecord) => void;
  onBranch: (message: AgentChatMessageRecord) => void;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
}): React.ReactElement {
  let content: React.ReactElement;

  if (props.message.role === 'user') {
    content = (
      <UserMessage
        message={props.message}
        isEditing={props.editingMessageId === props.message.id}
        editDraft={props.editDraft}
        isLastUserMessage={props.isLastUserMessage}
        threadStatus={props.threadStatus}
        onCancelEdit={props.onCancelEdit}
        onEdit={props.onEdit}
        onEditDraftChange={props.onEditDraftChange}
        onEditSubmit={props.onEditSubmit}
        onRetry={props.onRetry}
        onBranch={props.onBranch}
        onOpenLinkedDetails={props.onOpenLinkedDetails}
      />
    );
  } else if (props.message.role === 'assistant') {
    content = (
      <AssistantMessage
        message={props.message}
        onOpenLinkedDetails={props.onOpenLinkedDetails}
        onBranch={props.onBranch}
      />
    );
  } else {
    content = <StatusMessage message={props.message} />;
  }

  return <div className="agent-chat-message-enter">{content}</div>;
}

function PendingUserBubble({ text }: { text: string }): React.ReactElement {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[85%] rounded-xl rounded-tr-sm px-3.5 py-2.5 text-sm leading-relaxed opacity-80"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
      >
        {text}
      </div>
    </div>
  );
}

function StreamingIndicator({
  activeThread,
  onStop,
}: {
  activeThread: AgentChatThreadRecord | null;
  onStop?: () => Promise<void>;
}): React.ReactElement | null {
  // When thread is null we're in context-building phase — always show the indicator.
  const isStreaming = !activeThread || activeThread.status === 'submitting' || activeThread.status === 'running';
  if (!isStreaming) return null;

  return (
    <div className="flex items-center justify-between pl-7 pr-1">
      <div className="flex items-center gap-2">
        <span className="agent-chat-streaming-cursor text-sm font-semibold" style={{ color: 'var(--accent)' }} />
        <span className="text-xs text-[var(--text-muted)]">Claude is working...</span>
      </div>
      {onStop && (
        <button
          onClick={() => void onStop()}
          title="Stop task"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors duration-100 hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error, #f85149)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
          Stop
        </button>
      )}
    </div>
  );
}

function InlineError({ error }: { error: string | null }): React.ReactElement | null {
  if (!error) return null;
  return (
    <div className="mx-4 rounded-lg px-3 py-2 text-xs text-[var(--error,#f85149)]" style={{ backgroundColor: 'rgba(248, 81, 73, 0.08)' }}>
      {error}
    </div>
  );
}

function FailedBanner({ activeThread }: { activeThread: AgentChatThreadRecord }): React.ReactElement | null {
  if (activeThread.status !== 'failed' && activeThread.status !== 'cancelled') return null;
  const label = activeThread.status === 'failed' ? 'Task failed' : 'Task cancelled';
  return (
    <div className="flex justify-center">
      <div className="rounded-full px-3 py-1 text-[11px] font-medium" style={{ color: 'var(--error, #f85149)', backgroundColor: 'rgba(248, 81, 73, 0.08)' }}>
        {label}
      </div>
    </div>
  );
}

function LoadingState(): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-xs text-[var(--text-muted)]">Loading chats...</div>
    </div>
  );
}

function MissingProjectState(): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div style={{ opacity: 0.3 }}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M8 14C8 12.3431 9.34315 11 11 11H19L23 15H37C38.6569 15 40 16.3431 40 18V34C40 35.6569 38.6569 37 37 37H11C9.34315 37 8 35.6569 8 34V14Z"
            stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
          />
          <path d="M8 20H40" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
      <div className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
        Open a project folder to get started
      </div>
      <div className="max-w-[280px] text-xs" style={{ color: 'var(--text-faint, var(--text-muted))' }}>
        Agent chat requires an active workspace. Open a folder to begin.
      </div>
    </div>
  );
}

const SUGGESTED_PROMPTS = [
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    ),
    title: 'Explain the architecture',
    description: 'Overview of project structure and key patterns',
    prompt: 'Explain the architecture of this project',
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
    ),
    title: 'Find and fix bugs',
    description: 'Analyze recent changes for potential issues',
    prompt: 'Find and fix bugs in recent changes',
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title: 'Write tests',
    description: 'Generate test coverage for the current file',
    prompt: 'Write tests for the current file',
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
    title: 'Refactor for performance',
    description: 'Optimize code for speed and maintainability',
    prompt: 'Refactor for better performance',
  },
];

function EmptyConversationState(props: {
  onSelectPrompt?: (prompt: string) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      {/* Header */}
      <div className="flex flex-col items-center gap-2">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full text-base font-bold"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)', opacity: 0.8 }}
        >
          C
        </div>
        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          Start a conversation
        </div>
        <div className="max-w-[300px] text-xs" style={{ color: 'var(--text-muted)' }}>
          Ask Claude to inspect, edit, or verify code. Your first message creates the thread.
        </div>
      </div>

      {/* Suggested prompts grid */}
      <div className="grid w-full max-w-[440px] grid-cols-2 gap-2">
        {SUGGESTED_PROMPTS.map((item) => (
          <button
            key={item.prompt}
            onClick={() => props.onSelectPrompt?.(item.prompt)}
            className="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[var(--bg-tertiary)]"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              {item.icon}
              <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                {item.title}
              </span>
            </div>
            <span className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
              {item.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function useSmartAutoScroll(deps: unknown[]): {
  scrollRef: React.RefObject<HTMLDivElement>;
  onScroll: () => void;
} {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 50;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, []);

  const onScroll = useCallback(() => {
    checkNearBottom();
  }, [checkNearBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { scrollRef: scrollRef as React.RefObject<HTMLDivElement>, onScroll };
}

function findLastUserMessageId(messages: AgentChatMessageRecord[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].id;
  }
  return null;
}

function ConversationBody(props: {
  activeThread: AgentChatThreadRecord | null;
  error: string | null;
  hasProject: boolean;
  isSending: boolean;
  isLoading: boolean;
  onEdit: (message: AgentChatMessageRecord) => void;
  onRetry: (message: AgentChatMessageRecord) => void;
  onBranch: (message: AgentChatMessageRecord) => void;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  onStop?: () => Promise<void>;
  pendingUserMessage?: string | null;
  onSelectThread?: (threadId: string) => void;
  onDraftChange?: (value: string) => void;
}): React.ReactElement {
  const streaming = useAgentChatStreaming(props.activeThread?.id ?? null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const { scrollRef, onScroll } = useSmartAutoScroll([
    props.activeThread?.messages.length,
    props.activeThread?.status,
    streaming.blocks.length,
    streaming.activeTextContent,
  ]);

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
    const originalMessage = props.activeThread?.messages.find((m) => m.id === editingMessageId);
    if (originalMessage) {
      props.onEdit({ ...originalMessage, content: trimmed });
    }
    setEditingMessageId(null);
    setEditDraft('');
  }, [editDraft, editingMessageId, props]);

  if (!props.hasProject) return <MissingProjectState />;
  if (props.isLoading) return <LoadingState />;

  // No thread yet but a send is in progress — show the optimistic user message
  // while context building runs on the main process.
  if (!props.activeThread) {
    if (props.isSending && props.pendingUserMessage) {
      return (
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <PendingUserBubble text={props.pendingUserMessage} />
          <StreamingIndicator activeThread={null} onStop={props.onStop} />
        </div>
      );
    }
    return <EmptyConversationState onSelectPrompt={props.onDraftChange} />;
  }

  const threadIsActive = props.activeThread.status === 'submitting' || props.activeThread.status === 'running';
  const showStreamingMessage = streaming.isStreaming && streaming.blocks.length > 0;
  const lastUserMessageId = findLastUserMessageId(props.activeThread.messages);

  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
      {props.activeThread.branchInfo && props.onSelectThread && (
        <AgentChatBranchIndicator
          branchInfo={props.activeThread.branchInfo}
          onSwitchToParent={props.onSelectThread}
        />
      )}
      {props.activeThread.messages.map((message) => (
        <MessageCard
          key={message.id}
          message={message}
          editingMessageId={editingMessageId}
          editDraft={editDraft}
          isLastUserMessage={message.id === lastUserMessageId}
          threadStatus={props.activeThread!.status}
          onCancelEdit={handleCancelEdit}
          onEdit={handleStartEdit}
          onEditDraftChange={setEditDraft}
          onEditSubmit={handleEditSubmit}
          onRetry={props.onRetry}
          onBranch={props.onBranch}
          onOpenLinkedDetails={props.onOpenLinkedDetails}
        />
      ))}
      {/* Show optimistic pending message for follow-up sends while thread is updating */}
      {props.pendingUserMessage && props.isSending && (
        <PendingUserBubble text={props.pendingUserMessage} />
      )}
      {showStreamingMessage ? (
        <AgentChatStreamingMessage
          blocks={streaming.blocks}
          isStreaming={streaming.isStreaming}
          activeTextContent={streaming.activeTextContent}
        />
      ) : (
        (threadIsActive || (props.isSending && !props.pendingUserMessage)) &&
          <StreamingIndicator activeThread={props.activeThread} onStop={props.onStop} />
      )}
      <FailedBanner activeThread={props.activeThread} />
      <InlineError error={props.error} />
    </div>
  );
}

export function AgentChatConversation(props: AgentChatConversationProps): React.ReactElement {
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-secondary)]">
      <ConversationBody
        activeThread={props.activeThread}
        error={props.error}
        hasProject={props.hasProject}
        isSending={props.isSending}
        isLoading={props.isLoading}
        onEdit={props.onEdit}
        onRetry={props.onRetry}
        onBranch={props.onBranch}
        onOpenLinkedDetails={props.onOpenLinkedDetails}
        onStop={props.onStop}
        pendingUserMessage={props.pendingUserMessage}
        onSelectThread={props.onSelectThread}
        onDraftChange={props.onDraftChange}
      />
      <AgentChatComposer
        canSend={props.canSend}
        disabled={!props.hasProject}
        draft={props.draft}
        isSending={props.isSending}
        messages={props.activeThread?.messages}
        onChange={props.onDraftChange}
        onSubmit={props.onSend}
        pinnedFiles={props.pinnedFiles}
        onRemoveFile={props.onRemoveFile}
        contextSummary={props.contextSummary}
        autocompleteResults={props.autocompleteResults}
        isAutocompleteOpen={props.isAutocompleteOpen}
        onAutocompleteQuery={props.onAutocompleteQuery}
        onSelectFile={props.onSelectFile}
        onCloseAutocomplete={props.onCloseAutocomplete}
        onOpenAutocomplete={props.onOpenAutocomplete}
        mentions={props.mentions}
        onAddMention={props.onAddMention}
        onRemoveMention={props.onRemoveMention}
        allFiles={props.allFiles}
      />
      <AgentChatDetailsDrawer
        activeLink={props.details?.link ?? props.activeThread?.latestOrchestration}
        details={props.details}
        error={props.detailsError}
        isLoading={props.detailsIsLoading}
        isOpen={props.isDetailsOpen}
        onClose={props.closeDetails}
        onOpenOrchestration={props.onOpenLinkedTask}
      />
    </div>
  );
}
