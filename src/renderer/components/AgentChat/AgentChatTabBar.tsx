import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentChatThreadRecord } from '../../types/electron';
import {
  BranchTabIcon,
  type LinkedSession,
  OpenInTerminalButton,
  ThreadDropdown,
  useLinkedSessionId,
} from './AgentChatTabBarParts';

export interface AgentChatTabBarProps {
  activeThreadId: string | null;
  onDeleteThread: (threadId: string) => void;
  onNewChat: () => void;
  onSelectThread: (threadId: string) => void;
  threads: AgentChatThreadRecord[];
}

function truncateTitle(title: string, maxLength = 20): string {
  return title.length <= maxLength ? title : `${title.slice(0, maxLength - 1).trimEnd()}\u2026`;
}

function PlusIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M6 2v8M2 6h8" />
    </svg>
  );
}

function ChevronDownIcon(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3.5L5 6.5L8 3.5" />
    </svg>
  );
}

function Tab({
  branchMessageIndex,
  branchParentTitle,
  isActive,
  isBranch,
  onClose,
  onSelect,
  title,
}: {
  branchMessageIndex?: number;
  branchParentTitle?: string;
  isActive: boolean;
  isBranch: boolean;
  onClose: () => void;
  onSelect: () => void;
  title: string;
}): React.ReactElement {
  return (
    <button
      onClick={onSelect}
      className={`group relative flex shrink-0 items-center gap-1 rounded-t px-2.5 py-1 text-[11px] transition-colors duration-100 ${isActive ? 'bg-surface-base text-text-semantic-primary' : 'text-text-semantic-muted'}`}
      style={{
        borderBottom: isActive ? '2px solid var(--interactive-accent)' : '2px solid transparent',
      }}
    >
      {isBranch && (
        <BranchTabIcon
          parentTitle={branchParentTitle ?? ''}
          messageIndex={branchMessageIndex ?? 0}
        />
      )}
      <span className="max-w-[120px] truncate">{truncateTitle(title)}</span>
      <span
        role="button"
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[9px] leading-none opacity-0 text-text-semantic-muted transition-opacity duration-75 group-hover:opacity-60 hover:!opacity-100"
      >
        &times;
      </span>
    </button>
  );
}

function useScrollActiveThreadIntoView(
  scrollRef: React.RefObject<HTMLDivElement>,
  activeThreadId: string | null,
): void {
  useEffect(() => {
    if (!scrollRef.current || !activeThreadId) return;
    const activeTab = scrollRef.current.querySelector(`[data-thread-id="${activeThreadId}"]`);
    if (activeTab) activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeThreadId, scrollRef]);
}

function ThreadTabs({
  activeThreadId,
  onDeleteThread,
  onSelectThread,
  threads,
}: {
  activeThreadId: string | null;
  onDeleteThread: (threadId: string) => void;
  onSelectThread: (threadId: string) => void;
  threads: AgentChatThreadRecord[];
}): React.ReactElement {
  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-0 overflow-x-auto"
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
  );
}

interface TabBarContentProps {
  activeThreadId: string | null;
  barRef: React.RefObject<HTMLDivElement>;
  dropdownOpen: boolean;
  dropdownRect: DOMRect | null;
  linkedSession: LinkedSession;
  onDeleteThread: (threadId: string) => void;
  onCloseDropdown: () => void;
  onNewChat: () => void;
  onSelectThread: (threadId: string) => void;
  onToggleDropdown: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  threads: AgentChatThreadRecord[];
}

function DropdownToggleButton({
  show,
  onClick,
}: {
  show: boolean;
  onClick: () => void;
}): React.ReactElement | null {
  if (!show) return null;
  return (
    <button
      onClick={onClick}
      className="flex h-full w-6 shrink-0 items-center justify-center text-text-semantic-muted transition-colors duration-100 hover:text-text-semantic-primary"
      title="Chat history"
    >
      <ChevronDownIcon />
    </button>
  );
}

function AgentChatTabBarContent({
  activeThreadId,
  barRef,
  dropdownOpen,
  dropdownRect,
  linkedSession,
  onDeleteThread,
  onCloseDropdown,
  onNewChat,
  onSelectThread,
  onToggleDropdown,
  scrollRef,
  threads,
}: TabBarContentProps): React.ReactElement {
  return (
    <div
      ref={barRef}
      className="relative flex items-center border-b border-border-semantic bg-surface-panel"
      style={{ minHeight: 32 }}
    >
      <button
        onClick={onNewChat}
        className="flex h-full w-7 shrink-0 items-center justify-center text-text-semantic-muted transition-colors duration-100 hover:text-interactive-accent"
        title="New chat (Ctrl+L)"
      >
        <PlusIcon />
      </button>
      <div ref={scrollRef}>
        <ThreadTabs
          activeThreadId={activeThreadId}
          onDeleteThread={onDeleteThread}
          onSelectThread={onSelectThread}
          threads={threads}
        />
      </div>
      <DropdownToggleButton show={threads.length > 1} onClick={onToggleDropdown} />
      <OpenInTerminalButton
        linkedSession={linkedSession}
        threadModel={
          threads.find((t) => t.id === activeThreadId)?.latestOrchestration?.model ?? null
        }
      />
      {dropdownOpen && dropdownRect && (
        <ThreadDropdown
          activeThreadId={activeThreadId}
          onClose={onCloseDropdown}
          onDeleteThread={onDeleteThread}
          onSelectThread={onSelectThread}
          threads={threads}
          triggerRect={dropdownRect}
        />
      )}
    </div>
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
  const barRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [barRect, setBarRect] = useState<DOMRect | null>(null);
  const activeThread = activeThreadId
    ? (threads.find((t) => t.id === activeThreadId) ?? null)
    : null;
  const linkedSession = useLinkedSessionId(activeThread);
  useScrollActiveThreadIntoView(scrollRef, activeThreadId);
  const handleCloseDropdown = useCallback(() => setDropdownOpen(false), []);

  const handleToggleDropdown = useCallback(() => {
    if (!dropdownOpen && barRef.current) setBarRect(barRef.current.getBoundingClientRect());
    setDropdownOpen((previous) => !previous);
  }, [dropdownOpen]);

  if (threads.length === 0) return null;
  return (
    <AgentChatTabBarContent
      activeThreadId={activeThreadId}
      barRef={barRef}
      dropdownOpen={dropdownOpen}
      dropdownRect={barRect}
      linkedSession={linkedSession}
      onCloseDropdown={handleCloseDropdown}
      onDeleteThread={onDeleteThread}
      onNewChat={onNewChat}
      onSelectThread={onSelectThread}
      onToggleDropdown={handleToggleDropdown}
      scrollRef={scrollRef}
      threads={threads}
    />
  );
}
