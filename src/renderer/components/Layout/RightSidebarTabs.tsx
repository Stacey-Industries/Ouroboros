/**
 * RightSidebarTabs.tsx — Chat-dominant right sidebar panel.
 *
 * Chat is the primary experience. Monitor, Git, and Analytics are accessible
 * via a settings/view dropdown in the header, not as competing tabs.
 *
 * Header layout:
 *   [Collapse] [History] [thread title] [+ New] [View Switcher]
 */

import React, { useState, useCallback, memo, useEffect, useRef } from 'react';
import type { AgentChatThreadRecord } from '../../types/electron';
import { ChatHistoryPanel } from '../AgentChat/ChatHistoryPanel';
import {
  FOCUS_AGENT_CHAT_EVENT,
  OPEN_AGENT_CHAT_PANEL_EVENT,
} from '../../hooks/appEventNames';

export type RightSidebarView = 'chat' | 'monitor' | 'git' | 'analytics' | 'memory';

export interface RightSidebarTabsProps {
  chatContent: React.ReactNode;
  monitorContent: React.ReactNode;
  gitContent: React.ReactNode;
  analyticsContent?: React.ReactNode;
  memoryContent?: React.ReactNode;
  /** Chat thread data — passed through from AgentChatWorkspace */
  threads?: AgentChatThreadRecord[];
  activeThreadId?: string | null;
  onSelectThread?: (threadId: string) => void;
  onDeleteThread?: (threadId: string) => void;
  onNewChat?: () => void;
}

/* ── Icons ── */

function CollapseIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HistoryIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4v5h5" />
      <path d="M3.51 10a7 7 0 1 0 .13-7.13L1 4" />
      <polyline points="8 4 8 8 11 10" />
    </svg>
  );
}

function PlusIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6 2v8M2 6h8" />
    </svg>
  );
}

function GearIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v1.7M8 12.8v1.7M1.5 8h1.7M12.8 8h1.7M3.4 3.4l1.2 1.2M11.4 11.4l1.2 1.2M3.4 12.6l1.2-1.2M11.4 4.6l1.2-1.2" />
    </svg>
  );
}

function BackArrowIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MonitorIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2" width="14" height="10" rx="1.5" />
      <path d="M5 15h6M8 12v3" />
    </svg>
  );
}

function GitIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="13" />
      <path d="M11 5C11 8 6 8 6 10" />
      <circle cx="6" cy="3" r="1.5" fill="currentColor" />
      <circle cx="6" cy="13" r="1.5" fill="currentColor" />
      <circle cx="11" cy="5" r="1.5" fill="currentColor" />
    </svg>
  );
}

function AnalyticsIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="9" width="3" height="5" rx="0.5" />
      <rect x="6" y="5" width="3" height="9" rx="0.5" />
      <rect x="11" y="2" width="3" height="12" rx="0.5" />
    </svg>
  );
}

function MemoryIcon(): React.ReactElement {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1a5 5 0 0 1 5 5c0 1.8-1 3.2-2.1 4.3S9 12.5 9 14H7c0-1.5-.4-2.5-1.9-3.7A5 5 0 0 1 8 1z" />
      <path d="M6.5 15h3" />
      <path d="M7 14h2" />
    </svg>
  );
}

/* ── View Switcher Dropdown ── */

const SECONDARY_VIEWS: Array<{ id: RightSidebarView; label: string; Icon: () => React.ReactElement }> = [
  { id: 'monitor', label: 'Monitor', Icon: MonitorIcon },
  { id: 'git', label: 'Git Status', Icon: GitIcon },
  { id: 'analytics', label: 'Analytics', Icon: AnalyticsIcon },
  { id: 'memory', label: 'Memory', Icon: MemoryIcon },
];

