/**
 * AgentChatTabBarParts.tsx — Sub-components and hooks for AgentChatTabBar.
 * Extracted to keep AgentChatTabBar.tsx under the 300-line limit.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { OPEN_CHAT_IN_TERMINAL_EVENT } from '../../hooks/appEventNames';
import type { AgentChatThreadRecord } from '../../types/electron';

export type LinkedSession = { provider: 'claude-code' | 'codex' | null; sessionId: string | null };

export const THREAD_DROPDOWN_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: 0,
  maxHeight: 300,
  overflowX: 'hidden',
  overflowY: 'auto',
  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  zIndex: 9999,
  padding: '4px 0',
  backgroundColor: 'var(--surface-base)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 10,
};

export function resolveLinkedProvider(
  provider: unknown,
  codexThreadId?: string | null,
  claudeSessionId?: string | null,
): LinkedSession['provider'] {
  return provider === 'claude-code' || provider === 'codex'
    ? provider
    : codexThreadId
      ? 'codex'
      : claudeSessionId
        ? 'claude-code'
        : null;
}

function getInitialLinkedSession(thread: AgentChatThreadRecord | null): LinkedSession {
  const orchestration = thread?.latestOrchestration;
  return {
    provider: resolveLinkedProvider(
      orchestration?.provider,
      orchestration?.codexThreadId,
      orchestration?.claudeSessionId,
    ),
    sessionId: orchestration?.codexThreadId ?? orchestration?.claudeSessionId ?? null,
  };
}

export function BranchTabIcon({
  parentTitle,
  messageIndex,
}: {
  parentTitle: string;
  messageIndex: number;
}): React.ReactElement {
  return (
    <span
      className="shrink-0 text-interactive-accent"
      title={`Branched from "${parentTitle}" at message ${messageIndex}`}
      style={{ opacity: 0.7 }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
    </span>
  );
}

function useThreadDropdownDismiss(
  dropdownRef: React.RefObject<HTMLDivElement>,
  onClose: () => void,
): void {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) onClose();
    };
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [dropdownRef, onClose]);
}

function ThreadDropdownItem({
  activeThreadId,
  onClose,
  onDeleteThread,
  onSelectThread,
  thread,
}: {
  activeThreadId: string | null;
  onClose: () => void;
  onDeleteThread: (id: string) => void;
  onSelectThread: (id: string) => void;
  thread: AgentChatThreadRecord;
}): React.ReactElement {
  const isActive = thread.id === activeThreadId;
  return (
    <div
      className="group flex cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors duration-75 hover:bg-surface-raised"
      style={{
        backgroundColor: isActive
          ? 'color-mix(in srgb, var(--interactive-accent) 8%, transparent)'
          : undefined,
      }}
      onClick={() => {
        onSelectThread(thread.id);
        onClose();
      }}
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
        onClick={(event) => {
          event.stopPropagation();
          onDeleteThread(thread.id);
        }}
        className="rounded px-1 text-[10px] text-text-semantic-muted opacity-0 transition-opacity duration-75 group-hover:opacity-70 hover:!opacity-100"
        title="Delete conversation"
      >
        &times;
      </button>
    </div>
  );
}

function ThreadDropdownContent({
  activeThreadId,
  dropdownRef,
  onClose,
  onDeleteThread,
  onSelectThread,
  threads,
  triggerRect,
}: {
  activeThreadId: string | null;
  dropdownRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onDeleteThread: (id: string) => void;
  onSelectThread: (id: string) => void;
  threads: AgentChatThreadRecord[];
  triggerRect: DOMRect;
}): React.ReactElement {
  return (
    <div
      ref={dropdownRef}
      style={{
        ...THREAD_DROPDOWN_STYLE,
        top: triggerRect.bottom + 2,
        left: triggerRect.left,
        width: triggerRect.width,
      }}
    >
      {threads.length === 0 && (
        <div className="px-3 py-2 text-xs text-text-semantic-muted">No conversations</div>
      )}
      {threads.map((thread) => (
        <ThreadDropdownItem
          key={thread.id}
          activeThreadId={activeThreadId}
          onClose={onClose}
          onDeleteThread={onDeleteThread}
          onSelectThread={onSelectThread}
          thread={thread}
        />
      ))}
    </div>
  );
}

export function ThreadDropdown({
  activeThreadId,
  onClose,
  onDeleteThread,
  onSelectThread,
  threads,
  triggerRect,
}: {
  activeThreadId: string | null;
  onClose: () => void;
  onDeleteThread: (id: string) => void;
  onSelectThread: (id: string) => void;
  threads: AgentChatThreadRecord[];
  triggerRect: DOMRect;
}): React.ReactElement {
  const dropdownRef = useRef<HTMLDivElement>(null);
  useThreadDropdownDismiss(dropdownRef, onClose);
  return createPortal(
    <ThreadDropdownContent
      activeThreadId={activeThreadId}
      dropdownRef={dropdownRef}
      onClose={onClose}
      onDeleteThread={onDeleteThread}
      onSelectThread={onSelectThread}
      threads={threads}
      triggerRect={triggerRect}
    />,
    document.body,
  );
}

export function OpenInTerminalButton({
  linkedSession,
  threadModel,
}: {
  linkedSession: LinkedSession;
  threadModel: string | null | undefined;
}): React.ReactElement | null {
  const handleClick = useCallback(() => {
    if (!linkedSession.provider || !linkedSession.sessionId) return;
    window.dispatchEvent(
      new CustomEvent(OPEN_CHAT_IN_TERMINAL_EVENT, {
        detail: {
          provider: linkedSession.provider,
          sessionId: linkedSession.sessionId,
          model: threadModel ?? undefined,
        },
      }),
    );
  }, [linkedSession.provider, linkedSession.sessionId, threadModel]);

  if (!linkedSession.sessionId) return null;
  return (
    <button
      onClick={handleClick}
      className="flex shrink-0 items-center gap-1 px-2 py-1.5 text-xs text-text-semantic-muted transition-colors duration-100 hover:text-interactive-accent"
      title="Resume this chat session in an interactive terminal"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
      <span>Terminal</span>
    </button>
  );
}

function useLinkedTerminalPoll(
  thread: AgentChatThreadRecord | null,
  setState: React.Dispatch<React.SetStateAction<LinkedSession>>,
): void {
  useEffect(() => {
    if (!thread?.id || !window.electronAPI?.agentChat?.getLinkedTerminal) {
      setState({ provider: null, sessionId: null });
      return;
    }
    let cancelled = false;
    const query = () => {
      void window.electronAPI.agentChat.getLinkedTerminal(thread.id).then((result) => {
        if (cancelled || !result?.success) return;
        const provider = resolveLinkedProvider(
          result.provider,
          result.codexThreadId,
          result.claudeSessionId,
        );
        const sessionId = result.codexThreadId ?? result.claudeSessionId ?? null;
        if (provider && sessionId) setState({ provider, sessionId });
      });
    };
    query();
    const isActive =
      thread.status === 'submitting' ||
      thread.status === 'running' ||
      thread.status === 'verifying';
    const intervalId = isActive ? setInterval(query, 2000) : undefined;
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [thread?.id, thread?.status, setState]);
}

export function useLinkedSessionId(thread: AgentChatThreadRecord | null): LinkedSession {
  const [state, setState] = useState<LinkedSession>(() => getInitialLinkedSession(thread));
  const orchestration = thread?.latestOrchestration;
  useEffect(() => {
    if (orchestration?.codexThreadId) {
      setState({ provider: 'codex', sessionId: orchestration.codexThreadId });
      return;
    }
    if (orchestration?.claudeSessionId) {
      setState({ provider: 'claude-code', sessionId: orchestration.claudeSessionId });
      return;
    }
    setState((previous) => ({
      provider: orchestration?.provider ?? previous.provider,
      sessionId: previous.sessionId,
    }));
  }, [orchestration?.claudeSessionId, orchestration?.codexThreadId, orchestration?.provider]);
  useLinkedTerminalPoll(thread, setState);
  return state;
}
