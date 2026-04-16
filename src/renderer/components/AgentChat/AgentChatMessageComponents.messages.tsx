import React, { useMemo } from 'react';

import type {
  AgentChatContentBlock,
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
} from '../../types/electron';
import { AgentChatBlockRenderer } from './AgentChatBlockRenderer';
import { formatTimestamp, formatTimestampFull } from './agentChatFormatters';
import { UserMessageActions } from './AgentChatMessageActions';
import { ContextSummaryRow } from './AgentChatMessageComponents.rows';
import { AgentChatToolGroup } from './AgentChatToolGroup';
import { StreamingChangeSummaryBar } from './ChangeSummaryBar';
import { MessageMarkdown } from './MessageMarkdown';
import { ReactionBar } from './ReactionBar';
import { StreamingStatusMessage } from './streamingUtils';
import { useSelectionQuote } from './useSelectionQuote';

const USER_BUBBLE_STYLE: React.CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--surface-overlay) 38%, transparent)',
  border: '1px solid color-mix(in srgb, var(--border-semantic-subtle) 70%, transparent)',
  boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--surface-raised) 35%, transparent)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
};

export interface UserMessageProps {
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
}

type EditModeProps = Pick<
  UserMessageProps,
  'editDraft' | 'onEditDraftChange' | 'onEditSubmit' | 'onCancelEdit'
>;

function handleEditKeyDown(
  props: EditModeProps,
  e: React.KeyboardEvent<HTMLTextAreaElement>,
): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    props.onEditSubmit();
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    props.onCancelEdit();
  }
}

function UserMessageEditMode(props: EditModeProps): React.ReactElement {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[85%] rounded-xl rounded-br-sm px-3.5 py-2.5 text-text-semantic-primary"
        style={USER_BUBBLE_STYLE}
      >
        <textarea
          autoFocus
          value={props.editDraft}
          onChange={(e) => props.onEditDraftChange(e.target.value)}
          onKeyDown={(e) => handleEditKeyDown(props, e)}
          className="w-full resize-none rounded-lg border bg-surface-base border-border-semantic p-2 text-sm text-text-semantic-primary focus:border-interactive-accent focus:outline-hidden"
          style={{ fontFamily: 'var(--font-ui)', minHeight: '60px' }}
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

// ── UserMessage sub-components ────────────────────────────────────────────────

interface UserBubbleProps {
  message: AgentChatMessageRecord;
  isLastUserMessage: boolean;
  threadStatus: string;
  onEdit: UserMessageProps['onEdit'];
  onRetry: UserMessageProps['onRetry'];
  onBranch: UserMessageProps['onBranch'];
}

function UserMessageBubble(props: UserBubbleProps): React.ReactElement {
  return (
    <div className="flex items-end justify-end gap-1.5 w-full">
      <UserMessageActions
        message={props.message}
        isLastUserMessage={props.isLastUserMessage}
        threadStatus={props.threadStatus}
        onEdit={props.onEdit}
        onRetry={props.onRetry}
        onBranch={props.onBranch}
      />
      <div
        className="max-w-[85%] rounded-xl rounded-br-sm px-3.5 py-2.5 text-text-semantic-primary"
        style={USER_BUBBLE_STYLE}
      >
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {props.message.content || ' '}
        </div>
        <ContextSummaryRow message={props.message} />
        <div
          className="mt-1 text-right text-[10px] text-text-semantic-faint"
          title={formatTimestampFull(props.message.createdAt)}
        >
          {formatTimestamp(props.message.createdAt)}
        </div>
      </div>
    </div>
  );
}

interface UserFooterProps {
  messageId: string;
  reactions: import('../../types/electron').Reaction[];
  onQuote: () => void;
}

function UserMessageFooter(props: UserFooterProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity duration-100 group-hover:opacity-100 pr-0.5">
      <button
        type="button"
        title="Quote selection in composer"
        onClick={props.onQuote}
        className="rounded px-1.5 py-0.5 text-[11px] text-text-semantic-muted hover:bg-surface-hover hover:text-text-semantic-primary transition-colors duration-100"
      >
        Quote
      </button>
      <ReactionBar messageId={props.messageId} reactions={props.reactions} />
    </div>
  );
}

// ── UserMessage ───────────────────────────────────────────────────────────────

