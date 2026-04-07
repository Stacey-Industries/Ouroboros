import React from 'react';

import type {
  AgentChatMessageRecord,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
} from '../../types/electron';
import { AssistantMessage } from './AgentChatMessageComponents.assistant';
import { UserMessage } from './AgentChatMessageComponents.messages';

/* Re-export sub-module symbols so all consumers keep the same import path. */
export { AssistantMessage } from './AgentChatMessageComponents.assistant';
export type { UserMessageProps } from './AgentChatMessageComponents.messages';
export { AssistantBlocksContent, UserMessage } from './AgentChatMessageComponents.messages';
export { EmptyConversationState, QueuedMessageBanner } from './AgentChatMessageComponents.queue';
export {
  ContextSummaryRow,
  CostDurationRow,
  ErrorInline,
  MessageActionLink,
  ToolsSummaryRow,
  VerificationSummaryRow,
} from './AgentChatMessageComponents.rows';

const USER_BUBBLE_STYLE: React.CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--surface-overlay) 38%, transparent)',
  border: '1px solid color-mix(in srgb, var(--border-semantic-subtle) 70%, transparent)',
  boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--surface-raised) 35%, transparent)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
};

function extractContextFileCount(content: string): number | null {
  const match = /Prepared context from (\d+) file/.exec(content);
  return match ? parseInt(match[1], 10) : null;
}

export function StatusMessage(props: { message: AgentChatMessageRecord }): React.ReactElement {
  const [pulsing, setPulsing] = React.useState(true);
  React.useEffect(() => {
    const timer = setTimeout(() => setPulsing(false), 300);
    return () => clearTimeout(timer);
  }, []);
  const isContext = (props.message as { statusKind?: string }).statusKind === 'context';
  if (isContext) {
    const fileCount = extractContextFileCount(props.message.content || '');
    const label =
      fileCount !== null
        ? `Context injected — ${fileCount} file${fileCount === 1 ? '' : 's'}`
        : 'Context injected';
    return (
      <div className="flex justify-center my-1">
        <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] text-text-semantic-muted bg-surface-raised">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2.5 6L5 8.5L9.5 3.5"
              stroke="var(--status-success, #3fb950)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{label}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-center">
      <div
        className={`rounded-full px-3 py-1 text-[11px] text-text-semantic-muted bg-surface-raised ${pulsing ? 'agent-chat-status-pulse' : ''}`}
      >
        {props.message.content || 'Status update'}
      </div>
    </div>
  );
}

export interface MessageCardProps {
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
}

export const MessageCard = React.memo(function MessageCard(
  props: MessageCardProps,
): React.ReactElement {
  const content =
    props.message.role === 'user' ? (
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
    ) : props.message.role === 'assistant' ? (
      <AssistantMessage
        message={props.message}
        workspaceRoot={props.workspaceRoot}
        onOpenLinkedDetails={props.onOpenLinkedDetails}
        onBranch={props.onBranch}
        onRevert={props.onRevert}
      />
    ) : (
      <StatusMessage message={props.message} />
    );
  return <div className="agent-chat-message-enter">{content}</div>;
});

function findLastAssistantError(messages: AgentChatMessageRecord[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--)
    if (messages[i].role === 'assistant' && messages[i].error) return messages[i].error?.message;
  return undefined;
}

function CancelledPartialBanner(): React.ReactElement {
  return (
    <div className="flex justify-center">
      <div className="rounded-full px-3 py-1 text-[10px] text-text-semantic-muted bg-surface-raised">
        Chat was stopped
      </div>
    </div>
  );
}

function hasCancelledPartial(messages: AgentChatMessageRecord[]): boolean {
  const last = messages.findLast((m) => m.role === 'assistant');
  return Boolean(last && (last.content?.trim() || last.blocks?.length));
}

export function FailedBanner({
  activeThread,
}: {
  activeThread: AgentChatThreadRecord;
}): React.ReactElement | null {
  if (activeThread.status !== 'failed' && activeThread.status !== 'cancelled') return null;
  if (activeThread.status === 'cancelled' && hasCancelledPartial(activeThread.messages))
    return <CancelledPartialBanner />;
  const detail = findLastAssistantError(activeThread.messages);
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="rounded-full px-3 py-1 text-[11px] font-medium text-status-error"
        style={{ backgroundColor: 'var(--status-error-subtle)' }}
      >
        {activeThread.status === 'failed' ? 'Task failed' : 'Chat was stopped'}
      </div>
      {detail && (
        <div className="max-w-md px-3 py-1 text-center text-[10px] text-text-semantic-muted">
          {detail}
        </div>
      )}
    </div>
  );
}

export function LoadingState(): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-xs text-text-semantic-muted">Loading chats...</div>
    </div>
  );
}

export function MissingProjectState(): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div style={{ opacity: 0.3 }}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M8 14C8 12.3431 9.34315 11 11 11H19L23 15H37C38.6569 15 40 16.3431 40 18V34C40 35.6569 38.6569 37 37 37H11C9.34315 37 8 35.6569 8 34V14Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8 20H40" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
      <div className="text-sm font-medium text-text-semantic-muted">
        Open a project folder to get started
      </div>
      <div className="max-w-[280px] text-xs text-text-semantic-faint">
        Agent chat requires an active workspace. Open a folder to begin.
      </div>
    </div>
  );
}

export function PendingUserBubble({ text }: { text: string }): React.ReactElement {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[85%] rounded-xl rounded-br-sm px-3.5 py-2.5 text-sm leading-relaxed opacity-80 text-text-semantic-primary"
        style={USER_BUBBLE_STYLE}
      >
        {text}
      </div>
    </div>
  );
}

export function InlineError({ error }: { error: string | null }): React.ReactElement | null {
  return error ? (
    <div
      className="mx-4 rounded-lg px-3 py-2 text-xs text-status-error"
      style={{ backgroundColor: 'var(--status-error-subtle)' }}
    >
      {error}
    </div>
  ) : null;
}
