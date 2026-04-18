import React, { useCallback, useState } from 'react';

import { useViewportBreakpoint } from '../../hooks/useViewportBreakpoint';
import type { AgentChatMessageRecord } from '../../types/electron';
import {
  BranchIcon,
  CheckIcon,
  CopyIcon,
  EditIcon,
  RetryIcon,
  RevertIcon,
  RewindIcon,
} from './AgentChatMessageActionIcons';
import type { OverflowAction } from './MobileOverflowMenu';
import { MobileOverflowMenu } from './MobileOverflowMenu';
import { RerunMenu } from './RerunMenu';

export interface MessageActionsProps {
  message: AgentChatMessageRecord;
  isLastUserMessage: boolean;
  threadStatus: string;
  onEdit: (message: AgentChatMessageRecord) => void;
  onRetry: (message: AgentChatMessageRecord) => void;
  onBranch: (message: AgentChatMessageRecord) => void;
  onRerunSuccess?: (newThreadId: string) => void;
}

function ActionButton(props: {
  title: string; onClick: () => void; children: React.ReactNode;
}): React.ReactElement {
  return (
    <button title={props.title} onClick={props.onClick}
      className="rounded p-1 text-text-semantic-muted transition-colors duration-100 hover:bg-surface-raised hover:text-text-semantic-primary">
      {props.children}
    </button>
  );
}

function useCopyMessage(content: string): { copied: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);
  return { copied, copy };
}

// ── UserMessageActions ────────────────────────────────────────────────────────

function UserDesktopToolbar({ message, isLastUserMessage, threadStatus, onEdit, onRetry, onBranch, onRerunSuccess, copied, copy }: MessageActionsProps & { copied: boolean; copy: () => void }): React.ReactElement {
  const isThreadBusy = threadStatus === 'submitting' || threadStatus === 'running';
  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
      <ActionButton title={copied ? 'Copied!' : 'Copy message'} onClick={copy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </ActionButton>
      <ActionButton title="Edit & resend" onClick={() => onEdit(message)}>
        <EditIcon />
      </ActionButton>
      {isLastUserMessage && !isThreadBusy && (
        <ActionButton title="Retry" onClick={() => onRetry(message)}>
          <RetryIcon />
        </ActionButton>
      )}
      <ActionButton title="Branch from here" onClick={() => onBranch(message)}>
        <BranchIcon />
      </ActionButton>
      <RerunMenu messageId={message.id} threadId={message.threadId} onSuccess={onRerunSuccess} />
    </div>
  );
}

export function UserMessageActions(props: MessageActionsProps): React.ReactElement {
  const { message, isLastUserMessage, threadStatus, onEdit, onRetry, onBranch } = props;
  const breakpoint = useViewportBreakpoint();
  const isThreadBusy = threadStatus === 'submitting' || threadStatus === 'running';
  const { copied, copy } = useCopyMessage(message.content);
  if (breakpoint === 'phone') {
    const actions: OverflowAction[] = [
      { label: copied ? 'Copied!' : 'Copy', onClick: copy },
      { label: 'Edit & resend', onClick: () => onEdit(message) },
      ...(!isThreadBusy && isLastUserMessage ? [{ label: 'Retry', onClick: () => onRetry(message) }] : []),
      { label: 'Branch', onClick: () => onBranch(message) },
    ];
    return <MobileOverflowMenu actions={actions} />;
  }
  return <UserDesktopToolbar {...props} copied={copied} copy={copy} />;
}

// ── AssistantMessageActions ───────────────────────────────────────────────────

export interface AssistantMessageActionsProps {
  message: AgentChatMessageRecord;
  onBranch: (message: AgentChatMessageRecord) => void;
  onRevert?: (message: AgentChatMessageRecord) => void;
  onRewind?: (message: AgentChatMessageRecord) => void;
  onRerunSuccess?: (newThreadId: string) => void;
}

function RewindButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button title="Rewind to after this message" onClick={onClick}
      className="rounded px-1.5 py-0.5 text-text-semantic-muted transition-all duration-100 hover:bg-status-warning-subtle hover:text-status-warning">
      <div className="flex items-center gap-1"><RewindIcon /><span className="text-[10px] font-medium">Rewind</span></div>
    </button>
  );
}

function RevertButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button title="Revert changes from this turn" onClick={onClick}
      className="rounded px-1.5 py-0.5 text-text-semantic-muted transition-all duration-100 hover:bg-status-error-subtle hover:text-status-error">
      <div className="flex items-center gap-1"><RevertIcon /><span className="text-[10px] font-medium">Revert</span></div>
    </button>
  );
}

function AssistantDesktopToolbar({ message, onBranch, onRevert, onRewind, onRerunSuccess, copied, copy, hasSnapshot, hasCheckpoint }: AssistantMessageActionsProps & { copied: boolean; copy: () => void; hasSnapshot: boolean; hasCheckpoint: boolean }): React.ReactElement {
  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
      <ActionButton title={copied ? 'Copied!' : 'Copy message'} onClick={copy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </ActionButton>
      {hasCheckpoint && onRewind && <RewindButton onClick={() => onRewind(message)} />}
      {hasSnapshot && onRevert && <RevertButton onClick={() => onRevert(message)} />}
      <button title="Branch from this message" onClick={() => onBranch(message)}
        className="rounded px-1.5 py-0.5 text-text-semantic-muted transition-all duration-100 hover:bg-interactive-accent-subtle hover:text-interactive-accent">
        <div className="flex items-center gap-1"><BranchIcon /><span className="text-[10px] font-medium">Fork</span></div>
      </button>
      <RerunMenu messageId={message.id} threadId={message.threadId} onSuccess={onRerunSuccess} />
    </div>
  );
}

export function AssistantMessageActions(props: AssistantMessageActionsProps): React.ReactElement {
  const { message, onBranch, onRevert, onRewind } = props;
  const breakpoint = useViewportBreakpoint();
  const { copied, copy } = useCopyMessage(message.content);
  const hasSnapshot = !!message.orchestration?.preSnapshotHash;
  const hasCheckpoint = !!message.checkpointCommit;
  if (breakpoint === 'phone') {
    const actions: OverflowAction[] = [
      { label: copied ? 'Copied!' : 'Copy', onClick: copy },
      ...(hasCheckpoint && onRewind ? [{ label: 'Rewind', onClick: () => onRewind(message) }] : []),
      ...(hasSnapshot && onRevert ? [{ label: 'Revert', onClick: () => onRevert(message), danger: true as const }] : []),
      { label: 'Fork', onClick: () => onBranch(message) },
    ];
    return <MobileOverflowMenu actions={actions} />;
  }
  return <AssistantDesktopToolbar {...props} copied={copied} copy={copy} hasSnapshot={hasSnapshot} hasCheckpoint={hasCheckpoint} />;
}
