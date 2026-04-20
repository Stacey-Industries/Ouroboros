import React, { useCallback, useRef, useState } from 'react';

import type { AgentChatThreadRecord } from '../../types/electron';
import {
  BranchTreeButton,
  type LinkedSession,
  OpenInTerminalButton,
  PopOutChatButton,
  resolveRootThread,
  Tab,
  ThreadDropdown,
  useLinkedSessionId,
  useScrollActiveThreadIntoView,
} from './AgentChatTabBarParts';
import { BranchRenameDialog } from './BranchRenameDialog';

export interface AgentChatTabBarProps {
  activeThreadId: string | null;
  onDeleteThread: (threadId: string) => void;
  onNewChat: () => void;
  onSelectThread: (threadId: string) => void;
  threads: AgentChatThreadRecord[];
}

function PlusIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 2v8M2 6h8" />
    </svg>
  );
}

function ChevronDownIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3.5L5 6.5L8 3.5" />
    </svg>
  );
}

function DropdownToggleButton({ show, onClick }: { show: boolean; onClick: () => void }): React.ReactElement | null {
  if (!show) return null;
  return (
    <button onClick={onClick}
      className="flex h-full w-6 shrink-0 items-center justify-center text-text-semantic-muted transition-colors duration-100 hover:text-text-semantic-primary"
      title="Chat history">
      <ChevronDownIcon />
    </button>
  );
}

function TabBarDropdown({ dropdownOpen, dropdownRect, activeThreadId, threads, onCloseDropdown, onDeleteThread, onSelectThread }: {
  dropdownOpen: boolean; dropdownRect: DOMRect | null; activeThreadId: string | null;
  threads: AgentChatThreadRecord[]; onCloseDropdown: () => void;
  onDeleteThread: (id: string) => void; onSelectThread: (id: string) => void;
}): React.ReactElement | null {
  if (!dropdownOpen || !dropdownRect) return null;
  return (
    <ThreadDropdown activeThreadId={activeThreadId} onClose={onCloseDropdown}
      onDeleteThread={onDeleteThread} onSelectThread={onSelectThread}
      threads={threads} triggerRect={dropdownRect} />
  );
}

function ThreadTabs({
  activeThreadId,
  onDeleteThread,
  onRenameThread,
  onSelectThread,
  threads,
}: {
  activeThreadId: string | null;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (thread: AgentChatThreadRecord) => void;
  onSelectThread: (threadId: string) => void;
  threads: AgentChatThreadRecord[];
}): React.ReactElement {
  // data-no-swipe: horizontal tab scroller — scrollWidth check in useSwipeNavigation already
  // blocks it, but explicit opt-out is belt-and-suspenders (per Phase I spec).
  // TODO(Wave 32 Phase I — session cycling): mount useSwipeNavigation on the AgentChatWorkspace
  // root (or RightSidebar container) with onSwipeLeft/onSwipeRight cycling onSelectThread across
  // threads[]. The tab bar is too narrow for reliable axis disambiguation — the full workspace
  // panel is the right mount point. Deferred: AgentChatWorkspace has no stable root ref in its
  // slot API.
  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-0 overflow-x-auto"
      style={{ scrollbarWidth: 'none' }}
      data-no-swipe=""
      onWheel={(e) => {
        if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
      }}
    >
      {threads.map((thread) => (
        <div key={thread.id} data-thread-id={thread.id}>
          <Tab
            isActive={activeThreadId === thread.id}
            isBranch={Boolean(thread.branchInfo)}
            branchParentTitle={thread.branchInfo?.parentTitle}
            branchMessageIndex={thread.branchInfo?.fromMessageIndex}
            onClose={() => onDeleteThread(thread.id)}
            onRename={thread.branchInfo ? () => onRenameThread(thread) : undefined}
            onSelect={() => onSelectThread(thread.id)}
            title={thread.branchName ?? thread.title}
          />
        </div>
      ))}
    </div>
  );
}

interface TabBarContentProps {
  activeThreadId: string | null;
  barRef: React.RefObject<HTMLDivElement | null>;
  dropdownOpen: boolean;
  dropdownRect: DOMRect | null;
  linkedSession: LinkedSession;
  onDeleteThread: (threadId: string) => void;
  onCloseDropdown: () => void;
  onNewChat: () => void;
  onRenameThread: (thread: AgentChatThreadRecord) => void;
  onSelectThread: (threadId: string) => void;
  onToggleDropdown: () => void;
  rootThread: AgentChatThreadRecord | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  threads: AgentChatThreadRecord[];
}


function TabBarActions({
  threads,
  onToggleDropdown,
  rootThread,
  activeThreadId,
  onSelectThread,
  linkedSession,
  activeThreadModel,
}: {
  threads: AgentChatThreadRecord[];
  onToggleDropdown: () => void;
  rootThread: AgentChatThreadRecord | null;
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  linkedSession: LinkedSession;
  activeThreadModel: string | null;
}): React.ReactElement {
  return (
    <>
      <DropdownToggleButton show={threads.length > 1} onClick={onToggleDropdown} />
      <BranchTreeButton
        rootThread={rootThread}
        activeThreadId={activeThreadId}
        onSelect={onSelectThread}
      />
      <OpenInTerminalButton linkedSession={linkedSession} threadModel={activeThreadModel} />
      <PopOutChatButton />
    </>
  );
}