function ViewSwitcherDropdown({
  activeView,
  onSwitchView,
  onClose,
}: {
  activeView: RightSidebarView;
  onSwitchView: (view: RightSidebarView) => void;
  onClose: () => void;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
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
      ref={ref}
      className="absolute right-1 z-50 bg-surface-overlay border border-border-semantic backdrop-blur-xl"
      style={{
        top: '100%',
        marginTop: 2,
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        minWidth: 150,
        padding: '4px 0',
      }}
    >
      {SECONDARY_VIEWS.map(({ id, label, Icon }) => {
        const isActive = activeView === id;
        return (
          <button
            key={id}
            onClick={() => { onSwitchView(id); onClose(); }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors duration-75 text-text-semantic-primary"
            style={{
              color: isActive ? 'var(--interactive-accent)' : undefined,
              backgroundColor: isActive ? 'color-mix(in srgb, var(--interactive-accent) 8%, transparent)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Icon />
            <span>{label}</span>
          </button>
        );
      })}

      <div className="my-1 border-t border-border-semantic" />

      {/* Back to chat when on a secondary view */}
      {activeView !== 'chat' && (
        <button
          onClick={() => { onSwitchView('chat'); onClose(); }}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors duration-75 text-interactive-accent"
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-raised)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <BackArrowIcon />
          <span>Back to Chat</span>
        </button>
      )}
    </div>
  );
}

/* ── Secondary View Header (for Monitor/Git/Analytics) ── */

function SecondaryViewHeader({
  label,
  onBackToChat,
  onCollapse,
}: {
  label: string;
  onBackToChat: () => void;
  onCollapse: () => void;
}): React.ReactElement {
  return (
    <div
      className="flex-shrink-0 flex items-center h-8 border-b bg-surface-panel"
      style={{ borderColor: 'var(--border-muted, var(--border))' }}
    >
      <button
        onClick={onCollapse}
        title="Collapse sidebar (Ctrl+\)"
        className="flex-shrink-0 flex items-center justify-center w-7 h-full text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-raised transition-colors duration-100"
      >
        <CollapseIcon />
      </button>

      <button
        onClick={onBackToChat}
        className="flex items-center gap-1 px-1.5 text-xs transition-colors duration-100 text-text-semantic-muted"
        title="Back to Chat"
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--interactive-accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
      >
        <BackArrowIcon />
        <span>Chat</span>
      </button>

      <span className="mx-1 text-[10px] text-border-semantic">|</span>

      <span
        className="text-xs font-semibold uppercase tracking-wider select-none text-text-semantic-muted"
        style={{ letterSpacing: '0.06em' }}
      >
        {label}
      </span>

      <div className="flex-1" />
    </div>
  );
}

/* ── Chat Panel Header ── */

function ChatPanelHeader({
  activeThread,
  threadCount,
  historyOpen,
  onToggleHistory,
  onNewChat,
  onCollapse,
  viewDropdownOpen,
  onToggleViewDropdown,
  activeView,
  onSwitchView,
}: {
  activeThread: AgentChatThreadRecord | null;
  threadCount: number;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onNewChat: () => void;
  onCollapse: () => void;
  viewDropdownOpen: boolean;
  onToggleViewDropdown: () => void;
  activeView: RightSidebarView;
  onSwitchView: (view: RightSidebarView) => void;
}): React.ReactElement {
  return (
    <div
      className="flex-shrink-0 flex items-center h-8 border-b relative bg-surface-panel"
      style={{ borderColor: 'var(--border-muted, var(--border))' }}
    >
      <button
        onClick={onCollapse}
        title="Collapse sidebar (Ctrl+\)"
        className="flex-shrink-0 flex items-center justify-center w-7 h-full text-text-semantic-muted hover:text-text-semantic-primary hover:bg-surface-raised transition-colors duration-100"
      >
        <CollapseIcon />
      </button>

      <button
        data-history-toggle
        onClick={onToggleHistory}
        className="flex items-center gap-1 px-1.5 py-1 rounded transition-colors duration-100 text-text-semantic-muted"
        style={{
          color: historyOpen ? 'var(--interactive-accent)' : undefined,
          backgroundColor: historyOpen ? 'color-mix(in srgb, var(--interactive-accent) 10%, transparent)' : 'transparent',
        }}
        title={`Chat History (${threadCount} conversations)`}
        onMouseEnter={(e) => {
          if (!historyOpen) {
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
          }
        }}
        onMouseLeave={(e) => {
          if (!historyOpen) {
            e.currentTarget.style.color = '';
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        <HistoryIcon />
        {threadCount > 0 && (
          <span className="text-[10px]">{threadCount}</span>
        )}
      </button>

      <span
        className="flex-1 flex items-center justify-center gap-1.5 truncate text-[11px] px-1.5 select-none text-text-semantic-muted"
        title={activeThread?.title ?? 'New Chat'}
      >
        {activeThread && (activeThread.status === 'running' || activeThread.status === 'submitting') && (
          <svg className="h-3 w-3 animate-spin shrink-0 text-interactive-accent" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
          </svg>
        )}
        {activeThread && activeThread.status === 'complete' && (
          <svg className="h-3 w-3 shrink-0 text-status-success" viewBox="0 0 16 16" fill="none">
            <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {activeThread && activeThread.status === 'failed' && (
          <svg className="h-3 w-3 shrink-0 text-status-error" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
            <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        )}
        <span className="truncate">{activeThread?.title ?? 'New Chat'}</span>
      </span>

      <button
        onClick={onNewChat}
        className="flex items-center gap-1 px-1.5 py-1 mr-0.5 rounded text-[11px] transition-colors duration-100 text-interactive-accent"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--interactive-accent) 8%, transparent)',
        }}
        title="New Chat (Ctrl+L)"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--interactive-accent) 18%, transparent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--interactive-accent) 8%, transparent)';
        }}
      >
        <PlusIcon />
      </button>

      <button
        onClick={onToggleViewDropdown}
        className="flex-shrink-0 flex items-center justify-center w-7 h-full transition-colors duration-100 text-text-semantic-muted"
        style={{
          color: viewDropdownOpen ? 'var(--interactive-accent)' : undefined,
        }}
        title="Switch view"
        onMouseEnter={(e) => {
          if (!viewDropdownOpen) {
            e.currentTarget.style.color = 'var(--text-primary)';
          }
        }}
        onMouseLeave={(e) => {
          if (!viewDropdownOpen) {
            e.currentTarget.style.color = '';
          }
        }}
      >
        <GearIcon />
      </button>

      {viewDropdownOpen && (
        <ViewSwitcherDropdown
          activeView={activeView}
          onSwitchView={onSwitchView}
          onClose={onToggleViewDropdown}
        />
      )}
    </div>
  );
}

