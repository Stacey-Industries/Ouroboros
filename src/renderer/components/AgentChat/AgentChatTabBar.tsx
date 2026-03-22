import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
      className="shrink-0 text-interactive-accent"
      title={`Branched from "${parentTitle}" at message ${messageIndex}`}
      style={{ opacity: 0.7 }}
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
  triggerRect,
}: {
  threads: AgentChatThreadRecord[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onClose: () => void;
  triggerRect: DOMRect;
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

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: triggerRect.bottom + 2,
        left: triggerRect.left,
        width: triggerRect.width,
        maxHeight: 300,
        overflowY: 'auto',
        overflowX: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        zIndex: 9999,
        padding: '4px 0',
        backgroundColor: '#0d0d12',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 10,
      }}
    >
      {threads.length === 0 && (
        <div className="px-3 py-2 text-xs text-text-semantic-muted">No conversations</div>
      )}
      {threads.map((thread) => {
        const isActive = thread.id === activeThreadId;
        return (
          <div
            key={thread.id}
            className="group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors duration-75 hover:bg-surface-raised"
            style={{
              backgroundColor: isActive ? 'color-mix(in srgb, var(--interactive-accent) 8%, transparent)' : undefined,
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
              className={`flex-1 truncate text-xs ${isActive ? 'text-interactive-accent' : 'text-text-semantic-primary'}`}
            >
              {thread.title}
            </span>
            <span className="text-[10px] text-text-semantic-muted">
              {thread.messages?.length ?? 0} msgs
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteThread(thread.id); }}
              className="opacity-0 group-hover:opacity-70 hover:!opacity-100 text-[10px] px-1 rounded text-text-semantic-muted transition-opacity duration-75"
              title="Delete conversation"
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
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
      className={`group relative flex shrink-0 items-center gap-1 px-2.5 py-1 text-[11px] transition-colors duration-100 rounded-t ${props.isActive ? 'text-text-semantic-primary bg-surface-base' : 'text-text-semantic-muted'}`}
      style={{
        borderBottom: props.isActive ? '2px solid var(--interactive-accent)' : '2px solid transparent',
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
        className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[9px] leading-none opacity-0 text-text-semantic-muted transition-opacity duration-75 group-hover:opacity-60 hover:!opacity-100"
      >
        &times;
      </span>
    </button>
  );
}

/**
 * Resolves the provider-backed resume session ID for a thread, used to
 * reopen the chat in an interactive terminal.
 */
function useLinkedSessionId(
  threadId: string | null,
  threadStatus: string | null,
  threadProvider: 'claude-code' | 'codex' | undefined,
  threadClaudeSessionId: string | null | undefined,
  threadCodexThreadId: string | null | undefined,
): { provider: 'claude-code' | 'codex' | null; sessionId: string | null } {
  const [state, setState] = useState<{ provider: 'claude-code' | 'codex' | null; sessionId: string | null }>({
    provider: threadProvider ?? (threadCodexThreadId ? 'codex' : threadClaudeSessionId ? 'claude-code' : null),
    sessionId: threadCodexThreadId ?? threadClaudeSessionId ?? null,
  });

  useEffect(() => {
    if (threadCodexThreadId) {
      setState({ provider: 'codex', sessionId: threadCodexThreadId });
      return;
    }
    if (threadClaudeSessionId) {
      setState({ provider: 'claude-code', sessionId: threadClaudeSessionId });
      return;
    }
    setState((prev) => ({ provider: threadProvider ?? prev.provider, sessionId: prev.sessionId }));
  }, [threadClaudeSessionId, threadCodexThreadId, threadProvider]);

  // Fallback: query via IPC while the thread is actively running
  useEffect(() => {
    if (!threadId || !window.electronAPI?.agentChat?.getLinkedTerminal) {
      setState({ provider: null, sessionId: null });
      return;
    }

    let cancelled = false;
    const query = () => {
      void window.electronAPI.agentChat.getLinkedTerminal(threadId).then((result) => {
        if (cancelled || !result?.success) {
          return;
        }
        const provider =
          result.provider === 'claude-code' || result.provider === 'codex'
            ? result.provider
            : result.codexThreadId
              ? 'codex'
              : result.claudeSessionId
                ? 'claude-code'
                : null;
        const sessionId = result.codexThreadId ?? result.claudeSessionId ?? null;
        if (provider && sessionId) {
          setState({ provider, sessionId });
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
    if (!threadId) {
      setState({ provider: null, sessionId: null });
    }
  }, [threadId]);

  return state;
}

function OpenInTerminalButton({ threadId, threadStatus, threadProvider, threadClaudeSessionId, threadCodexThreadId, threadModel }: {
  threadId: string | null;
  threadStatus: string | null;
  threadProvider: 'claude-code' | 'codex' | undefined;
  threadClaudeSessionId: string | null | undefined;
  threadCodexThreadId: string | null | undefined;
  threadModel: string | null | undefined;
}): React.ReactElement | null {
  const linked = useLinkedSessionId(
    threadId,
    threadStatus,
    threadProvider,
    threadClaudeSessionId,
    threadCodexThreadId,
  );

  const handleClick = useCallback(() => {
    if (!linked.provider || !linked.sessionId) return;
    window.dispatchEvent(
      new CustomEvent(OPEN_CHAT_IN_TERMINAL_EVENT, {
        detail: {
          provider: linked.provider,
          sessionId: linked.sessionId,
          model: threadModel ?? undefined,
        },
      }),
    );
  }, [linked.provider, linked.sessionId, threadModel]);

  if (!linked.sessionId) return null;

  return (
    <button
      onClick={handleClick}
      className="flex shrink-0 items-center gap-1 px-2 py-1.5 text-xs text-text-semantic-muted transition-colors duration-100 hover:text-interactive-accent"
      title="Resume this chat session in an interactive terminal"
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
  const barRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [barRect, setBarRect] = useState<DOMRect | null>(null);

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
      ref={barRef}
      className="flex items-center border-b border-border-semantic relative bg-surface-panel"
      style={{ minHeight: 32 }}
    >
      {/* New chat button */}
      <button
        onClick={onNewChat}
        className="flex shrink-0 items-center justify-center w-7 h-full text-text-semantic-muted transition-colors duration-100 hover:text-interactive-accent"
        title="New chat (Ctrl+L)"
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
          onClick={() => {
            if (!dropdownOpen && barRef.current) setBarRect(barRef.current.getBoundingClientRect());
            setDropdownOpen((prev) => !prev);
          }}
          className="flex shrink-0 items-center justify-center w-6 h-full text-text-semantic-muted transition-colors duration-100 hover:text-text-semantic-primary"
          title="Chat history"
        >
          <ChevronDownIcon />
        </button>
      )}

      {/* Resume in terminal */}
      <OpenInTerminalButton
        threadId={activeThreadId}
        threadStatus={threads.find((t) => t.id === activeThreadId)?.status ?? null}
        threadProvider={threads.find((t) => t.id === activeThreadId)?.latestOrchestration?.provider as 'claude-code' | 'codex' | undefined}
        threadClaudeSessionId={threads.find((t) => t.id === activeThreadId)?.latestOrchestration?.claudeSessionId}
        threadCodexThreadId={threads.find((t) => t.id === activeThreadId)?.latestOrchestration?.codexThreadId}
        threadModel={threads.find((t) => t.id === activeThreadId)?.latestOrchestration?.model}
      />

      {/* Thread dropdown */}
      {dropdownOpen && barRect && (
        <ThreadDropdown
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={onSelectThread}
          onDeleteThread={onDeleteThread}
          onClose={() => setDropdownOpen(false)}
          triggerRect={barRect}
        />
      )}
    </div>
  );
}
