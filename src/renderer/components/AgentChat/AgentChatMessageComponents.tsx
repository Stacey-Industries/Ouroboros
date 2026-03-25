import React, { useMemo } from 'react';

import type { AgentChatContentBlock, AgentChatMessageRecord, AgentChatOrchestrationLink, AgentChatThreadRecord } from '../../types/electron';
import { AgentChatBlockRenderer } from './AgentChatBlockRenderer';
import { formatTimestamp, formatTimestampFull } from './agentChatFormatters';
import { AssistantMessageActions, UserMessageActions } from './AgentChatMessageActions';
import { AgentChatToolGroup } from './AgentChatToolGroup';
import { CompletedChangeSummaryBar, extractChangeTallyFromBlocks, hasFileChanges } from './ChangeSummaryBar';
import { MessageMarkdown } from './MessageMarkdown';
import { StreamingStatusMessage } from './streamingUtils';

export function ContextSummaryRow({ message }: { message: AgentChatMessageRecord }): React.ReactElement | null {
  if (!message.contextSummary) return null;
  const { omittedFileCount, selectedFileCount, usedAdvancedControls } = message.contextSummary;
  const parts = [`${selectedFileCount} file${selectedFileCount === 1 ? '' : 's'}`, omittedFileCount > 0 ? `${omittedFileCount} excluded` : null, usedAdvancedControls ? 'advanced' : null].filter(Boolean);
  return <div className="mt-1 text-[11px] text-text-semantic-muted">{parts.join(' · ')}</div>;
}

export function VerificationSummaryRow({ message }: { message: AgentChatMessageRecord }): React.ReactElement | null {
  if (!message.verificationPreview) return null;
  const { profile, status, summary } = message.verificationPreview;
  return <div className="mt-1 text-[11px] text-text-semantic-muted">{[profile, status, summary || null].filter(Boolean).join(' · ')}</div>;
}

export function ErrorInline({ message }: { message: AgentChatMessageRecord }): React.ReactElement | null {
  return message.error ? <div className="mt-1 text-[11px] text-status-error">{message.error.message}</div> : null;
}

export function ToolsSummaryRow({ message }: { message: AgentChatMessageRecord }): React.ReactElement | null {
  return message.toolsSummary ? <div className="mt-1 text-[11px] text-text-semantic-muted">{message.toolsSummary}</div> : null;
}

export function CostDurationRow({ message }: { message: AgentChatMessageRecord }): React.ReactElement | null {
  const parts = [message.costSummary, message.durationSummary].filter(Boolean);
  return parts.length ? <div className="mt-0.5 text-[11px] text-text-semantic-muted">{parts.join(' · ')}</div> : null;
}

export function MessageActionLink({ message, onOpenLinkedDetails }: { message: AgentChatMessageRecord; onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>; }): React.ReactElement | null {
  return message.orchestration ? <button onClick={() => void onOpenLinkedDetails(message.orchestration)} className="mt-1 text-[11px] text-interactive-accent transition-opacity duration-100 hover:opacity-80">View details</button> : null;
}

interface UserMessageProps {
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

function UserMessageEditMode(props: Pick<UserMessageProps, 'editDraft' | 'onEditDraftChange' | 'onEditSubmit' | 'onCancelEdit'>): React.ReactElement {
  return <div className="flex justify-end"><div className="max-w-[85%] rounded-xl rounded-br-sm px-3.5 py-2.5 bg-interactive-accent text-text-semantic-on-accent"><textarea autoFocus value={props.editDraft} onChange={(e) => props.onEditDraftChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); props.onEditSubmit(); } if (e.key === 'Escape') { e.preventDefault(); props.onCancelEdit(); } }} className="w-full resize-none rounded-lg border bg-surface-base border-border-semantic p-2 text-sm text-text-semantic-primary focus:border-interactive-accent focus:outline-none" style={{ fontFamily: 'var(--font-ui)', minHeight: '60px' }} rows={3} /><div className="mt-1.5 flex justify-end gap-1.5"><button onClick={props.onCancelEdit} className="rounded px-2 py-0.5 text-[11px] opacity-80 hover:opacity-100">Cancel</button><button onClick={props.onEditSubmit} className="rounded px-2 py-0.5 text-[11px] font-medium opacity-90 hover:opacity-100">Send</button></div></div></div>;
}

