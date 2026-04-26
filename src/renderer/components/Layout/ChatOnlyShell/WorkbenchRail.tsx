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
  canCompareSession?: (item: WorkbenchSessionItem) => boolean;
  compareSessionId?: string | null;
  onCompareSession?: (sessionId: string) => void;
  onCreateSession?: () => void;
  onLaunchAgent?: () => void;
  onSelectRecentChat?: (threadId: string) => void;
  onSelectSession?: (sessionId: string) => void;
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

const RAIL_BTN_CLASS =
  'rounded border border-stroke-default bg-surface-panel px-2 py-1 text-xs text-text-semantic-secondary transition-colors hover:bg-surface-hover hover:text-text-semantic-primary';

interface RailHeaderActionsProps {
  onCreateSession?: () => void;
  onLaunchAgent?: () => void;
}

function RailHeaderActions({
  onCreateSession,
  onLaunchAgent,
}: RailHeaderActionsProps): React.ReactElement | null {
  if (!onCreateSession && !onLaunchAgent) return null;
  return (
    <div className="flex shrink-0 items-center gap-1">
      {onCreateSession && (
        <button type="button" className={RAIL_BTN_CLASS} onClick={onCreateSession}>
          New session
        </button>
      )}
      {onLaunchAgent && (
        <button type="button" className={RAIL_BTN_CLASS} onClick={onLaunchAgent}>
          Launch agent
        </button>
      )}
    </div>
  );
}

interface RailHeaderProps {
  chatCount: number;
  onCreateSession?: () => void;
  onLaunchAgent?: () => void;
  sessionCount: number;
  title: string;
}

function RailHeader({
  chatCount,
  onCreateSession,
  onLaunchAgent,
  sessionCount,
  title,
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
      <RailHeaderActions onCreateSession={onCreateSession} onLaunchAgent={onLaunchAgent} />
    </div>
  );
}

interface RailBodyProps {
  canCompareSession?: (item: WorkbenchSessionItem) => boolean;
  compareSessionId?: string | null;
  onCompareSession?: (sessionId: string) => void;
  onSelectRecentChat?: (threadId: string) => void;
  onSelectSession: (sessionId: string) => void;
  recentChats: UseWorkbenchRecentChatsResult['items'];
  sessionState: UseWorkbenchSessionsResult;
}

function RailBody({
  canCompareSession,
  compareSessionId,
  onCompareSession,
  onSelectRecentChat,
  onSelectSession,
  recentChats,
  sessionState,
}: RailBodyProps): React.ReactElement {
  const total = sessionState.activeItems.length + sessionState.backgroundItems.length;
  if (total === 0 && recentChats.length === 0)
    return <EmptyState isLoading={sessionState.isLoading} />;
  return (
    <WorkbenchRailSections
      activeSessions={sessionState.activeItems}
      backgroundSessions={sessionState.backgroundItems}
      canCompareSession={canCompareSession}
      compareSessionId={compareSessionId}
      onCompareSession={onCompareSession}
      onSelectRecentChat={onSelectRecentChat}
      onSelectSession={onSelectSession}
      recentChats={recentChats}
    />
  );
}

interface RailStateResult {
  handleSelectSession: (sessionId: string) => void;
  recentChats: UseWorkbenchRecentChatsResult['items'];
  sessionState: UseWorkbenchSessionsResult;
  totalSessionCount: number;
}

type RailOptions = UseWorkbenchSessionsOptions &
  Omit<UseWorkbenchRecentChatsOptions, 'sessions' | 'attentionByThreadId'>;

function useRailState(
  options: RailOptions,
  approvalRequests: ApprovalRequest[] | undefined,
  onSelectSession: ((id: string) => void) | undefined,
): RailStateResult {
  const approvalState = useApprovalContext();
  const resolvedApprovals = approvalRequests ?? approvalState.requests;
  const attention = useWorkbenchAttention({
    activeSessionId: options.activeSessionId,
    activeThreadId: options.activeThreadId,
    approvalRequests: resolvedApprovals,
    sessions: options.sessions,
    threads: options.threads,
  });
  const sessionState = useWorkbenchSessions({
    ...options,
    attentionBySessionId: attention.sessionAttentionById,
  });
  const recentChatsState = useWorkbenchRecentChats({
    ...options,
    attentionByThreadId: attention.chatAttentionById,
    sessions: sessionState.items.map((item) => item.rawSession),
  });
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (onSelectSession) {
        onSelectSession(sessionId);
        return;
      }
      window.dispatchEvent(new CustomEvent(SESSION_SWITCH_EVENT, { detail: { sessionId } }));
    },
    [onSelectSession],
  );
  return {
    handleSelectSession,
    recentChats: recentChatsState.items,
    sessionState,
    totalSessionCount: sessionState.activeItems.length + sessionState.backgroundItems.length,
  };
}

interface RailViewProps extends RailStateResult {
  canCompareSession?: (item: WorkbenchSessionItem) => boolean;
  compareSessionId?: string | null;
  onCompareSession?: (sessionId: string) => void;
  onCreateSession?: () => void;
  onLaunchAgent?: () => void;
  onSelectRecentChat?: (threadId: string) => void;
  title: string;
}

function RailView({
  canCompareSession,
  compareSessionId,
  handleSelectSession,
  onCompareSession,
  onCreateSession,
  onLaunchAgent,
  onSelectRecentChat,
  recentChats,
  sessionState,
  title,
  totalSessionCount,
}: RailViewProps): React.ReactElement {
  return (
    <aside
      className="flex h-full w-[220px] shrink-0 flex-col overflow-hidden border-r border-stroke-default bg-surface-panel/95"
      data-testid="workbench-rail"
    >
      <RailHeader
        chatCount={recentChats.length}
        onCreateSession={onCreateSession}
        onLaunchAgent={onLaunchAgent}
        sessionCount={totalSessionCount}
        title={title}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <RailBody
          canCompareSession={canCompareSession}
          compareSessionId={compareSessionId}
          onCompareSession={onCompareSession}
          onSelectRecentChat={onSelectRecentChat}
          onSelectSession={handleSelectSession}
          recentChats={recentChats}
          sessionState={sessionState}
        />
      </div>
    </aside>
  );
}

export function WorkbenchRail({
  approvalRequests,
  canCompareSession,
  compareSessionId,
  onCompareSession,
  onCreateSession,
  onLaunchAgent,
  onSelectRecentChat,
  onSelectSession,
  title = 'Workbench',
  ...options
}: WorkbenchRailProps): React.ReactElement {
  const state = useRailState(options, approvalRequests, onSelectSession);
  return (
    <RailView
      {...state}
      canCompareSession={canCompareSession}
      compareSessionId={compareSessionId}
      onCompareSession={onCompareSession}
      onCreateSession={onCreateSession}
      onLaunchAgent={onLaunchAgent}
      onSelectRecentChat={onSelectRecentChat}
      title={title}
    />
  );
}
