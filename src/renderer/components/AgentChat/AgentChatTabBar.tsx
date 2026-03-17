import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { AgentChatThreadRecord } from '../../types/electron';
import { OPEN_CHAT_IN_TERMINAL_EVENT } from '../../hooks/appEventNames';

export interface AgentChatTabBarProps {
  activeThreadId: string | null;
  onDeleteThread: (threadId: string) => void;
  onNewChat: () => void;
  onSelectThread: (threadId: string) => void;
  threads: AgentChatThreadRecord[];
}

function truncateTitle(title: string, maxLength = 20): string {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, maxLength - 1).trimEnd()}\u2026`;
}

/* ── Icons ── */

function PlusIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 2v8M2 6h8" />
    </svg>
  );
}

function ChevronDownIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3.5L5 6.5L8 3.5" />
    </svg>
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

/* ── Thread dropdown (Cursor-style chat history) ── */

function ThreadDropdown({
  threads,
  activeThreadId,
  onSelectThread,
  onDeleteThread,
  onClose,
}: {
  threads: AgentChatThreadRecord[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        maxHeight: 300,
        overflowY: 'auto',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        zIndex: 100,
        padding: '4px 0',
      }}
    >
      {threads.length === 0 && (
        <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>No conversations</div>
      )}
      {threads.map((thread) => {
        const isActive = thread.id === activeThreadId;
        return (
          <div
            key={thread.id}
            className="group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors duration-75 hover:bg-[var(--bg-tertiary)]"
            style={{
              backgroundColor: isActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined,
            }}
            onClick={() => { onSelectThread(thread.id); onClose(); }}
          >
            {thread.branchInfo && (
              <BranchTabIcon
                parentTitle={thread.branchInfo.parentTitle ?? ''}
                messageIndex={thread.branchInfo.fromMessageIndex ?? 0}
              />
            )}
            <span
              className="flex-1 truncate text-xs"
              style={{ color: isActive ? 'var(--accent)' : 'var(--text)' }}
            >
              {thread.title}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {thread.messages?.length ?? 0} msgs
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteThread(thread.id); }}
              className="opacity-0 group-hover:opacity-70 hover:!opacity-100 text-[10px] px-1 rounded transition-opacity duration-75"
              style={{ color: 'var(--text-muted)' }}
              title="Delete conversation"
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ── Compact tab bar with new chat + thread dropdown ── */

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
      className="group relative flex shrink-0 items-center gap-1 px-2.5 py-1 text-[11px] transition-colors duration-100 rounded-t"
      style={{
        color: props.isActive ? 'var(--text)' : 'var(--text-muted)',
        backgroundColor: props.isActive ? 'var(--bg)' : 'transparent',
        borderBottom: props.isActive ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      {props.isBranch && (
        <BranchTabIcon
          parentTitle={props.branchParentTitle ?? ''}
          messageIndex={props.branchMessageIndex ?? 0}
        />
      )}
      <span className="max-w-[120px] truncate">{truncateTitle(props.title)}</span>
      <span
        role="button"
        tabIndex={-1}
        onClick={(e) => { e.stopPropagation(); props.onClose(); }}
        className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[9px] leading-none opacity-0 transition-opacity duration-75 group-hover:opacity-60 hover:!opacity-100"
        style={{ color: 'var(--text-muted)' }}
      >
        &times;
      </span>
    </button>
  );
}

/**
 * Resolves the Claude Code session ID for a thread, used to --resume into
 * an interactive terminal.  Reads from the thread prop first, falls back to
 * IPC polling while the session is active.
 */
function useClaudeSessionId(
  threadId: string | null,
  threadStatus: string | null,
  threadClaudeSessionId: string | null | undefined,
): string | null {
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(
    threadClaudeSessionId ?? null,
  );

  // Prefer the value already on the thread's latestOrchestration
  useEffect(() => {
    if (threadClaudeSessionId) {
      setClaudeSessionId(threadClaudeSessionId);
    }
  }, [threadClaudeSessionId]);

  // Fallback: query via IPC while the thread is actively running
  useEffect(() => {
    if (!threadId || !window.electronAPI?.agentChat?.getLinkedTerminal) {
      setClaudeSessionId(null);
      return;
    }

    let cancelled = false;
    const query = () => {
      void window.electronAPI.agentChat.getLinkedTerminal(threadId).then((result) => {
        if (!cancelled && result?.success && result.claudeSessionId) {
          setClaudeSessionId(result.claudeSessionId);
        }
      });
    };

    query();

    const isActive = threadStatus === 'submitting' || threadStatus === 'running' || threadStatus === 'verifying';
    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (isActive) {
      intervalId = setInterval(query, 2000);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [threadId, threadStatus]);

  useEffect(() => {
    if (!threadId) setClaudeSessionId(null);
  }, [threadId]);

  return claudeSessionId;
}

function OpenInTerminalButton({ threadId, threadStatus, threadClaudeSessionId }: {
  threadId: string | null;
  threadStatus: string | null;
  threadClaudeSessionId: string | null | undefined;
}): React.ReactElement | null {
  const claudeSessionId = useClaudeSessionId(threadId, threadStatus, threadClaudeSessionId);

  const handleClick = useCallback(() => {
    if (!claudeSessionId) return;
    window.dispatchEvent(
      new CustomEvent(OPEN_CHAT_IN_TERMINAL_EVENT, { detail: { claudeSessionId } }),
    );
  }, [claudeSessionId]);

  if (!claudeSessionId) return null;

  return (
    <button
      onClick={handleClick}
      className="flex shrink-0 items-center gap-1 px-2 py-1.5 text-xs transition-colors duration-100"
      style={{ color: 'var(--text-muted)' }}
      title="Resume this chat session in an interactive terminal"
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
      <span>Terminal</span>
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
  const [dropdownOpen, setDropdownOpen] = useState(false);

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
      className="flex items-center border-b relative"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        minHeight: 32,
      }}
    >
      {/* New chat button */}
      <button
        onClick={onNewChat}
        className="flex shrink-0 items-center justify-center w-7 h-full transition-colors duration-100"
        style={{ color: 'var(--text-muted)' }}
        title="New chat (Ctrl+L)"
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        <PlusIcon />
      </button>

      {/* Scrollable tabs */}
      <div
        ref={scrollRef}
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

      {/* Thread history dropdown toggle */}
      {threads.length > 1 && (
        <button
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="flex shrink-0 items-center justify-center w-6 h-full transition-colors duration-100"
          style={{ color: 'var(--text-muted)' }}
          title="Chat history"
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <ChevronDownIcon />
        </button>
      )}

      {/* Resume in terminal */}
      <OpenInTerminalButton
        threadId={activeThreadId}
        threadStatus={threads.find((t) => t.id === activeThreadId)?.status ?? null}
        threadClaudeSessionId={threads.find((t) => t.id === activeThreadId)?.latestOrchestration?.claudeSessionId}
      />

      {/* Thread dropdown */}
      {dropdownOpen && (
        <ThreadDropdown
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={onSelectThread}
          onDeleteThread={onDeleteThread}
          onClose={() => setDropdownOpen(false)}
        />
      )}
    </div>
  );
}
