import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  AgentChatContentBlock,
  AgentChatLinkedDetailsResult,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
  ImageAttachment,
} from '../../types/electron';
import type { FileEntry } from '../FileTree/FileListItem';
import { AgentChatBlockRenderer } from './AgentChatBlockRenderer';
import { AgentChatBranchIndicator } from './AgentChatBranchIndicator';
import { AgentChatComposer } from './AgentChatComposer';
import { AgentChatDetailsDrawer } from './AgentChatDetailsDrawer';
import { formatTimestamp, formatTimestampFull } from './agentChatFormatters';
import {
  AssistantMessageActions,
  UserMessageActions,
} from './AgentChatMessageActions';
import { AgentChatStreamingMessage } from './AgentChatStreamingMessage';
import { AgentChatToolGroup } from './AgentChatToolGroup';
import { CompletedChangeSummaryBar, extractChangeTallyFromBlocks, hasFileChanges } from './ChangeSummaryBar';
import type { ChatOverrides } from './ChatControlsBar';
import type { MentionItem } from './MentionAutocomplete';
import { MessageMarkdown } from './MessageMarkdown';
import type { SlashCommandContext } from './SlashCommandMenu';
import { StreamingStatusMessage } from './streamingUtils';
import type { PinnedFile } from './useAgentChatContext';
import { useAgentChatStreaming } from './useAgentChatStreaming';
import type { QueuedMessage } from './useAgentChatWorkspace';

const FILE_MODIFYING_TOOLS_SET = new Set([
  'Write', 'Edit', 'MultiEdit', 'write_file', 'edit_file', 'multi_edit',
  'NotebookEdit', 'create_file',
]);

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
  onRevert?: (message: AgentChatMessageRecord) => void;
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
  // Chat-level overrides
  chatOverrides?: ChatOverrides;
  onChatOverridesChange?: (overrides: ChatOverrides) => void;
  settingsModel?: string;
  slashCommandContext?: SlashCommandContext;
  // Message queue
  queuedMessages?: QueuedMessage[];
  onEditQueuedMessage?: (id: string) => void;
  onDeleteQueuedMessage?: (id: string) => void;
  onSendQueuedMessageNow?: (id: string) => Promise<void>;
  // Image attachments
  attachments?: ImageAttachment[];
  onAttachmentsChange?: (attachments: ImageAttachment[]) => void;
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

const UserMessage = React.memo(function UserMessage(props: {
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
      <div className="max-w-[85%] rounded-lg px-3.5 py-2.5" style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)', borderRadius: '8px' }}>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{props.message.content || ' '}</div>
        <ContextSummaryRow message={props.message} />
        <div className="mt-1 text-right text-[10px]" style={{ color: 'var(--bg)', opacity: 0.6 }} title={formatTimestampFull(props.message.createdAt)}>{formatTimestamp(props.message.createdAt)}</div>
      </div>
    </div>
  );
});

/**
 * Renders content blocks in their natural sequence order.
 *
 * Text, tool groups, thinking, and structural blocks are interleaved exactly
 * as the model produced them. Consecutive tool_use blocks are collapsed into
 * a single ToolGroup card; everything else renders at its position.
 */
