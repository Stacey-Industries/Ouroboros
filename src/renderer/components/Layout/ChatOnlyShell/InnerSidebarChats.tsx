/**
 * InnerSidebarChats — Chats tab content for the inner sidebar (Wave 59 Phase D).
 *
 * Mirrors WorkbenchRail's session+chat list pattern but renders without a
 * surrounding aside / header — the InnerSidebar shell owns those. Keeps the
 * "+ New session" affordance at the top per the Phase D spec.
 */

import React, { useCallback } from 'react';

import { SESSION_SWITCH_EVENT } from '../../../hooks/appEventNames';
import type {
  AgentChatThreadRecord,
  ApprovalRequest,
  SessionRecord,
} from '../../../types/electron';
import { useWorkbenchAttention } from './useWorkbenchAttention';
import { useWorkbenchRailActions } from './useWorkbenchRailActions';
import {
  useWorkbenchRecentChats,
  type UseWorkbenchRecentChatsResult,
} from './useWorkbenchRecentChats';
import {
  useWorkbenchSessions,
  type UseWorkbenchSessionsResult,
  type WorkbenchSessionItem,
} from './useWorkbenchSessions';
import {
  useRowContextMenu,
  WorkbenchRailContextMenu,
  type WorkbenchRowItem,
} from './WorkbenchRailContextMenu';
import { WorkbenchRailSections } from './WorkbenchRailSections';

export interface InnerSidebarChatsProps {
  activeSessionId: string | null;
  activeThreadId?: string | null;
  approvalRequests: ApprovalRequest[];
  canCompareSession?: (item: WorkbenchSessionItem) => boolean;
  compareSessionId?: string | null;
  onCompareSession?: (sessionId: string) => void;
  onCreateSession?: () => void;
  onSelectRecentChat?: (threadId: string) => void;
  onSelectSession?: (sessionId: string) => void;
  sessions: SessionRecord[];
  threads: AgentChatThreadRecord[];
}

function NewSessionRow({ onCreate }: { onCreate?: () => void }): React.ReactElement | null {
  if (!onCreate) return null;
  return (
    <div className="shrink-0 border-b border-border-semantic px-3 py-2">
      <button
        type="button"
        onClick={onCreate}
        data-testid="inner-chats-new-session"
        className="w-full rounded border border-border-semantic bg-surface-panel px-2 py-1 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
      >
        + New session
      </button>
    </div>
  );
}

function EmptyChats({ isLoading }: { isLoading: boolean }): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center p-4 text-center">
      <p className="text-xs text-text-semantic-faint">
        {isLoading ? 'Loading…' : 'No chats yet.'}
      </p>
    </div>
  );
}

interface ChatsState {
  sessionState: UseWorkbenchSessionsResult;
  recentChats: UseWorkbenchRecentChatsResult['items'];
}

function useChatsState(props: InnerSidebarChatsProps): ChatsState {
  const attention = useWorkbenchAttention({
    activeSessionId: props.activeSessionId,
    activeThreadId: props.activeThreadId ?? null,
    approvalRequests: props.approvalRequests,
    sessions: props.sessions,
    threads: props.threads,
  });
  const sessionState = useWorkbenchSessions({
    activeSessionId: props.activeSessionId,
    activeThreadId: props.activeThreadId ?? null,
    attentionBySessionId: attention.sessionAttentionById,
    sessions: props.sessions,
    threads: props.threads,
  });
  const recentChatsState = useWorkbenchRecentChats({
    activeThreadId: props.activeThreadId ?? null,
    attentionByThreadId: attention.chatAttentionById,
    sessions: sessionState.items.map((i) => i.rawSession),
    threads: props.threads,
  });
  return { sessionState, recentChats: recentChatsState.items };
}

function useSessionSelectHandler(
  onSelectSession: ((id: string) => void) | undefined,
): (sessionId: string) => void {
  return useCallback(
    (sessionId: string) => {
      if (onSelectSession) {
        onSelectSession(sessionId);
        return;
      }
      window.dispatchEvent(new CustomEvent(SESSION_SWITCH_EVENT, { detail: { sessionId } }));
    },
    [onSelectSession],
  );
}

interface ChatsBodyProps {
  canCompareSession?: (item: WorkbenchSessionItem) => boolean;
  compareSessionId?: string | null;
  onCompareSession?: (sessionId: string) => void;
  onContextMenu: (item: WorkbenchRowItem, e: React.MouseEvent) => void;
  onSelectRecentChat?: (threadId: string) => void;
  onSelectSession: (id: string) => void;
  recentChats: UseWorkbenchRecentChatsResult['items'];
  sessionState: UseWorkbenchSessionsResult;
}

function ChatsBody(p: ChatsBodyProps): React.ReactElement {
  const total = p.sessionState.activeItems.length + p.sessionState.backgroundItems.length;
  if (total === 0 && p.recentChats.length === 0) {
    return <EmptyChats isLoading={p.sessionState.isLoading} />;
  }
  return (
    <WorkbenchRailSections
      activeSessions={p.sessionState.activeItems}
      backgroundSessions={p.sessionState.backgroundItems}
      canCompareSession={p.canCompareSession}
      compareSessionId={p.compareSessionId}
      onCompareSession={p.onCompareSession}
      onContextMenu={p.onContextMenu}
      onSelectRecentChat={p.onSelectRecentChat}
      onSelectSession={p.onSelectSession}
      recentChats={p.recentChats}
    />
  );
}

export function InnerSidebarChats(props: InnerSidebarChatsProps): React.ReactElement {
  const { sessionState, recentChats } = useChatsState(props);
  const handleSelectSession = useSessionSelectHandler(props.onSelectSession);
  const { actions } = useWorkbenchRailActions();
  const { menuState, openMenu, closeMenu } = useRowContextMenu();
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="inner-sidebar-chats"
    >
      <NewSessionRow onCreate={props.onCreateSession} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <ChatsBody
          canCompareSession={props.canCompareSession}
          compareSessionId={props.compareSessionId}
          onCompareSession={props.onCompareSession}
          onContextMenu={openMenu}
          onSelectRecentChat={props.onSelectRecentChat}
          onSelectSession={handleSelectSession}
          recentChats={recentChats}
          sessionState={sessionState}
        />
      </div>
      {menuState && (
        <WorkbenchRailContextMenu state={menuState} actions={actions} onClose={closeMenu} />
      )}
    </div>
  );
}
