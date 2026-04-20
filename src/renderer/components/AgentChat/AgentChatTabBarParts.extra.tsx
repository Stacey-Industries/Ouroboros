/**
 * AgentChatTabBarParts.extra.tsx — overflow from AgentChatTabBarParts.tsx
 * Kept separate to stay under the 300-line file cap.
 */
import React, { useCallback } from 'react';

import { OPEN_CHAT_IN_TERMINAL_EVENT } from '../../hooks/appEventNames';
import type { AgentChatThreadRecord } from '../../types/electron';
import type { LinkedSession } from './AgentChatTabBarHooks';

// ── resolveRootThread ─────────────────────────────────────────────────────────

/** Walk the parentThreadId chain to find the root thread of the current branch tree. */
export function resolveRootThread(
  threads: AgentChatThreadRecord[],
  activeThreadId: string | null,
): AgentChatThreadRecord | null {
  if (!activeThreadId) return threads[0] ?? null;
  const active = threads.find((t) => t.id === activeThreadId) ?? null;
  if (!active) return threads[0] ?? null;
  let current = active;
  for (let i = 0; i < threads.length; i++) {
    if (!current.parentThreadId) return current;
    const parent = threads.find((t) => t.id === current.parentThreadId);
    if (!parent) return current;
    current = parent;
  }
  return current;
}

// ── OpenInTerminalButton ──────────────────────────────────────────────────────

function TerminalIcon(): React.ReactElement {
  return (
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
      <TerminalIcon />
      <span>Terminal</span>
    </button>
  );
}

// ── PopOutChatButton ─────────────────────────────────────────────────────────

function PopOutIcon(): React.ReactElement {
  return (
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
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/** Spawn the current IDE session in a dedicated chat-only BrowserWindow. */
export function PopOutChatButton(): React.ReactElement | null {
  const handleClick = useCallback(async () => {
    const api = window.electronAPI;
    const active = await api.sessionCrud.active();
    const sessionId = active?.success ? active.sessionId : null;
    if (!sessionId) return;
    await api.sessionCrud.openChatWindow(sessionId);
  }, []);
  // `sessionCrud` is desktop-only; hide the button in web mode where it stubs out.
  if (!window.electronAPI?.sessionCrud?.openChatWindow) return null;
  return (
    <button
      onClick={handleClick}
      className="flex shrink-0 items-center gap-1 px-2 py-1.5 text-xs text-text-semantic-muted transition-colors duration-100 hover:text-interactive-accent"
      title="Open this chat in a separate window"
    >
      <PopOutIcon />
      <span>Pop out</span>
    </button>
  );
}
