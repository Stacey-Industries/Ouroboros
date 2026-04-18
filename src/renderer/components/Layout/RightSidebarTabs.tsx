/**
 * RightSidebarTabs.tsx — Chat-dominant right sidebar panel.
 *
 * Chat is the primary experience. Monitor, Git, and Analytics are accessible
 * via a settings/view dropdown in the header, not as competing tabs.
 *
 * Header layout:
 *   [History] [thread title] [+ New] [View Switcher]
 *
 * Sub-modules:
 *   RightSidebarTabs.icons.tsx  — SVG icons
 *   RightSidebarTabs.panels.tsx — ViewSwitcherDropdown, SecondaryViewHeader, RecentThreadTabs
 *   RightSidebarTabs.header.tsx — ChatPanelHeader
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import { useMobileLayout } from '../../contexts/MobileLayoutContext';
import {
  FOCUS_AGENT_CHAT_EVENT,
  OPEN_AGENT_CHAT_PANEL_EVENT,
} from '../../hooks/appEventNames';
import { useViewportBreakpoint } from '../../hooks/useViewportBreakpoint';
import type { AgentChatThreadRecord } from '../../types/electron';
import { ChatHistoryPanel } from '../AgentChat/ChatHistoryPanel';
import { isDraftThreadId } from '../AgentChat/useAgentChatDraftPersistence';
import { MobileBottomSheet } from './MobileBottomSheet';
import { ChatPanelHeader } from './RightSidebarTabs.header';
import { RecentThreadTabs, SecondaryViewHeader } from './RightSidebarTabs.panels';

export type RightSidebarView = 'chat' | 'monitor' | 'git' | 'analytics' | 'memory' | 'rules';

export interface RightSidebarTabsProps {
  chatContent: React.ReactNode;
  monitorContent: React.ReactNode;
  gitContent: React.ReactNode;
  analyticsContent?: React.ReactNode;
  memoryContent?: React.ReactNode;
  rulesContent?: React.ReactNode;
  threads?: AgentChatThreadRecord[];
  activeThreadId?: string | null;
  onSelectThread?: (threadId: string | null) => void;
  onDeleteThread?: (threadId: string) => void;
  onNewChat?: () => void;
}

// ── Draft tab tracking ────────────────────────────────────────────────────────

function useDraftTabs(activeThreadId: string | null, threads: AgentChatThreadRecord[]) {
  const [draftTabs, setDraftTabs] = useState<string[]>([]);
  const draftTabsRef = useRef(draftTabs);
  draftTabsRef.current = draftTabs;

  useEffect(() => {
    if (isDraftThreadId(activeThreadId) && activeThreadId !== null && !draftTabsRef.current.includes(activeThreadId)) {
      setDraftTabs((prev) => [...prev, activeThreadId]);
    }
  }, [activeThreadId]);

  const prevActiveIdRef = useRef(activeThreadId);
  const prevThreadIdsRef = useRef<Set<string>>(new Set(threads.map((t) => t.id)));
  useEffect(() => {
    const wasId = prevActiveIdRef.current;
    if (isDraftThreadId(wasId) && activeThreadId !== null && !isDraftThreadId(activeThreadId) && !prevThreadIdsRef.current.has(activeThreadId)) {
      setDraftTabs((prev) => prev.filter((id) => id !== wasId));
    }
    prevActiveIdRef.current = activeThreadId;
    prevThreadIdsRef.current = new Set(threads.map((t) => t.id));
  }, [activeThreadId, threads]);

  return { draftTabs, setDraftTabs };
}

// ── Focus hook ────────────────────────────────────────────────────────────────

function useAgentChatViewFocus(setActiveView: React.Dispatch<React.SetStateAction<RightSidebarView>>): void {
  useEffect(() => {
    function focusChat(): void { setActiveView('chat'); }
    window.addEventListener(OPEN_AGENT_CHAT_PANEL_EVENT, focusChat);
    window.addEventListener(FOCUS_AGENT_CHAT_EVENT, focusChat);
    return () => {
      window.removeEventListener(OPEN_AGENT_CHAT_PANEL_EVENT, focusChat);
      window.removeEventListener(FOCUS_AGENT_CHAT_EVENT, focusChat);
    };
  }, [setActiveView]);
}

// ── Tab close helper ──────────────────────────────────────────────────────────

interface ResolveNextThreadArgs {
  id: string; activeThreadId: string | null;
  threads: AgentChatThreadRecord[]; draftTabs: string[];
  dismissedTabs: Set<string>; onSelectThread: ((id: string | null) => void) | undefined;
}

function resolveNextThread({ id, activeThreadId, threads, draftTabs, dismissedTabs, onSelectThread }: ResolveNextThreadArgs): void {
  if (activeThreadId !== id) return;
  const remaining = threads.filter((t) => t.id !== id && !dismissedTabs.has(t.id));
  const remainingDrafts = isDraftThreadId(id) ? draftTabs.filter((d) => d !== id) : draftTabs;
  if (remainingDrafts.length > 0) { onSelectThread?.(remainingDrafts[remainingDrafts.length - 1]); }
  else if (remaining.length > 0) { onSelectThread?.(remaining[0].id); }
  else { onSelectThread?.(null); }
}

// ── RightSidebarTabs ──────────────────────────────────────────────────────────

const VIEW_LABELS: Record<RightSidebarView, string> = {
  chat: 'Chat', monitor: 'Monitor', git: 'Git Status', analytics: 'Analytics', memory: 'Memory', rules: 'Claude Config',
};

function useSidebarPanelState() {
  const [activeView, setActiveView] = useState<RightSidebarView>('chat');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const [dismissedTabs, setDismissedTabs] = useState<Set<string>>(new Set());
  const toggleHistory = useCallback(() => { setHistoryOpen((p) => !p); setViewDropdownOpen(false); }, []);
  const toggleViewDropdown = useCallback(() => { setViewDropdownOpen((p) => !p); setHistoryOpen(false); }, []);
  const switchView = useCallback((view: RightSidebarView) => { setActiveView(view); setHistoryOpen(false); setViewDropdownOpen(false); }, []);
  return { activeView, setActiveView, historyOpen, setHistoryOpen, viewDropdownOpen, dismissedTabs, setDismissedTabs, toggleHistory, toggleViewDropdown, switchView };
}

const ALL_VIEWS = ['chat', 'monitor', 'git', 'analytics', 'memory', 'rules'] as const;

function SidebarContentArea({ activeView, historyOpen, viewContent, threads, activeThreadId, setHistoryOpen, onSelectThread, onDeleteThread }: {
  activeView: RightSidebarView; historyOpen: boolean;
  viewContent: Record<RightSidebarView, React.ReactNode>;
  threads: AgentChatThreadRecord[]; activeThreadId: string | null;
  setHistoryOpen: (v: boolean) => void;
  onSelectThread?: (id: string | null) => void; onDeleteThread?: (id: string) => void;
}): React.ReactElement {
  return (
    <div className="flex-1 min-h-0 overflow-hidden relative">
      {activeView === 'chat' && historyOpen && (
        <ChatHistoryPanel threads={threads} activeThreadId={activeThreadId ?? null}
          onSelect={(id) => onSelectThread?.(id)} onDelete={(id) => onDeleteThread?.(id)}
          onClose={() => setHistoryOpen(false)} />
      )}
      {ALL_VIEWS.map((view) => (
        <div key={view} className="h-full overflow-hidden" style={{ display: activeView === view ? undefined : 'none' }}>
          {viewContent[view]}
        </div>
      ))}
    </div>
  );
}

// ── Sidebar handlers hook ─────────────────────────────────────────────────────

interface SidebarHandlersArgs {
  onNewChat?: () => void;
  setHistoryOpen: (v: boolean) => void;
  setActiveView: React.Dispatch<React.SetStateAction<RightSidebarView>>;
  activeThreadId: string | null;
  threads: AgentChatThreadRecord[];
  draftTabs: string[];
  dismissedTabs: Set<string>;
  onSelectThread?: (id: string | null) => void;
  setDraftTabs: React.Dispatch<React.SetStateAction<string[]>>;
  setDismissedTabs: React.Dispatch<React.SetStateAction<Set<string>>>;
}

function useSidebarHandlers(args: SidebarHandlersArgs) {
  const { onNewChat, setHistoryOpen, setActiveView, activeThreadId, threads, draftTabs, dismissedTabs, onSelectThread, setDraftTabs, setDismissedTabs } = args;
  const handleNewChat = useCallback(() => { onNewChat?.(); setHistoryOpen(false); }, [onNewChat, setHistoryOpen]);
  const handleBackToChat = useCallback(() => { setActiveView('chat'); }, [setActiveView]);
  const handleCloseTab = useCallback((id: string) => {
    if (isDraftThreadId(id)) { setDraftTabs((prev) => prev.filter((d) => d !== id)); }
    else { setDismissedTabs((prev) => new Set(prev).add(id)); }
    resolveNextThread({ id, activeThreadId, threads, draftTabs, dismissedTabs, onSelectThread });
  }, [activeThreadId, threads, draftTabs, dismissedTabs, onSelectThread, setDraftTabs, setDismissedTabs]);
  return { handleNewChat, handleBackToChat, handleCloseTab };
}

// ── Phone bottom sheet for secondary views ────────────────────────────────────

const SHEET_VIEW_LABELS: Record<string, string> = {
  monitor: 'Monitor', git: 'Git Status', analytics: 'Analytics',
  memory: 'Memory', rules: 'Claude Config',
};

function MobileSecondarySheet({ viewContent }: { viewContent: Record<RightSidebarView, React.ReactNode> }): React.ReactElement | null {
  const { isSheetOpen, activeSheetView, closeSheet } = useMobileLayout();
  const view = (activeSheetView ?? 'monitor') as RightSidebarView;
  const label = SHEET_VIEW_LABELS[view] ?? 'Views';
  return (
    <MobileBottomSheet isOpen={isSheetOpen} onClose={closeSheet} ariaLabel={label}>
      {viewContent[view]}
    </MobileBottomSheet>
  );
}

export const RightSidebarTabs = memo(function RightSidebarTabs({
  chatContent, monitorContent, gitContent, analyticsContent, memoryContent, rulesContent,
  threads = [], activeThreadId = null, onSelectThread, onDeleteThread, onNewChat,
}: RightSidebarTabsProps): React.ReactElement {
  const { activeView, setActiveView, historyOpen, setHistoryOpen, viewDropdownOpen, dismissedTabs, setDismissedTabs, toggleHistory, toggleViewDropdown, switchView } = useSidebarPanelState();
  const { draftTabs, setDraftTabs } = useDraftTabs(activeThreadId, threads);
  const { handleNewChat, handleBackToChat, handleCloseTab } = useSidebarHandlers({
    onNewChat, setHistoryOpen, setActiveView, activeThreadId, threads,
    draftTabs, dismissedTabs, onSelectThread, setDraftTabs, setDismissedTabs,
  });
  const isPhone = useViewportBreakpoint() === 'phone';
  useAgentChatViewFocus(setActiveView);

  const viewContent: Record<RightSidebarView, React.ReactNode> = {
    chat: chatContent, monitor: monitorContent, git: gitContent,
    analytics: analyticsContent ?? null, memory: memoryContent ?? null,
    rules: rulesContent ?? null,
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {activeView === 'chat' ? (
        <ChatPanelHeader activeThread={threads.find((t) => t.id === activeThreadId) ?? null}
          threadCount={threads.length} historyOpen={historyOpen} onToggleHistory={toggleHistory}
          onNewChat={handleNewChat} viewDropdownOpen={viewDropdownOpen}
          onToggleViewDropdown={toggleViewDropdown} activeView={activeView} onSwitchView={switchView} />
      ) : (
        <SecondaryViewHeader label={VIEW_LABELS[activeView]} onBackToChat={handleBackToChat} />
      )}
      {activeView === 'chat' && (
        <RecentThreadTabs threads={threads.filter((t) => !dismissedTabs.has(t.id))}
          activeThreadId={activeThreadId} onSelect={(id) => onSelectThread?.(id)}
          onClose={handleCloseTab} draftTabs={draftTabs} />
      )}
      <SidebarContentArea activeView={activeView} historyOpen={historyOpen} viewContent={viewContent}
        threads={threads} activeThreadId={activeThreadId} setHistoryOpen={setHistoryOpen}
        onSelectThread={onSelectThread} onDeleteThread={onDeleteThread} />
      {isPhone && <MobileSecondarySheet viewContent={viewContent} />}
    </div>
  );
});
