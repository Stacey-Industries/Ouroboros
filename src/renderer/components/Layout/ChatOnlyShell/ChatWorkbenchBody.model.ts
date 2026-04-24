import React from 'react';

import { useApprovalContext } from '../../../contexts/ApprovalContext';
import type { UseTerminalSessionsReturn } from '../../../hooks/useTerminalSessions';
import type { AgentChatThreadRecord, ApprovalRequest } from '../../../types/electron';
import { useAgentChatStoreContext } from '../../AgentChat/agentChatStore';
import { useDiffReview } from '../../DiffReview/DiffReviewManager';
import { createStoredSessionFromPicker } from '../../SessionSidebar/NewSessionButton';
import { useSessions } from '../../SessionSidebar/useSessions';
import { useChatWorkbenchLayout } from './useChatWorkbenchLayout';
import { useTerminalDockState } from './useTerminalDockState';
import { useWorkbenchArtifacts } from './useWorkbenchArtifacts';
import { useWorkbenchCompare } from './useWorkbenchCompare';
import { useWorkbenchSessionActivation } from './useWorkbenchSessionActivation';
import { useWorkbenchSessions } from './useWorkbenchSessions';
import { useWorkbenchSurfacePolicy } from './useWorkbenchSurfacePolicy';

export type LayoutState = ReturnType<typeof useChatWorkbenchLayout>;
export type DockState = ReturnType<typeof useTerminalDockState>;
export type SessionsState = ReturnType<typeof useSessions>;
export type CompareState = ReturnType<typeof useWorkbenchCompare>;
export type ActivationState = ReturnType<typeof useWorkbenchSessionActivation>;
export type SurfacePolicyState = ReturnType<typeof useWorkbenchSurfacePolicy>;

export interface WorkbenchContextState {
  activation: ActivationState;
  approvalRequests: ApprovalRequest[];
  compare: CompareState;
  dock: DockState;
  hasTerminal: boolean;
  layout: LayoutState;
  sessionsState: SessionsState;
  surfacePolicy: SurfacePolicyState;
  threads: AgentChatThreadRecord[];
}

export interface WorkbenchHandlers {
  handleCreateSession: () => Promise<void>;
  handleSelectRecentChat: (threadId: string) => void;
  handleSelectSession: (sessionId: string) => void;
}

function useWorkbenchListState(
  sessionsState: SessionsState,
  threads: AgentChatThreadRecord[],
): ReturnType<typeof useWorkbenchSessions> {
  return useWorkbenchSessions({
    sessions: sessionsState.sessions,
    activeSessionId: sessionsState.activeSessionId,
    threads,
  });
}

function useWorkbenchSurfaceState(
  layout: LayoutState,
  artifacts: ReturnType<typeof useWorkbenchArtifacts>,
  diffReviewState: ReturnType<typeof useDiffReview>['state'],
): SurfacePolicyState {
  return useWorkbenchSurfacePolicy({
    approvalCount: 0,
    diffKey: diffReviewState
      ? `${diffReviewState.sessionId}:${diffReviewState.snapshotHash}`
      : null,
    artifactKey: artifacts.activeKey,
    artifactKind: artifacts.kind,
    setArtifactOpen: layout.setArtifactOpen,
    setUtilityOpen: layout.setUtilityOpen,
    setActiveUtilityTab: layout.setActiveUtilityTab,
  });
}

export function useWorkbenchContextState(
  terminal?: UseTerminalSessionsReturn,
): WorkbenchContextState {
  const layout = useChatWorkbenchLayout();
  const dock = useTerminalDockState();
  const artifacts = useWorkbenchArtifacts();
  const { requests: approvalRequests } = useApprovalContext();
  const { state: diffReviewState } = useDiffReview();
  const threads = useAgentChatStoreContext((state) => state.threads);
  const selectThread = useAgentChatStoreContext((state) => state.onSelectThread);
  const sessionsState = useSessions();
  const workbenchSessions = useWorkbenchListState(sessionsState, threads);
  const compare = useWorkbenchCompare({ items: workbenchSessions.items });
  const activation = useWorkbenchSessionActivation({
    sessions: sessionsState.sessions,
    threads,
    refreshSessions: sessionsState.refresh,
    actions: { selectThread },
  });
  const surfacePolicy = useWorkbenchSurfaceState(layout, artifacts, diffReviewState);

  return {
    activation,
    approvalRequests,
    compare,
    dock,
    hasTerminal: Boolean(terminal),
    layout,
    sessionsState,
    surfacePolicy,
    threads,
  };
}

export function useWorkbenchHandlers(
  activation: ActivationState,
  selectThread: (threadId: string) => void,
): WorkbenchHandlers {
  const handleCreateSession = React.useCallback(async (): Promise<void> => {
    const session = await createStoredSessionFromPicker();
    if (!session) return;
    await activation.activateSession(session.id);
  }, [activation]);
  const handleSelectSession = React.useCallback(
    (sessionId: string) => {
      void activation.activateSession(sessionId);
    },
    [activation],
  );
  const handleSelectRecentChat = React.useCallback(
    (threadId: string) => {
      selectThread(threadId);
    },
    [selectThread],
  );

  return { handleCreateSession, handleSelectRecentChat, handleSelectSession };
}

export function useActiveApprovalSessionIds(
  activeSessionId: string | null,
): Array<string | null | undefined> {
  const activeThread = useAgentChatStoreContext((state) => state.activeThread);
  return [
    activeSessionId,
    activeThread?.latestOrchestration?.sessionId,
    activeThread?.latestOrchestration?.claudeSessionId,
    activeThread?.latestOrchestration?.codexThreadId,
  ];
}
