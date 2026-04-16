/**
 * SideChatDrawer.tsx — Wave 23 Phase C
 *
 * Modal-style slide-in drawer (from the right) listing open side-chat threads
 * as tabs. The body reuses AgentChatConversation via a temporary store context
 * wrapping a per-side-chat store instance.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { AgentChatStoreContext, createAgentChatStore } from './agentChatStore';
import { MergeToMainDialog } from './MergeToMainDialog';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SideChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sideChats: string[];
  activeSideChatId: string | null;
  /** The root/main thread that side chats can be merged into. */
  parentThreadId?: string | null;
  onSelect: (threadId: string) => void;
  onCloseTab: (threadId: string) => void;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function buildTabLabel(_threadId: string, index: number): string {
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

interface HeaderProps {
  onClose: () => void;
  canMerge: boolean;
  onMerge: () => void;
}

function SideChatDrawerHeader({ onClose, canMerge, onMerge }: HeaderProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border-semantic flex-shrink-0">
      <span className="text-sm font-medium text-text-semantic-primary">Side Chats</span>
      <div className="flex items-center gap-2">
        {canMerge && (
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-text-semantic-secondary hover:text-text-semantic-primary hover:bg-surface-hover"
            aria-label="Merge into main thread"
            onClick={onMerge}
          >
            Merge into main
          </button>
        )}
        <button
          type="button"
          className="rounded p-1 text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-hover"
          aria-label="Close side chat drawer"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
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

// ── Merge dialog state ────────────────────────────────────────────────────────

function useMergeDialogState(
  activeSideChatId: string | null,
  parentThreadId: string | null,
): { canMerge: boolean; mergeOpen: boolean; openMerge: () => void; closeMerge: () => void } {
  const [mergeOpen, setMergeOpen] = useState(false);
  const openMerge = useCallback(() => setMergeOpen(true), []);
  const closeMerge = useCallback(() => setMergeOpen(false), []);
  const canMerge = activeSideChatId !== null && parentThreadId !== null;
  return { canMerge, mergeOpen, openMerge, closeMerge };
}

// ── Drawer panel ─────────────────────────────────────────────────────────────

interface DrawerPanelProps extends SideChatDrawerProps {
  activeStore: ReturnType<typeof createAgentChatStore> | null;
  canMerge: boolean;
  mergeOpen: boolean;
  openMerge: () => void;
  closeMerge: () => void;
}

function DrawerPanel({
  onClose, sideChats, activeSideChatId, parentThreadId,
  onSelect, onCloseTab, activeStore, canMerge, mergeOpen, openMerge, closeMerge,
}: DrawerPanelProps): React.ReactElement {
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
        <SideChatDrawerHeader onClose={onClose} canMerge={canMerge} onMerge={openMerge} />
        <SideChatDrawerContent
          sideChats={sideChats}
          activeSideChatId={activeSideChatId}
          activeStore={activeStore}
          onSelect={onSelect}
          onCloseTab={onCloseTab}
        />
      </div>
      {canMerge && mergeOpen && activeSideChatId && parentThreadId && (
        <MergeToMainDialog
          sideChatId={activeSideChatId}
          parentThreadId={parentThreadId}
          isOpen={mergeOpen}
          onClose={closeMerge}
        />
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SideChatDrawer(props: SideChatDrawerProps): React.ReactElement | null {
  const { isOpen, onClose, activeSideChatId, parentThreadId } = props;
  const activeStore = usePerTabStore(activeSideChatId);
  const { canMerge, mergeOpen, openMerge, closeMerge } = useMergeDialogState(
    activeSideChatId, parentThreadId ?? null,
  );
  useEscapeToDismiss(isOpen, onClose);

  if (!isOpen) return null;
  return (
    <DrawerPanel
      {...props}
      activeStore={activeStore}
      canMerge={canMerge}
      mergeOpen={mergeOpen}
      openMerge={openMerge}
      closeMerge={closeMerge}
    />
  );
}
