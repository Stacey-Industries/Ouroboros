import React, { useRef, useEffect } from 'react';
import type { AgentChatThreadRecord } from '../../types/electron';

export interface AgentChatTabBarProps {
  activeThreadId: string | null;
  onDeleteThread: (threadId: string) => void;
  onNewChat: () => void;
  onSelectThread: (threadId: string) => void;
  threads: AgentChatThreadRecord[];
}

function truncateTitle(title: string, maxLength = 24): string {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, maxLength - 1).trimEnd()}\u2026`;
}

function TabCloseButton({ onClick }: { onClick: (e: React.MouseEvent) => void }): React.ReactElement {
  return (
    <span
      role="button"
      tabIndex={-1}
      onClick={onClick}
      className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] leading-none opacity-0 transition-opacity duration-75 group-hover:opacity-70 hover:!opacity-100"
      style={{ color: 'var(--text-muted)' }}
    >
      &times;
    </span>
  );
}

function BranchTabIcon({ parentTitle, messageIndex }: { parentTitle: string; messageIndex: number }): React.ReactElement {
  return (
    <span
      className="shrink-0"
      title={`Branched from "${parentTitle}" at message ${messageIndex}`}
      style={{ color: 'var(--accent)', opacity: 0.7 }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
    </span>
  );
}

function Tab(props: {
  isActive: boolean;
  isBranch: boolean;
  branchParentTitle?: string;
  branchMessageIndex?: number;
  onClose: () => void;
  onSelect: () => void;
  title: string;
}): React.ReactElement {
  return (
    <button
      onClick={props.onSelect}
      className="group relative flex shrink-0 items-center gap-1 px-3 py-1.5 text-xs transition-colors duration-100"
      style={{
        color: props.isActive ? 'var(--text)' : 'var(--text-muted)',
        borderBottom: props.isActive ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      {props.isBranch && (
        <BranchTabIcon
          parentTitle={props.branchParentTitle ?? ''}
          messageIndex={props.branchMessageIndex ?? 0}
        />
      )}
      <span className="max-w-[160px] truncate">{truncateTitle(props.title)}</span>
      <TabCloseButton
        onClick={(e) => {
          e.stopPropagation();
          props.onClose();
        }}
      />
    </button>
  );
}

function NewChatButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-xs transition-colors duration-100"
      style={{ color: 'var(--text-muted)' }}
      title="New chat"
    >
      <span className="text-sm leading-none">+</span>
      <span>New</span>
    </button>
  );
}

export function AgentChatTabBar({
  activeThreadId,
  onDeleteThread,
  onNewChat,
  onSelectThread,
  threads,
}: AgentChatTabBarProps): React.ReactElement | null {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current || !activeThreadId) return;
    const activeTab = scrollRef.current.querySelector(`[data-thread-id="${activeThreadId}"]`);
    if (activeTab) {
      activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [activeThreadId]);

  if (threads.length === 0) return null;

  return (
    <div
      className="flex items-end border-b"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
    >
      <NewChatButton onClick={onNewChat} />
      <div
        ref={scrollRef}
        className="flex min-w-0 flex-1 items-end gap-0 overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {threads.map((thread) => (
          <div key={thread.id} data-thread-id={thread.id}>
            <Tab
              isActive={activeThreadId === thread.id}
              isBranch={Boolean(thread.branchInfo)}
              branchParentTitle={thread.branchInfo?.parentTitle}
              branchMessageIndex={thread.branchInfo?.fromMessageIndex}
              onClose={() => onDeleteThread(thread.id)}
              onSelect={() => onSelectThread(thread.id)}
              title={thread.title}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