export const UserMessage = React.memo(function UserMessage(props: UserMessageProps): React.ReactElement {
  if (props.isEditing) return <UserMessageEditMode editDraft={props.editDraft} onEditDraftChange={props.onEditDraftChange} onEditSubmit={props.onEditSubmit} onCancelEdit={props.onCancelEdit} />;
  return <div className="group flex justify-end gap-1.5"><UserMessageActions message={props.message} isLastUserMessage={props.isLastUserMessage} threadStatus={props.threadStatus} onEdit={props.onEdit} onRetry={props.onRetry} onBranch={props.onBranch} /><div className="max-w-[85%] rounded-lg px-3.5 py-2.5 bg-interactive-accent text-text-semantic-on-accent"><div className="whitespace-pre-wrap text-sm leading-relaxed">{props.message.content || ' '}</div><ContextSummaryRow message={props.message} /><div className="mt-1 text-right text-[10px] text-text-semantic-on-accent" style={{ opacity: 0.6 }} title={formatTimestampFull(props.message.createdAt)}>{formatTimestamp(props.message.createdAt)}</div></div></div>;
});

type RenderItem = { type: 'text'; block: AgentChatContentBlock; index: number } | { type: 'thinking'; block: AgentChatContentBlock; index: number } | { type: 'tool-group'; tools: AgentChatContentBlock[]; startIndex: number } | { type: 'single-tool'; block: AgentChatContentBlock; index: number } | { type: 'block'; block: AgentChatContentBlock; index: number };

function buildRenderItems(blocks: AgentChatContentBlock[]): RenderItem[] {
  const items: RenderItem[] = [];
  for (let i = 0; i < blocks.length;) {
    const block = blocks[i];
    if (block.kind === 'text') {
      items.push({ type: 'text', block, index: i });
      i++;
      continue;
    }
    if (block.kind === 'thinking') {
      items.push({ type: 'thinking', block, index: i });
      i++;
      continue;
    }
    if (block.kind === 'tool_use') {
      const run: AgentChatContentBlock[] = [];
      const startIndex = i;
      while (i < blocks.length && blocks[i].kind === 'tool_use') {
        run.push(blocks[i]);
        i++;
      }
      items.push(run.length >= 2 ? { type: 'tool-group', tools: run, startIndex } : { type: 'single-tool', block: run[0], index: startIndex });
      continue;
    }
    items.push({ type: 'block', block, index: i });
    i++;
  }
  return items;
}

export function AssistantBlocksContent({ blocks, isStreaming = false, onStop }: { blocks: AgentChatContentBlock[]; isStreaming?: boolean; onStop?: () => Promise<void>; }): React.ReactElement {
  const renderItems = useMemo(() => buildRenderItems(blocks), [blocks]);
  return <div className="space-y-2">{renderItems.map((item) => item.type === 'text' ? <div key={`text-${item.index}`} className="pl-7 pb-0.5"><MessageMarkdown content={(item.block as AgentChatContentBlock & { kind: 'text' }).content} /></div> : item.type === 'thinking' ? <AgentChatBlockRenderer key={`thinking-${item.index}`} block={item.block} index={item.index} isStreaming={isStreaming} isLastBlock={false} /> : item.type === 'tool-group' ? <AgentChatToolGroup key={`tg-${item.startIndex}`} blocks={item.tools as Array<AgentChatContentBlock & { kind: 'tool_use' }>} defaultExpanded={isStreaming && item.tools.some((tool) => tool.kind === 'tool_use' && tool.status === 'running')} /> : <AgentChatBlockRenderer key={item.type === 'single-tool' ? `tool-${item.index}` : `block-${item.index}`} block={item.block} index={item.index} isStreaming={isStreaming} isLastBlock={false} />)}{isStreaming && <StreamingStatusMessage onStop={onStop} />}</div>;
}