function NewChatButton({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="flex h-full w-7 shrink-0 items-center justify-center text-text-semantic-muted transition-colors duration-100 hover:text-interactive-accent"
      title="New chat (Ctrl+L)"
    >
      <PlusIcon />
    </button>
  );
}

function AgentChatTabBarContent(props: TabBarContentProps): React.ReactElement {
  const activeThreadModel =
    props.threads.find((t) => t.id === props.activeThreadId)?.latestOrchestration?.model ?? null;
  return (
    <div
      ref={props.barRef}
      className="relative flex items-center border-b border-border-semantic bg-surface-panel"
      style={{ minHeight: 32 }}
    >
      <NewChatButton onClick={props.onNewChat} />
      <div ref={props.scrollRef} className="min-w-0 flex-1">
        <ThreadTabs
          activeThreadId={props.activeThreadId}
          onDeleteThread={props.onDeleteThread}
          onRenameThread={props.onRenameThread}
          onSelectThread={props.onSelectThread}
          threads={props.threads}
        />
      </div>
      <TabBarActions
        threads={props.threads}
        onToggleDropdown={props.onToggleDropdown}
        rootThread={props.rootThread}
        activeThreadId={props.activeThreadId}
        onSelectThread={props.onSelectThread}
        linkedSession={props.linkedSession}
        activeThreadModel={activeThreadModel}
      />
      <TabBarDropdown
        dropdownOpen={props.dropdownOpen}
        dropdownRect={props.dropdownRect}
        activeThreadId={props.activeThreadId}
        threads={props.threads}
        onCloseDropdown={props.onCloseDropdown}
        onDeleteThread={props.onDeleteThread}
        onSelectThread={props.onSelectThread}
      />
    </div>
  );
}

function useTabBarState(threads: AgentChatThreadRecord[], activeThreadId: string | null): {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  barRef: React.RefObject<HTMLDivElement | null>;
  dropdownOpen: boolean;
  barRect: DOMRect | null;
  renameTarget: AgentChatThreadRecord | null;
  rootThread: AgentChatThreadRecord | null;
  linkedSession: LinkedSession;
  handleCloseDropdown: () => void;
  handleToggleDropdown: () => void;
  handleRenamed: () => void;
  setRenameTarget: (t: AgentChatThreadRecord | null) => void;
} {
  const scrollRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [barRect, setBarRect] = useState<DOMRect | null>(null);
  const [renameTarget, setRenameTarget] = useState<AgentChatThreadRecord | null>(null);
  const activeThread = activeThreadId
    ? (threads.find((t) => t.id === activeThreadId) ?? null)
    : null;
  const rootThread = resolveRootThread(threads, activeThreadId);
  const linkedSession = useLinkedSessionId(activeThread);
  useScrollActiveThreadIntoView(scrollRef, activeThreadId);
  const handleCloseDropdown = useCallback(() => setDropdownOpen(false), []);
  const handleToggleDropdown = useCallback(() => {
    if (!dropdownOpen && barRef.current) setBarRect(barRef.current.getBoundingClientRect());
    setDropdownOpen((previous) => !previous);
  }, [dropdownOpen]);
  // Store refreshes via onThreadUpdate subscription after rename — no local state needed.
  const handleRenamed = useCallback(() => undefined, []);
  return {
    scrollRef, barRef, dropdownOpen, barRect, renameTarget, rootThread,
    linkedSession, handleCloseDropdown, handleToggleDropdown, handleRenamed, setRenameTarget,
  };
}

export function AgentChatTabBar({
  activeThreadId,
  onDeleteThread,
  onNewChat,
  onSelectThread,
  threads,
}: AgentChatTabBarProps): React.ReactElement | null {
  const state = useTabBarState(threads, activeThreadId);
  if (threads.length === 0) return null;
  return (
    <>
      <AgentChatTabBarContent
        activeThreadId={activeThreadId}
        barRef={state.barRef}
        dropdownOpen={state.dropdownOpen}
        dropdownRect={state.barRect}
        linkedSession={state.linkedSession}
        onCloseDropdown={state.handleCloseDropdown}
        onDeleteThread={onDeleteThread}
        onNewChat={onNewChat}
        onRenameThread={state.setRenameTarget}
        onSelectThread={onSelectThread}
        onToggleDropdown={state.handleToggleDropdown}
        rootThread={state.rootThread}
        scrollRef={state.scrollRef}
        threads={threads}
      />
      {state.renameTarget && (
        <BranchRenameDialog
          threadId={state.renameTarget.id}
          currentName={state.renameTarget.branchName ?? state.renameTarget.title}
          onClose={() => state.setRenameTarget(null)}
          onRenamed={state.handleRenamed}
        />
      )}
    </>
  );
}