function AssistantBlocksContent({ blocks, isStreaming = false, onStop }: {
  blocks: AgentChatContentBlock[];
  isStreaming?: boolean;
  onStop?: () => Promise<void>;
}): React.ReactElement {
  // Build render items in block order — preserves interleaving of text between tools
  type RenderItem =
    | { type: 'text'; block: AgentChatContentBlock; index: number }
    | { type: 'thinking'; block: AgentChatContentBlock; index: number }
    | { type: 'tool-group'; tools: AgentChatContentBlock[]; startIndex: number }
    | { type: 'single-tool'; block: AgentChatContentBlock; index: number }
    | { type: 'block'; block: AgentChatContentBlock; index: number };

  // Blocks are rendered in their natural API order — no render-time merging.
  // Block identity is preserved from the provider API through to here via
  // blockIndex, so each block is already at its correct position.
  const renderItems = useMemo<RenderItem[]>(() => {
    const rawItems: RenderItem[] = [];
    let i = 0;
    while (i < blocks.length) {
      const block = blocks[i];
      if (block.kind === 'text') {
        rawItems.push({ type: 'text', block, index: i });
        i++;
      } else if (block.kind === 'thinking') {
        rawItems.push({ type: 'thinking', block, index: i });
        i++;
      } else if (block.kind === 'tool_use') {
        // Group consecutive tool_use blocks
        const run: AgentChatContentBlock[] = [];
        const startIdx = i;
        while (i < blocks.length && blocks[i].kind === 'tool_use') {
          run.push(blocks[i]);
          i++;
        }
        if (run.length >= 2) {
          rawItems.push({ type: 'tool-group', tools: run, startIndex: startIdx });
        } else {
          rawItems.push({ type: 'single-tool', block: run[0], index: startIdx });
        }
      } else {
        // code, diff, plan, error, etc.
        rawItems.push({ type: 'block', block, index: i });
        i++;
      }
    }
    return rawItems;
  }, [blocks]);

  return (
    <div className="space-y-2">
      {renderItems.map((item) => {
        if (item.type === 'text') {
          const textBlock = item.block as AgentChatContentBlock & { kind: 'text' };
          return (
            <div key={`text-${item.index}`} className="pl-7 pb-0.5">
              <MessageMarkdown content={textBlock.content} />
            </div>
          );
        }

        if (item.type === 'thinking') {
          return (
            <AgentChatBlockRenderer
              key={`thinking-${item.index}`}
              block={item.block}
              index={item.index}
              isStreaming={isStreaming}
              isLastBlock={false}
            />
          );
        }

        if (item.type === 'tool-group') {
          const anyRunning = isStreaming && item.tools.some(
            (t) => t.kind === 'tool_use' && t.status === 'running',
          );
          return (
            <AgentChatToolGroup
              key={`tg-${item.startIndex}`}
              blocks={item.tools as Array<AgentChatContentBlock & { kind: 'tool_use' }>}
              defaultExpanded={anyRunning}
            />
          );
        }

        if (item.type === 'single-tool') {
          return (
            <AgentChatBlockRenderer
              key={`tool-${item.index}`}
              block={item.block}
              index={item.index}
              isStreaming={isStreaming}
              isLastBlock={false}
            />
          );
        }

        // Structural blocks (code, diff, plan, error)
        return (
          <AgentChatBlockRenderer
            key={`block-${item.index}`}
            block={item.block}
            index={item.index}
            isStreaming={isStreaming}
            isLastBlock={false}
          />
        );
      })}

      {/* Rotating status text + animated snake — shown throughout streaming */}
      {isStreaming && <StreamingStatusMessage onStop={onStop} />}
    </div>
  );
}

const AssistantMessage = React.memo(function AssistantMessage(props: {
  message: AgentChatMessageRecord;
  workspaceRoot?: string;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  onBranch: (message: AgentChatMessageRecord) => void;
  onRevert?: (message: AgentChatMessageRecord) => void;
}): React.ReactElement {
  // Detect streaming state — same component renders throughout the message lifecycle.
  // During streaming: blocks grow, snake shows, text animates.
  // On completion: isStreaming flips false, same DOM stays, animation stops.
  const msg = props.message as AgentChatMessageRecord & {
    _streaming?: boolean;
    _streamingState?: { isStreaming: boolean; onStop?: () => Promise<void> };
  };
  const isStreaming = msg._streaming === true && (msg._streamingState?.isStreaming ?? false);
  const onStop = msg._streamingState?.onStop;

  const hasBlocks = props.message.blocks && props.message.blocks.length > 0;
  const snapshotHash = props.message.orchestration?.preSnapshotHash;
  const showChangeSummary = !isStreaming && snapshotHash && props.workspaceRoot && hasBlocks
    && props.message.blocks && hasFileChanges(props.message.blocks);

  return (
    <div className="group flex justify-start">
      <div className="max-w-[95%] w-full">
        {/* Timestamp + actions — hidden during streaming, shown when persisted */}
        {!msg._streaming && (
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px]" style={{ color: 'var(--text-faint, var(--text-muted))' }} title={formatTimestampFull(props.message.createdAt)}>{formatTimestamp(props.message.createdAt)}</span>
            <AssistantMessageActions message={props.message} onBranch={props.onBranch} onRevert={props.onRevert} />
          </div>
        )}
        <div className="pb-1">
          {/* ONE render path for both streaming and persisted */}
          {hasBlocks ? (
            <AssistantBlocksContent blocks={props.message.blocks!} isStreaming={isStreaming} onStop={onStop} />
          ) : isStreaming ? (
            <StreamingStatusMessage onStop={onStop} />
          ) : (
            <MessageMarkdown content={props.message.content || ' '} />
          )}
          {!isStreaming && (
            <>
              <VerificationSummaryRow message={props.message} />
              <ErrorInline message={props.message} />
              <ToolsSummaryRow message={props.message} />
              <CostDurationRow message={props.message} />
              {showChangeSummary && (
                <CompletedChangeSummaryBar
                  snapshotHash={snapshotHash}
                  projectRoot={props.workspaceRoot!}
                  sessionId={props.message.id}
                  tally={extractChangeTallyFromBlocks(props.message.blocks!)}
                />
              )}
              <MessageActionLink message={props.message} onOpenLinkedDetails={props.onOpenLinkedDetails} />
            </>
          )}
        </div>
      </div>
    </div>
  );
});

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
  workspaceRoot?: string;
  onCancelEdit: () => void;
  onEdit: (message: AgentChatMessageRecord) => void;
  onEditDraftChange: (value: string) => void;
  onEditSubmit: () => void;
  onRetry: (message: AgentChatMessageRecord) => void;
  onBranch: (message: AgentChatMessageRecord) => void;
  onRevert?: (message: AgentChatMessageRecord) => void;
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
        workspaceRoot={props.workspaceRoot}
        onOpenLinkedDetails={props.onOpenLinkedDetails}
        onBranch={props.onBranch}
        onRevert={props.onRevert}
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