function AssistantMessageContent({
  message,
  isStreaming,
  onStop,
  workspaceRoot,
  snapshotHash,
  onOpenLinkedDetails,
  showChangeSummary,
}: {
  message: AgentChatMessageRecord;
  isStreaming: boolean;
  onStop?: () => Promise<void>;
  workspaceRoot?: string;
  snapshotHash?: string;
  onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>;
  showChangeSummary: boolean;
}): React.ReactElement {
  return (
    <div className="pb-1">
      {message.blocks?.length ? <AssistantBlocksContent blocks={message.blocks} isStreaming={isStreaming} onStop={onStop} /> : isStreaming ? <StreamingStatusMessage onStop={onStop} /> : <MessageMarkdown content={message.content || ' '} />}
      {!isStreaming && <>
        <VerificationSummaryRow message={message} />
        <ErrorInline message={message} />
        <ToolsSummaryRow message={message} />
        <CostDurationRow message={message} />
        {showChangeSummary && snapshotHash && workspaceRoot && <CompletedChangeSummaryBar snapshotHash={snapshotHash} projectRoot={workspaceRoot} sessionId={message.id} tally={extractChangeTallyFromBlocks(message.blocks!)} />}
        <MessageActionLink message={message} onOpenLinkedDetails={onOpenLinkedDetails} />
      </>}
    </div>
  );
}

function AssistantMessageHeader({
  message,
  hidden,
  onBranch,
  onRevert,
}: {
  message: AgentChatMessageRecord;
  hidden: boolean;
  onBranch: (message: AgentChatMessageRecord) => void;
  onRevert?: (message: AgentChatMessageRecord) => void;
}): React.ReactElement | null {
  return hidden ? null : <div className="mb-1 flex items-center gap-1"><span className="text-[10px] text-text-semantic-faint" title={formatTimestampFull(message.createdAt)}>{formatTimestamp(message.createdAt)}</span><AssistantMessageActions message={message} onBranch={onBranch} onRevert={onRevert} /></div>;
}

function shouldShowChangeSummary({
  isStreaming,
  snapshotHash,
  workspaceRoot,
  hasBlocks,
  blocks,
}: {
  isStreaming: boolean;
  snapshotHash?: string;
  workspaceRoot?: string;
  hasBlocks: boolean;
  blocks?: AgentChatContentBlock[];
}): boolean {
  return Boolean(!isStreaming && snapshotHash && workspaceRoot && hasBlocks && blocks && hasFileChanges(blocks));
}

export const AssistantMessage = React.memo(function AssistantMessage(props: { message: AgentChatMessageRecord; workspaceRoot?: string; onOpenLinkedDetails: (link?: AgentChatOrchestrationLink) => Promise<void>; onBranch: (message: AgentChatMessageRecord) => void; onRevert?: (message: AgentChatMessageRecord) => void; }): React.ReactElement {
  const msg = props.message as AgentChatMessageRecord & { _streaming?: boolean; _streamingState?: { isStreaming: boolean; onStop?: () => Promise<void> } };
  const isStreaming = msg._streaming === true && (msg._streamingState?.isStreaming ?? false);
  const onStop = msg._streamingState?.onStop;
  const hasBlocks = Boolean(props.message.blocks?.length);
  const snapshotHash = props.message.orchestration?.preSnapshotHash;
  const showChangeSummary = shouldShowChangeSummary({ isStreaming, snapshotHash, workspaceRoot: props.workspaceRoot, hasBlocks, blocks: props.message.blocks });
  return <div className="group flex justify-start"><div className="w-full max-w-[95%]"><AssistantMessageHeader message={props.message} hidden={msg._streaming} onBranch={props.onBranch} onRevert={props.onRevert} /><AssistantMessageContent message={props.message} isStreaming={isStreaming} onStop={onStop} workspaceRoot={props.workspaceRoot} snapshotHash={snapshotHash} onOpenLinkedDetails={props.onOpenLinkedDetails} showChangeSummary={showChangeSummary} /></div></div>;
});

function extractContextFileCount(content: string): number | null {
  const match = /Prepared context from (\d+) file/.exec(content);
  return match ? parseInt(match[1], 10) : null;
}

