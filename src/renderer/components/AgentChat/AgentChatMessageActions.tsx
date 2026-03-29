import React, { useCallback, useState } from 'react';

import type { AgentChatMessageRecord } from '../../types/electron';

export interface MessageActionsProps {
  message: AgentChatMessageRecord;
  isLastUserMessage: boolean;
  threadStatus: string;
  onEdit: (message: AgentChatMessageRecord) => void;
  onRetry: (message: AgentChatMessageRecord) => void;
  onBranch: (message: AgentChatMessageRecord) => void;
}

function ActionButton(props: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement<any> {
  return (
    <button
      title={props.title}
      onClick={props.onClick}
      className="rounded p-1 text-text-semantic-muted transition-colors duration-100 hover:bg-surface-raised hover:text-text-semantic-primary"
    >
      {props.children}
    </button>
  );
}

function EditIcon(): React.ReactElement<any> {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function RetryIcon(): React.ReactElement<any> {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function BranchIcon(): React.ReactElement<any> {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function CopyIcon(): React.ReactElement<any> {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon(): React.ReactElement<any> {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function RevertIcon(): React.ReactElement<any> {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

export function UserMessageActions({
  message,
  isLastUserMessage,
  threadStatus,
  onEdit,
  onRetry,
  onBranch,
}: MessageActionsProps): React.ReactElement<any> {
  const isThreadBusy = threadStatus === 'submitting' || threadStatus === 'running';
  const { copied, copy } = useCopyMessage(message.content);

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
    </div>
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

export interface AssistantMessageActionsProps {
  message: AgentChatMessageRecord;
  onBranch: (message: AgentChatMessageRecord) => void;
  onRevert?: (message: AgentChatMessageRecord) => void;
}

export function AssistantMessageActions({
  message,
  onBranch,
  onRevert,
}: AssistantMessageActionsProps): React.ReactElement<any> {
  const { copied, copy } = useCopyMessage(message.content);
  const hasSnapshot = !!message.orchestration?.preSnapshotHash;
  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
      <ActionButton title={copied ? 'Copied!' : 'Copy message'} onClick={copy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </ActionButton>
      {hasSnapshot && onRevert && (
        <button
          title="Revert changes from this turn"
          onClick={() => onRevert(message)}
          className="rounded px-1.5 py-0.5 text-text-semantic-muted transition-all duration-100 hover:bg-[rgba(220,80,60,0.1)] hover:text-[rgb(220,80,60)]"
        >
          <div className="flex items-center gap-1">
            <RevertIcon />
            <span className="text-[10px] font-medium">Revert</span>
          </div>
        </button>
      )}
      <button
        title="Branch from this message"
        onClick={() => onBranch(message)}
        className="rounded px-1.5 py-0.5 text-text-semantic-muted transition-all duration-100 hover:bg-[rgba(100,100,255,0.1)] hover:text-interactive-accent"
      >
        <div className="flex items-center gap-1">
          <BranchIcon />
          <span className="text-[10px] font-medium">Fork</span>
        </div>
      </button>
    </div>
  );
}