// StreamingIndicator removed — all working/thinking states now use the snake
// animation via AgentChatStreamingMessage.

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
  const label = activeThread.status === 'failed' ? 'Task failed' : 'Chat was stopped';
  // Surface the error message from the last assistant message (if any).
  // Backward loop avoids allocating a reversed copy on every streaming chunk render.
  let lastMsg: AgentChatMessageRecord | undefined;
  for (let i = activeThread.messages.length - 1; i >= 0; i--) {
    const m = activeThread.messages[i];
    if (m.role === 'assistant' && m.error) { lastMsg = m; break; }
  }
  const detail = lastMsg?.error?.message;
  // For cancelled status, don't show the banner if the last assistant message
  // has content — the partial response is already visible above.
  if (activeThread.status === 'cancelled') {
    const lastAssistant = activeThread.messages.findLast((m) => m.role === 'assistant');
    if (lastAssistant && (lastAssistant.content?.trim() || lastAssistant.blocks?.length)) {
      // Show a subtle inline indicator instead of a prominent banner
      return (
        <div className="flex justify-center">
          <div className="rounded-full px-3 py-1 text-[10px]" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-tertiary)' }}>
            Chat was stopped
          </div>
        </div>
      );
    }
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-full px-3 py-1 text-[11px] font-medium" style={{ color: 'var(--error, #f85149)', backgroundColor: 'rgba(248, 81, 73, 0.08)' }}>
        {label}
      </div>
      {detail && (
        <div className="max-w-md px-3 py-1 text-center text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {detail}
        </div>
      )}
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