export function StatusMessage(props: { message: AgentChatMessageRecord }): React.ReactElement {
  const [pulsing, setPulsing] = React.useState(true);
  React.useEffect(() => { const timer = setTimeout(() => setPulsing(false), 300); return () => clearTimeout(timer); }, []);
  const isContext = (props.message as { statusKind?: string }).statusKind === 'context';
  if (isContext) {
    const fileCount = extractContextFileCount(props.message.content || '');
    const label = fileCount !== null ? `Context injected — ${fileCount} file${fileCount === 1 ? '' : 's'}` : 'Context injected';
    return (
      <div className="flex justify-center my-1">
        <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] text-text-semantic-muted bg-surface-raised">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="var(--status-success, #3fb950)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{label}</span>
        </div>
      </div>
    );
  }
  return <div className="flex justify-center"><div className={`rounded-full px-3 py-1 text-[11px] text-text-semantic-muted bg-surface-raised ${pulsing ? 'agent-chat-status-pulse' : ''}`}>{props.message.content || 'Status update'}</div></div>;
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

export function MessageCard(props: MessageCardProps): React.ReactElement {
  const content = props.message.role === 'user' ? <UserMessage message={props.message} isEditing={props.editingMessageId === props.message.id} editDraft={props.editDraft} isLastUserMessage={props.isLastUserMessage} threadStatus={props.threadStatus} onCancelEdit={props.onCancelEdit} onEdit={props.onEdit} onEditDraftChange={props.onEditDraftChange} onEditSubmit={props.onEditSubmit} onRetry={props.onRetry} onBranch={props.onBranch} onOpenLinkedDetails={props.onOpenLinkedDetails} /> : props.message.role === 'assistant' ? <AssistantMessage message={props.message} workspaceRoot={props.workspaceRoot} onOpenLinkedDetails={props.onOpenLinkedDetails} onBranch={props.onBranch} onRevert={props.onRevert} /> : <StatusMessage message={props.message} />;
  return <div className="agent-chat-message-enter">{content}</div>;
}

function findLastAssistantError(messages: AgentChatMessageRecord[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant' && messages[i].error) return messages[i].error.message;
  return undefined;
}

function CancelledPartialBanner(): React.ReactElement {
  return <div className="flex justify-center"><div className="rounded-full px-3 py-1 text-[10px] text-text-semantic-muted bg-surface-raised">Chat was stopped</div></div>;
}

function hasCancelledPartial(messages: AgentChatMessageRecord[]): boolean {
  const lastAssistant = messages.findLast((message) => message.role === 'assistant');
  return Boolean(lastAssistant && (lastAssistant.content?.trim() || lastAssistant.blocks?.length));
}

export function FailedBanner({ activeThread }: { activeThread: AgentChatThreadRecord }): React.ReactElement | null {
  if (activeThread.status !== 'failed' && activeThread.status !== 'cancelled') return null;
  if (activeThread.status === 'cancelled' && hasCancelledPartial(activeThread.messages)) return <CancelledPartialBanner />;
  const detail = findLastAssistantError(activeThread.messages);
  return <div className="flex flex-col items-center gap-1"><div className="rounded-full px-3 py-1 text-[11px] font-medium text-status-error" style={{ backgroundColor: 'rgba(248, 81, 73, 0.08)' }}>{activeThread.status === 'failed' ? 'Task failed' : 'Chat was stopped'}</div>{detail && <div className="max-w-md px-3 py-1 text-center text-[10px] text-text-semantic-muted">{detail}</div>}</div>;
}

export function LoadingState(): React.ReactElement {
  return <div className="flex flex-1 items-center justify-center"><div className="text-xs text-text-semantic-muted">Loading chats...</div></div>;
}

export function MissingProjectState(): React.ReactElement {
  return <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center"><div style={{ opacity: 0.3 }}><svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8 14C8 12.3431 9.34315 11 11 11H19L23 15H37C38.6569 15 40 16.3431 40 18V34C40 35.6569 38.6569 37 37 37H11C9.34315 37 8 35.6569 8 34V14Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8 20H40" stroke="currentColor" strokeWidth="1.5" /></svg></div><div className="text-sm font-medium text-text-semantic-muted">Open a project folder to get started</div><div className="max-w-[280px] text-xs text-text-semantic-faint">Agent chat requires an active workspace. Open a folder to begin.</div></div>;
}

const SUGGESTED_PROMPTS = [
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>, title: 'Explain the architecture', description: 'Overview of project structure and key patterns', prompt: 'Explain the architecture of this project' },
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>, title: 'Find and fix bugs', description: 'Analyze recent changes for potential issues', prompt: 'Find and fix bugs in recent changes' },
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>, title: 'Write tests', description: 'Generate test coverage for the current file', prompt: 'Write tests for the current file' },
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>, title: 'Refactor for performance', description: 'Optimize code for speed and maintainability', prompt: 'Refactor for better performance' },
];