/* ── Recent Thread Tabs (last 5 conversations with status indicators) ── */

function ThreadStatusIcon({ status }: { status: string }): React.ReactElement {
  if (status === 'running' || status === 'submitting' || status === 'verifying') {
    return (
      <svg className="h-2.5 w-2.5 animate-spin shrink-0 text-interactive-accent" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === 'complete') {
    return (
      <svg className="h-2.5 w-2.5 shrink-0 text-status-success" viewBox="0 0 16 16" fill="none">
        <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'failed') {
    return (
      <svg className="h-2.5 w-2.5 shrink-0 text-status-error" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  // idle / other — small neutral dot
  return (
    <span
      className="block h-1.5 w-1.5 rounded-full shrink-0 bg-text-semantic-muted"
    />
  );
}

const MAX_RECENT_TABS = 5;

function RecentThreadTabs({
  threads,
  activeThreadId,
  onSelect,
}: {
  threads: AgentChatThreadRecord[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
}): React.ReactElement | null {
  // Show the most recently updated threads (up to 5)
  const recentThreads = [...threads]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_RECENT_TABS);

  if (recentThreads.length === 0) return null;

  return (
    <div
      className="flex-shrink-0 flex items-center gap-0.5 px-1 overflow-x-auto border-b bg-surface-panel"
      style={{
        borderColor: 'var(--border-muted, var(--border))',
        scrollbarWidth: 'none',
      }}
    >
      {recentThreads.map((thread) => {
        const isActive = thread.id === activeThreadId;
        return (
          <button
            key={thread.id}
            onClick={() => onSelect(thread.id)}
            className="flex items-center gap-1 shrink-0 px-2 py-1 text-[10px] transition-colors duration-100 relative text-text-semantic-muted"
            style={{
              color: isActive ? 'var(--interactive-accent)' : undefined,
              backgroundColor: isActive ? 'color-mix(in srgb, var(--interactive-accent) 10%, transparent)' : 'transparent',
              borderRadius: '4px 4px 0 0',
            }}
            title={thread.title || 'Chat'}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'var(--surface-raised)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '';
              }
            }}
          >
            <ThreadStatusIcon status={thread.status} />
            <span className="truncate max-w-[90px]">{thread.title || 'Chat'}</span>
            {isActive && (
              <span
                className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-interactive-accent"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Focus hook ── */

function useAgentChatViewFocus(
  setActiveView: React.Dispatch<React.SetStateAction<RightSidebarView>>,
): void {
  useEffect(() => {
    function focusChat(): void {
      setActiveView('chat');
    }
    window.addEventListener(OPEN_AGENT_CHAT_PANEL_EVENT, focusChat);
    window.addEventListener(FOCUS_AGENT_CHAT_EVENT, focusChat);
    return () => {
      window.removeEventListener(OPEN_AGENT_CHAT_PANEL_EVENT, focusChat);
      window.removeEventListener(FOCUS_AGENT_CHAT_EVENT, focusChat);
    };
  }, [setActiveView]);
}

/* ── Main Component ── */

export const RightSidebarTabs = memo(function RightSidebarTabs({
  chatContent,
  monitorContent,
  gitContent,
  analyticsContent,
  memoryContent,
  threads = [],
  activeThreadId = null,
  onSelectThread,
  onDeleteThread,
  onNewChat,
}: RightSidebarTabsProps): React.ReactElement {
  const [activeView, setActiveView] = useState<RightSidebarView>('chat');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);

  useAgentChatViewFocus(setActiveView);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  const handleCollapse = useCallback(() => {
    window.dispatchEvent(new CustomEvent('agent-ide:toggle-agent-monitor'));
  }, []);

  const handleToggleHistory = useCallback(() => {
    setHistoryOpen((prev) => !prev);
    setViewDropdownOpen(false);
  }, []);

  const handleToggleViewDropdown = useCallback(() => {
    setViewDropdownOpen((prev) => !prev);
    setHistoryOpen(false);
  }, []);

  const handleNewChat = useCallback(() => {
    onNewChat?.();
    setHistoryOpen(false);
  }, [onNewChat]);

  const handleSwitchView = useCallback((view: RightSidebarView) => {
    setActiveView(view);
    setHistoryOpen(false);
    setViewDropdownOpen(false);
  }, []);

  const handleBackToChat = useCallback(() => {
    setActiveView('chat');
  }, []);

  const viewContent: Record<RightSidebarView, React.ReactNode> = {
    chat: chatContent,
    monitor: monitorContent,
    git: gitContent,
    analytics: analyticsContent ?? null,
    memory: memoryContent ?? null,
  };

  const viewLabels: Record<RightSidebarView, string> = {
    chat: 'Chat',
    monitor: 'Monitor',
    git: 'Git Status',
    analytics: 'Analytics',
    memory: 'Memory',
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header — changes based on active view */}
      {activeView === 'chat' ? (
        <ChatPanelHeader
          activeThread={activeThread}
          threadCount={threads.length}
          historyOpen={historyOpen}
          onToggleHistory={handleToggleHistory}
          onNewChat={handleNewChat}
          onCollapse={handleCollapse}
          viewDropdownOpen={viewDropdownOpen}
          onToggleViewDropdown={handleToggleViewDropdown}
          activeView={activeView}
          onSwitchView={handleSwitchView}
        />
      ) : (
        <SecondaryViewHeader
          label={viewLabels[activeView]}
          onBackToChat={handleBackToChat}
          onCollapse={handleCollapse}
        />
      )}

      {/* Recent thread tabs — last 5 conversations with status indicators */}
      {activeView === 'chat' && (
        <RecentThreadTabs
          threads={threads}
          activeThreadId={activeThreadId}
          onSelect={(id) => onSelectThread?.(id)}
        />
      )}

      {/* Content area — relative container for history overlay */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {/* History panel overlay (only when chat is active) */}
        {activeView === 'chat' && historyOpen && (
          <ChatHistoryPanel
            threads={threads}
            activeThreadId={activeThreadId ?? null}
            onSelect={(id) => onSelectThread?.(id)}
            onDelete={(id) => onDeleteThread?.(id)}
            onClose={() => setHistoryOpen(false)}
          />
        )}

        {/* All views stay mounted to preserve state (e.g. streaming chat) */}
        {(['chat', 'monitor', 'git', 'analytics', 'memory'] as const).map((view) => (
          <div
            key={view}
            className="h-full overflow-hidden"
            style={{ display: activeView === view ? undefined : 'none' }}
          >
            {viewContent[view]}
          </div>
        ))}
      </div>
    </div>
  );
});
