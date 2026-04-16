/**
 * SideChatDrawer.tsx — Wave 23 Phase C
 *
 * Modal-style slide-in drawer (from the right) listing open side-chat threads
 * as tabs. The body reuses AgentChatConversation via a temporary store context
 * wrapping a per-side-chat store instance.
 */

import React, { useEffect, useRef } from 'react';

import { AgentChatStoreContext, createAgentChatStore } from './agentChatStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SideChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sideChats: string[];
  activeSideChatId: string | null;
  onSelect: (threadId: string) => void;
  onCloseTab: (threadId: string) => void;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function buildTabLabel(threadId: string, index: number): string {
  return `Side chat ${(index + 1).toString()}`;
}

interface TabBarProps {
  sideChats: string[];
  activeSideChatId: string | null;
  onSelect: (threadId: string) => void;
  onCloseTab: (threadId: string) => void;
}

function SideChatTabBar({ sideChats, activeSideChatId, onSelect, onCloseTab }: TabBarProps): React.ReactElement {
  return (
    <div
      className="flex items-center overflow-x-auto border-b border-border-semantic flex-shrink-0"
      role="tablist"
      aria-label="Side chat tabs"
    >
      {sideChats.map((id, index) => {
        const isActive = id === activeSideChatId;
        return (
          <div
            key={id}
            role="tab"
            aria-selected={isActive}
            className={[
              'flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer whitespace-nowrap flex-shrink-0',
              'border-b-2 transition-colors',
              isActive
                ? 'border-interactive-accent text-text-semantic-primary'
                : 'border-transparent text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-hover',
            ].join(' ')}
            onClick={() => onSelect(id)}
          >
            <span>{buildTabLabel(id, index)}</span>
            <button
              type="button"
              className="ml-1 rounded p-0.5 text-text-semantic-faint hover:text-text-semantic-primary hover:bg-surface-inset"
              aria-label={`Close ${buildTabLabel(id, index)}`}
              onClick={(e) => { e.stopPropagation(); onCloseTab(id); }}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface EmptyBodyProps {
  hasChats: boolean;
}

function SideChatDrawerBody({ hasChats }: EmptyBodyProps): React.ReactElement {
  if (!hasChats) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-text-semantic-muted">
        Press Ctrl+; again to start a side chat from the current message.
      </div>
    );
  }
  return <div className="flex-1 min-h-0 overflow-hidden" />;
}

// ── Backdrop ──────────────────────────────────────────────────────────────────

interface BackdropProps { onClose: () => void }

function SideChatBackdrop({ onClose }: BackdropProps): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-40"
      style={{ background: 'rgba(0,0,0,0.3)' }}
      aria-hidden="true"
      onClick={onClose}
    />
  );
}

// ── Drawer header ─────────────────────────────────────────────────────────────

interface HeaderProps { onClose: () => void }

function SideChatDrawerHeader({ onClose }: HeaderProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border-semantic flex-shrink-0">
      <span className="text-sm font-medium text-text-semantic-primary">Side Chats</span>
      <button
        type="button"
        className="rounded p-1 text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-hover"
        aria-label="Close side chat drawer"
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
}

// ── Per-tab store singleton map ───────────────────────────────────────────────
// We keep one store per side-chat ID so each conversation is independent.

function usePerTabStore(
  threadId: string | null,
): ReturnType<typeof createAgentChatStore> | null {
  const storesRef = useRef<Map<string, ReturnType<typeof createAgentChatStore>>>(new Map());
  if (!threadId) return null;
  if (!storesRef.current.has(threadId)) {
    storesRef.current.set(threadId, createAgentChatStore());
  }
  return storesRef.current.get(threadId) ?? null;
}

// ── Escape-key dismissal ──────────────────────────────────────────────────────

function useEscapeToDismiss(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
}

// ── Drawer body with optional store context ───────────────────────────────────

function SideChatDrawerContent({
  sideChats,
  activeSideChatId,
  activeStore,
  onSelect,
  onCloseTab,
}: {
  sideChats: string[];
  activeSideChatId: string | null;
  activeStore: ReturnType<typeof createAgentChatStore> | null;
  onSelect: (id: string) => void;
  onCloseTab: (id: string) => void;
}): React.ReactElement {
  const body = <SideChatDrawerBody hasChats={sideChats.length > 0} />;
  return (
    <>
      {sideChats.length > 0 && (
        <SideChatTabBar
          sideChats={sideChats}
          activeSideChatId={activeSideChatId}
          onSelect={onSelect}
          onCloseTab={onCloseTab}
        />
      )}
      {activeStore ? (
        <AgentChatStoreContext.Provider value={activeStore}>{body}</AgentChatStoreContext.Provider>
      ) : body}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SideChatDrawer({
  isOpen,
  onClose,
  sideChats,
  activeSideChatId,
  onSelect,
  onCloseTab,
}: SideChatDrawerProps): React.ReactElement | null {
  const activeStore = usePerTabStore(activeSideChatId);
  useEscapeToDismiss(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <>
      <SideChatBackdrop onClose={onClose} />
      <div
        role="dialog"
        aria-label="Side chat drawer"
        aria-modal="true"
        className="fixed right-0 top-0 z-50 flex h-full flex-col bg-surface-panel shadow-xl"
        style={{ width: '480px', borderLeft: '1px solid var(--border-semantic)' }}
      >
        <SideChatDrawerHeader onClose={onClose} />
        <SideChatDrawerContent
          sideChats={sideChats}
          activeSideChatId={activeSideChatId}
          activeStore={activeStore}
          onSelect={onSelect}
          onCloseTab={onCloseTab}
        />
      </div>
    </>
  );
}