export function EmptyConversationState({ onSelectPrompt }: { onSelectPrompt?: (prompt: string) => void }): React.ReactElement {
  return <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center"><div className="flex flex-col items-center gap-2"><div className="text-sm font-medium text-text-semantic-primary">Start a conversation</div><div className="max-w-[300px] text-xs text-text-semantic-muted">Ask the agent to inspect, edit, or verify code. Your first message creates the thread.</div></div><div className="grid w-full max-w-[440px] grid-cols-2 gap-2">{SUGGESTED_PROMPTS.map((item) => <button key={item.prompt} onClick={() => onSelectPrompt?.(item.prompt)} className="flex flex-col gap-1.5 rounded-lg border border-border-semantic px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-raised"><div className="flex items-center gap-1.5 text-text-semantic-muted">{item.icon}<span className="text-xs font-medium text-text-semantic-primary">{item.title}</span></div><span className="text-[11px] leading-snug text-text-semantic-muted">{item.description}</span></button>)}</div></div>;
}

export function QueuedMessageBanner(props: { messages: import('./useAgentChatWorkspace').QueuedMessage[]; onEdit: (id: string) => void; onDelete: (id: string) => void; onSendNow: (id: string) => Promise<void>; }): React.ReactElement | null {
  if (props.messages.length === 0) return null;
  return <div className="border-t border-border-semantic px-3 py-1.5"><div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-text-semantic-muted">Queued ({props.messages.length})</div><div className="space-y-1">{props.messages.map((msg) => <div key={msg.id} className="flex items-start gap-2 rounded-lg border border-border-semantic bg-surface-base px-2.5 py-1.5"><div className="min-w-0 flex-1 truncate text-xs text-text-semantic-primary" title={msg.content}>{msg.content.length > 80 ? `${msg.content.slice(0, 80)}...` : msg.content}</div><div className="flex shrink-0 items-center gap-0.5"><button onClick={() => props.onEdit(msg.id)} title="Edit — move back to composer" className="rounded p-0.5 text-[10px] text-text-semantic-muted transition-colors duration-100 hover:bg-surface-raised"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button><button onClick={() => void props.onSendNow(msg.id)} title="Send now — interrupt current task" className="rounded p-0.5 text-[10px] text-interactive-accent transition-colors duration-100 hover:bg-surface-raised"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></button><button onClick={() => props.onDelete(msg.id)} title="Remove from queue" className="rounded p-0.5 text-[10px] text-text-semantic-muted transition-colors duration-100 hover:bg-surface-raised hover:text-status-error"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button></div></div>)}</div></div>;
}

export function PendingUserBubble({ text }: { text: string }): React.ReactElement {
  return <div className="flex justify-end"><div className="max-w-[85%] rounded-xl rounded-tr-sm px-3.5 py-2.5 text-sm leading-relaxed opacity-80 bg-interactive-accent text-text-semantic-on-accent">{text}</div></div>;
}

export function InlineError({ error }: { error: string | null }): React.ReactElement | null {
  return error ? <div className="mx-4 rounded-lg px-3 py-2 text-xs text-status-error" style={{ backgroundColor: 'rgba(248, 81, 73, 0.08)' }}>{error}</div> : null;
}