export const UserMessage = React.memo(function UserMessage(
  props: UserMessageProps,
): React.ReactElement {
  const { quoteMessage } = useSelectionQuote({
    messageContent: props.message.content ?? '',
    attribution: { role: 'user', timestamp: props.message.createdAt },
  });

  if (props.isEditing)
    return (
      <UserMessageEditMode
        editDraft={props.editDraft}
        onEditDraftChange={props.onEditDraftChange}
        onEditSubmit={props.onEditSubmit}
        onCancelEdit={props.onCancelEdit}
      />
    );

  return (
    <div className="group flex flex-col items-end gap-0.5">
      <UserMessageBubble
        message={props.message}
        isLastUserMessage={props.isLastUserMessage}
        threadStatus={props.threadStatus}
        onEdit={props.onEdit}
        onRetry={props.onRetry}
        onBranch={props.onBranch}
      />
      <UserMessageFooter
        messageId={props.message.id}
        reactions={props.message.reactions ?? []}
        onQuote={quoteMessage}
      />
    </div>
  );
});

type RenderItem =
  | { type: 'text'; block: AgentChatContentBlock; index: number }
  | { type: 'thinking'; block: AgentChatContentBlock; index: number }
  | { type: 'tool-group'; tools: AgentChatContentBlock[]; startIndex: number }
  | { type: 'single-tool'; block: AgentChatContentBlock; index: number }
  | { type: 'block'; block: AgentChatContentBlock; index: number };

function buildRenderItems(blocks: AgentChatContentBlock[]): RenderItem[] {
  const items: RenderItem[] = [];
  for (let i = 0; i < blocks.length; ) {
    const block = blocks[i];
    if (block.kind === 'text') { items.push({ type: 'text', block, index: i }); i++; continue; }
    if (block.kind === 'thinking') { items.push({ type: 'thinking', block, index: i }); i++; continue; }
    if (block.kind === 'tool_use') {
      const run: AgentChatContentBlock[] = [];
      const startIndex = i;
      while (i < blocks.length && blocks[i].kind === 'tool_use') { run.push(blocks[i]); i++; }
      items.push(run.length >= 2 ? { type: 'tool-group', tools: run, startIndex } : { type: 'single-tool', block: run[0], index: startIndex });
      continue;
    }
    items.push({ type: 'block', block, index: i });
    i++;
  }
  return items;
}

function findLastTextIndex(items: RenderItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].type === 'text') return i;
  }
  return -1;
}

function renderToolGroup(item: RenderItem & { type: 'tool-group' }, isStreaming: boolean): React.ReactNode {
  return (
    <AgentChatToolGroup
      key={`tg-${item.startIndex}`}
      blocks={item.tools as Array<AgentChatContentBlock & { kind: 'tool_use' }>}
      defaultExpanded={isStreaming && item.tools.some((t) => t.kind === 'tool_use' && t.status === 'running')}
    />
  );
}

function renderItem(item: RenderItem, isStreaming: boolean, isLastText: boolean): React.ReactNode {
  if (item.type === 'text') {
    const content = (item.block as AgentChatContentBlock & { kind: 'text' }).content;
    return (
      <div key={`text-${item.index}`} className="pl-7 pb-0.5">
        <MessageMarkdown content={content} streaming={isStreaming && isLastText} />
      </div>
    );
  }
  if (item.type === 'thinking')
    return (
      <AgentChatBlockRenderer
        key={`thinking-${item.index}`}
        block={item.block}
        index={item.index}
        isStreaming={isStreaming}
        isLastBlock={false}
      />
    );
  if (item.type === 'tool-group') return renderToolGroup(item, isStreaming);
  return (
    <AgentChatBlockRenderer
      key={item.type === 'single-tool' ? `tool-${item.index}` : `block-${item.index}`}
      block={item.block}
      index={item.index}
      isStreaming={isStreaming}
      isLastBlock={false}
    />
  );
}

export function AssistantBlocksContent({
  blocks,
  isStreaming = false,
  onStop,
}: {
  blocks: AgentChatContentBlock[];
  isStreaming?: boolean;
  onStop?: () => Promise<void>;
}): React.ReactElement {
  const renderItems = useMemo(() => buildRenderItems(blocks), [blocks]);
  const lastTextIdx = isStreaming ? findLastTextIndex(renderItems) : -1;
  return (
    <div className="space-y-2">
      {renderItems.map((item, i) => renderItem(item, isStreaming, i === lastTextIdx))}
      {isStreaming && <StreamingStatusMessage onStop={onStop} />}
      {isStreaming && <StreamingChangeSummaryBar blocks={blocks} isStreaming={isStreaming} />}
    </div>
  );
}

/* AssistantMessage and its sub-components live in AgentChatMessageComponents.assistant.tsx */
export { AssistantMessage } from './AgentChatMessageComponents.assistant';
