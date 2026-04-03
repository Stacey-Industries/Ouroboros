import React, { useMemo } from 'react';

import type { AgentChatThreadRecord } from '../../types/electron';
import {
  formatThreadPreview,
  formatTimestamp,
  getStatusLabel,
  getStatusTone,
} from './agentChatFormatters';
import { buildThreadTree, flattenThreadTree } from './buildThreadTree';

export interface AgentChatThreadListProps {
  activeThreadId: string | null;
  onNewChat: () => void;
  onSelectThread: (threadId: string) => void;
  threads: AgentChatThreadRecord[];
}

function EmptyThreadList(): React.ReactElement {
  return (
    <div className="rounded border border-dashed border-border-semantic px-3 py-4 text-xs text-text-semantic-muted">
      No previous chats yet.
    </div>
  );
}

function ThreadListHeader({ onNewChat }: { onNewChat: () => void }): React.ReactElement {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-semantic-muted">
          Chats
        </div>
        <div className="mt-1 text-xs text-text-semantic-muted">
          Recent agent threads for this project
        </div>
      </div>
      <button
        onClick={onNewChat}
        className="rounded border border-border-semantic px-2 py-1 text-xs text-text-semantic-muted transition-colors duration-100 hover:border-interactive-accent hover:text-text-semantic-primary"
      >
        New
      </button>
    </div>
  );
}

function ThreadStatusBadge({
  status,
}: {
  status: AgentChatThreadRecord['status'];
}): React.ReactElement {
  return (
    <span
      className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={getStatusTone(status)}
    >
      {getStatusLabel(status)}
    </span>
  );
}

function ThreadListItem(props: {
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  thread: AgentChatThreadRecord;
  depth: number;
}): React.ReactElement {
  const isActive = props.activeThreadId === props.thread.id;
  const isBranch = props.depth > 0;

  return (
    <button
      onClick={() => props.onSelectThread(props.thread.id)}
      className="w-full rounded border px-3 py-2 text-left transition-colors duration-100"
      style={{
        borderColor: isActive ? 'var(--interactive-accent)' : 'var(--border-default)',
        backgroundColor: isActive ? 'var(--surface-panel)' : 'transparent',
        marginLeft: `${props.depth * 16}px`,
        width: `calc(100% - ${props.depth * 16}px)`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-semantic-primary">
            {isBranch && <span className="mr-1 text-text-semantic-faint">{'\u21B3'}</span>}
            {props.thread.title}
          </div>
          <div className="mt-1 line-clamp-2 text-xs text-text-semantic-muted">
            {formatThreadPreview(props.thread)}
          </div>
        </div>
        <ThreadStatusBadge status={props.thread.status} />
      </div>
      <div className="mt-2 text-[11px] text-text-semantic-faint">
        {formatTimestamp(props.thread.updatedAt)}
      </div>
    </button>
  );
}

export function AgentChatThreadList({
  activeThreadId,
  onNewChat,
  onSelectThread,
  threads,
}: AgentChatThreadListProps): React.ReactElement {
  const flatNodes = useMemo(() => flattenThreadTree(buildThreadTree(threads)), [threads]);

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border-semantic bg-surface-base px-3 py-3">
      <ThreadListHeader onNewChat={onNewChat} />
      <div className="flex-1 space-y-2 overflow-y-auto">
        {threads.length === 0 ? <EmptyThreadList /> : null}
        {flatNodes.map((node) => (
          <ThreadListItem
            key={node.thread.id}
            activeThreadId={activeThreadId}
            onSelectThread={onSelectThread}
            thread={node.thread}
            depth={node.depth}
          />
        ))}
      </div>
    </div>
  );
}