function QueuedMessageBanner(props: {
  messages: QueuedMessage[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSendNow: (id: string) => Promise<void>;
}): React.ReactElement | null {
  if (props.messages.length === 0) return null;

  return (
    <div className="border-t px-3 py-1.5" style={{ borderColor: 'var(--border)' }}>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        Queued ({props.messages.length})
      </div>
      <div className="space-y-1">
        {props.messages.map((msg) => (
          <div
            key={msg.id}
            className="flex items-start gap-2 rounded-lg border px-2.5 py-1.5"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--bg)',
            }}
          >
            <div
              className="min-w-0 flex-1 truncate text-xs"
              style={{ color: 'var(--text)' }}
              title={msg.content}
            >
              {msg.content.length > 80 ? `${msg.content.slice(0, 80)}...` : msg.content}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                onClick={() => props.onEdit(msg.id)}
                title="Edit — move back to composer"
                className="rounded p-0.5 text-[10px] transition-colors duration-100 hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--text-muted)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                onClick={() => void props.onSendNow(msg.id)}
                title="Send now — interrupt current task"
                className="rounded p-0.5 text-[10px] transition-colors duration-100 hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--accent)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
              <button
                onClick={() => props.onDelete(msg.id)}
                title="Remove from queue"
                className="rounded p-0.5 text-[10px] transition-colors duration-100 hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error, #f85149)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
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
  onRevert?: (message: AgentChatMessageRecord) => void;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  onStop?: () => Promise<void>;
  pendingUserMessage?: string | null;
  onSelectThread?: (threadId: string) => void;
  onDraftChange?: (value: string) => void;
}): React.ReactElement {
  const streaming = useAgentChatStreaming(props.activeThread?.id ?? null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  // Auto-open diff review when agent completes with file changes.
  // Track previous streaming state to detect the false→true→false transition.
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = streaming.isStreaming;

    // Detect completion: was streaming → no longer streaming, has blocks with file changes
    if (wasStreaming && !streaming.isStreaming && streaming.blocks.length > 0) {
      const thread = props.activeThread;
      if (!thread) return;
      // Find the latest assistant message (just completed) to get its snapshot hash
      let lastAssistant: AgentChatMessageRecord | undefined;
      for (let i = thread.messages.length - 1; i >= 0; i--) {
        if (thread.messages[i].role === 'assistant') { lastAssistant = thread.messages[i]; break; }
      }
      const snapshotHash = lastAssistant?.orchestration?.preSnapshotHash;
      if (snapshotHash && thread.workspaceRoot) {
        // Check if the streaming blocks include file-modifying tools
        const hasFileEdits = streaming.blocks.some(
          (b) => b.kind === 'tool_use' && FILE_MODIFYING_TOOLS_SET.has(b.tool),
        );
        if (hasFileEdits) {
          window.dispatchEvent(
            new CustomEvent('agent-ide:open-diff-review', {
              detail: {
                sessionId: lastAssistant!.id,
                snapshotHash,
                projectRoot: thread.workspaceRoot,
              },
            }),
          );
        }
      }
    }
  }, [streaming.isStreaming, streaming.blocks, props.activeThread]);

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
  }, [editDraft, editingMessageId, props.activeThread, props.onEdit]);

  // Unified message list — must be called unconditionally (React hooks rule).
  // Injects a synthetic streaming assistant message into the messages array
  // using the streaming messageId as key, so React reconciles in-place when
  // the persisted message arrives (same ID) — no unmount/remount, no visual jump.
  const threadIsActive = props.activeThread?.status === 'submitting' || props.activeThread?.status === 'running';
  const streamingIsActive = streaming.isStreaming || streaming.blocks.length > 0 || threadIsActive;
  const streamingAlreadyPersisted = streaming.streamingMessageId && props.activeThread
    ? props.activeThread.messages.some((m) => m.id === streaming.streamingMessageId)
    : false;

  const messagesWithStreaming = useMemo(() => {
    if (!props.activeThread) return [];

    const filtered = props.activeThread.messages.filter((message) => {
      if (message.role === 'status') {
        const kind = (message as { statusKind?: string }).statusKind;
        if (kind === 'context' || kind === 'progress' || kind === 'verification') return false;
      }
      return true;
    });

    if (streamingIsActive && !streamingAlreadyPersisted) {
      const syntheticMessage: AgentChatMessageRecord = {
        id: streaming.streamingMessageId || `streaming-${Date.now()}`,
        threadId: props.activeThread.id,
        role: 'assistant',
        content: streaming.activeTextContent || '',
        createdAt: Date.now(),
        blocks: streaming.blocks.length > 0 ? streaming.blocks : undefined,
        _streaming: true,
        _streamingState: {
          isStreaming: threadIsActive || streaming.isStreaming,
          onStop: props.onStop,
        },
      } as AgentChatMessageRecord & { _streaming: boolean; _streamingState: { isStreaming: boolean; onStop?: () => Promise<void> } };
      filtered.push(syntheticMessage);
    }

    return filtered;
  }, [props.activeThread, streaming, streamingIsActive, streamingAlreadyPersisted, threadIsActive, props.onStop]);

  const lastUserMessageId = props.activeThread ? findLastUserMessageId(props.activeThread.messages) : null;

  if (!props.hasProject) return <MissingProjectState />;
  if (props.isLoading) return <LoadingState />;

  if (!props.activeThread) {
    if (props.isSending && props.pendingUserMessage) {
      return (
        <div ref={scrollRef} onScroll={onScroll} className="selectable flex flex-1 flex-col overflow-y-auto px-4 py-3">
          <div className="mt-auto space-y-4">
            <PendingUserBubble text={props.pendingUserMessage} />
            <AgentChatStreamingMessage
              blocks={[]}
              isStreaming={true}
              activeTextContent=""
              onStop={props.onStop}
            />
          </div>
        </div>
      );
    }
    return <EmptyConversationState onSelectPrompt={props.onDraftChange} />;
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className="selectable flex flex-1 flex-col overflow-y-auto px-4 py-3">
      <div className="mt-auto space-y-4">
        {props.activeThread.branchInfo && props.onSelectThread && (
          <AgentChatBranchIndicator
            branchInfo={props.activeThread.branchInfo}
            onSwitchToParent={props.onSelectThread}
          />
        )}
        {messagesWithStreaming.map((message) => (
          <MessageCard
            key={message.id}
            message={message}
            editingMessageId={editingMessageId}
            editDraft={editDraft}
            isLastUserMessage={message.id === lastUserMessageId}
            threadStatus={props.activeThread!.status}
            workspaceRoot={props.activeThread!.workspaceRoot}
            onCancelEdit={handleCancelEdit}
            onEdit={handleStartEdit}
            onEditDraftChange={setEditDraft}
            onEditSubmit={handleEditSubmit}
            onRetry={props.onRetry}
            onBranch={props.onBranch}
            onRevert={props.onRevert}
            onOpenLinkedDetails={props.onOpenLinkedDetails}
          />
        ))}
        {/* Show optimistic pending message for follow-up sends while thread is updating */}
        {props.pendingUserMessage && props.isSending && (
          <PendingUserBubble text={props.pendingUserMessage} />
        )}
        <FailedBanner activeThread={props.activeThread} />
        <InlineError error={props.error} />
      </div>
    </div>
  );
}

