import React, { useCallback } from 'react';

import { useApprovalContext } from '../../../contexts/ApprovalContext';
import { SESSION_SWITCH_EVENT } from '../../../hooks/appEventNames';
import type { ApprovalRequest } from '../../../types/electron';
import { useWorkbenchAttention } from './useWorkbenchAttention';
import {
  useWorkbenchRecentChats,
  type UseWorkbenchRecentChatsOptions,
  type UseWorkbenchRecentChatsResult,
} from './useWorkbenchRecentChats';
import {
  useWorkbenchSessions,
  type UseWorkbenchSessionsOptions,
  type UseWorkbenchSessionsResult,
  type WorkbenchSessionItem,
} from './useWorkbenchSessions';
import { WorkbenchRailSections } from './WorkbenchRailSections';

export interface WorkbenchRailProps
  extends
    UseWorkbenchSessionsOptions,
    Omit<UseWorkbenchRecentChatsOptions, 'sessions' | 'attentionByThreadId'> {
  approvalRequests?: ApprovalRequest[];
  onSelectSession?: (sessionId: string) => void;
  onSelectRecentChat?: (threadId: string) => void;
  onCreateSession?: () => void;
  onCompareSession?: (sessionId: string) => void;
  canCompareSession?: (item: WorkbenchSessionItem) => boolean;
  compareSessionId?: string | null;
  title?: string;
}

function EmptyState({ isLoading }: { isLoading: boolean }): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
      <p className="text-sm text-text-semantic-muted">
        {isLoading ? 'Loading workbench…' : 'No workbench activity yet.'}
      </p>
      {!isLoading && (
        <p className="mt-1 text-xs text-text-semantic-faint">
          Active sessions and recent chats will appear here.
        </p>
      )}
    </div>
  );
}

function countLabel(sessionCount: number, chatCount: number): string {
  const sessionLabel = `${sessionCount} session${sessionCount === 1 ? '' : 's'}`;
  if (chatCount === 0) return sessionLabel;
  return `${sessionLabel} · ${chatCount} chat${chatCount === 1 ? '' : 's'}`;
}

interface RailHeaderProps {
  title: string;
  sessionCount: number;
  chatCount: number;
  onCreateSession?: () => void;
}

function RailHeader({
  title,
  sessionCount,
  chatCount,
  onCreateSession,
}: RailHeaderProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-stroke-default px-3 py-3">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-semantic-tertiary">
          {title}
        </div>
        <p className="mt-1 text-xs text-text-semantic-secondary">
          {countLabel(sessionCount, chatCount)}
        </p>
      </div>
      {onCreateSession && (
        <button
          type="button"
          className="rounded border border-stroke-default bg-surface-panel px-2 py-1 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary"
          onClick={onCreateSession}
        >
          New
        </button>
      )}
    </div>
  );
}

interface RailBodyProps {
  sessionState: UseWorkbenchSessionsResult;
  recentChats: UseWorkbenchRecentChatsResult['items'];
  onSelectSession: (sessionId: string) => void;
  onSelectRecentChat?: (threadId: string) => void;
  onCompareSession?: (sessionId: string) => void;
  canCompareSession?: (item: import('./useWorkbenchSessions').WorkbenchSessionItem) => boolean;
  compareSessionId?: string | null;
}

function RailBody({
  sessionState,
  recentChats,
  onSelectSession,
  onSelectRecentChat,
  onCompareSession,
  canCompareSession,
  compareSessionId,
}: RailBodyProps): React.ReactElement {
  const totalSessionCount = sessionState.activeItems.length + sessionState.backgroundItems.length;
  if (totalSessionCount === 0 && recentChats.length === 0)
    return <EmptyState isLoading={sessionState.isLoading} />;
  return (
    <WorkbenchRailSections
      activeSessions={sessionState.activeItems}
      backgroundSessions={sessionState.backgroundItems}
      recentChats={recentChats}
      onSelectSession={onSelectSession}
      onSelectRecentChat={onSelectRecentChat}
      onCompareSession={onCompareSession}
      canCompareSession={canCompareSession}
      compareSessionId={compareSessionId}
    />
  );
}

interface RailStateResult {
  sessionState: UseWorkbenchSessionsResult;
  recentChats: UseWorkbenchRecentChatsResult['items'];
  totalSessionCount: number;
  handleSelectSession: (sessionId: string) => void;
}

type RailOptions = UseWorkbenchSessionsOptions & Omit<UseWorkbenchRecentChatsOptions, 'sessions' | 'attentionByThreadId'>;

function useRailState(options: RailOptions, approvalRequests: ApprovalRequest[] | undefined, onSelectSession: ((id: string) => void) | undefined): RailStateResult {
  const approvalState = useApprovalContext();
  const resolvedApprovals = approvalRequests ?? approvalState.requests;
  const attention = useWorkbenchAttention({
    sessions: options.sessions,
    threads: options.threads,
    activeSessionId: options.activeSessionId,
    activeThreadId: options.activeThreadId,
    approvalRequests: resolvedApprovals,
  });
  const sessionState = useWorkbenchSessions({ ...options, attentionBySessionId: attention.sessionAttentionById });
  const recentChatsState = useWorkbenchRecentChats({
    ...options,
    sessions: sessionState.items.map((item) => item.rawSession),
    attentionByThreadId: attention.chatAttentionById,
  });
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (onSelectSession) { onSelectSession(sessionId); return; }
      window.dispatchEvent(new CustomEvent(SESSION_SWITCH_EVENT, { detail: { sessionId } }));
    },
    [onSelectSession],
  );
  return {
    sessionState,
    recentChats: recentChatsState.items,
    totalSessionCount: sessionState.activeItems.length + sessionState.backgroundItems.length,
    handleSelectSession,
  };
}

export function WorkbenchRail({ onSelectSession, onSelectRecentChat, onCreateSession, onCompareSession, canCompareSession, compareSessionId, title = 'Workbench', approvalRequests, ...options }: WorkbenchRailProps): React.ReactElement {
  const { sessionState, recentChats, totalSessionCount, handleSelectSession } = useRailState(options, approvalRequests, onSelectSession);
  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col overflow-hidden border-r border-stroke-default bg-surface-panel/95" data-testid="workbench-rail">
      <RailHeader title={title} sessionCount={totalSessionCount} chatCount={recentChats.length} onCreateSession={onCreateSession} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <RailBody sessionState={sessionState} recentChats={recentChats} onSelectSession={handleSelectSession}
          onSelectRecentChat={onSelectRecentChat} onCompareSession={onCompareSession}
          canCompareSession={canCompareSession} compareSessionId={compareSessionId}
        />
      </div>
    </aside>
  );
}