/** Per-model context usage entry. */
export interface ModelContextUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Returns context usage aggregated per model for the active thread.
 * Each entry shows the last input (context window) and cumulative output for that model.
 */
function useThreadModelUsage(thread: AgentChatThreadRecord | null | undefined): ModelContextUsage[] | undefined {
  return useMemo(() => {
    if (!thread?.messages) return undefined;
    // Track per-model: last input tokens seen, cumulative output
    const perModel = new Map<string, { inputTokens: number; outputTokens: number }>();
    for (const msg of thread.messages) {
      if (!msg.tokenUsage) continue;
      const modelKey = msg.model || '';
      const existing = perModel.get(modelKey);
      if (existing) {
        // Input tokens = last turn's context window size (overwrite, not accumulate)
        existing.inputTokens = msg.tokenUsage.inputTokens;
        // Output tokens are cumulative from the adapter
        existing.outputTokens = msg.tokenUsage.outputTokens;
      } else {
        perModel.set(modelKey, {
          inputTokens: msg.tokenUsage.inputTokens,
          outputTokens: msg.tokenUsage.outputTokens,
        });
      }
    }
    if (perModel.size === 0) return undefined;
    return Array.from(perModel.entries()).map(([model, usage]) => ({
      model,
      ...usage,
    }));
  }, [thread?.messages]);
}

export function AgentChatConversation(props: AgentChatConversationProps): React.ReactElement {
  const threadModelUsage = useThreadModelUsage(props.activeThread);

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
        onRevert={props.onRevert}
        onOpenLinkedDetails={props.onOpenLinkedDetails}
        onStop={props.onStop}
        pendingUserMessage={props.pendingUserMessage}
        onSelectThread={props.onSelectThread}
        onDraftChange={props.onDraftChange}
      />
      {props.queuedMessages && props.queuedMessages.length > 0 && props.onEditQueuedMessage && props.onDeleteQueuedMessage && props.onSendQueuedMessageNow && (
        <QueuedMessageBanner
          messages={props.queuedMessages}
          onEdit={props.onEditQueuedMessage}
          onDelete={props.onDeleteQueuedMessage}
          onSendNow={props.onSendQueuedMessageNow}
        />
      )}
      <AgentChatComposer
        canSend={props.canSend}
        disabled={!props.hasProject}
        draft={props.draft}
        isSending={props.isSending}
        threadIsBusy={props.activeThread?.status === 'submitting' || props.activeThread?.status === 'running'}
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
        chatOverrides={props.chatOverrides}
        onChatOverridesChange={props.onChatOverridesChange}
        settingsModel={props.settingsModel}
        threadModelUsage={threadModelUsage}
        slashCommandContext={props.slashCommandContext}
        attachments={props.attachments}
        onAttachmentsChange={props.onAttachmentsChange}
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
