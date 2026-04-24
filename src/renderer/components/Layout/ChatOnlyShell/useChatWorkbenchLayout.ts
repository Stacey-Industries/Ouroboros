import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'agent-ide:chat-workbench-layout';

export type ChatWorkbenchUtilityTab = 'activity' | 'review' | 'approvals' | 'subagents';

export interface ChatWorkbenchLayoutState {
  railOpen: boolean;
  artifactOpen: boolean;
  utilityOpen: boolean;
  activeUtilityTab: ChatWorkbenchUtilityTab;
}

export interface ChatWorkbenchLayoutApi extends ChatWorkbenchLayoutState {
  toggleRail: () => void;
  setRailOpen: (open: boolean) => void;
  toggleArtifact: () => void;
  setArtifactOpen: (open: boolean) => void;
  toggleUtility: () => void;
  setUtilityOpen: (open: boolean) => void;
  setActiveUtilityTab: (tab: ChatWorkbenchUtilityTab) => void;
}

const DEFAULT_STATE: ChatWorkbenchLayoutState = {
  railOpen: false,
  artifactOpen: false,
  utilityOpen: false,
  activeUtilityTab: 'activity',
};

function isUtilityTab(value: unknown): value is ChatWorkbenchUtilityTab {
  return (
    value === 'activity' || value === 'review' || value === 'approvals' || value === 'subagents'
  );
}

function readPersisted(): ChatWorkbenchLayoutState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<ChatWorkbenchLayoutState>;
    return {
      railOpen: Boolean(parsed.railOpen),
      artifactOpen: Boolean(parsed.artifactOpen),
      utilityOpen: Boolean(parsed.utilityOpen),
      activeUtilityTab: isUtilityTab(parsed.activeUtilityTab)
        ? parsed.activeUtilityTab
        : DEFAULT_STATE.activeUtilityTab,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function persist(state: ChatWorkbenchLayoutState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors for non-critical UI state.
  }
}

export function useChatWorkbenchLayout(): ChatWorkbenchLayoutApi {
  const [state, setState] = useState<ChatWorkbenchLayoutState>(() => readPersisted());

  useEffect(() => {
    persist(state);
  }, [state]);

  const toggleRail = useCallback(() => {
    setState((prev) => ({ ...prev, railOpen: !prev.railOpen }));
  }, []);
  const setRailOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, railOpen: open }));
  }, []);
  const toggleArtifact = useCallback(() => {
    setState((prev) => ({ ...prev, artifactOpen: !prev.artifactOpen }));
  }, []);
  const setArtifactOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, artifactOpen: open }));
  }, []);
  const toggleUtility = useCallback(() => {
    setState((prev) => ({ ...prev, utilityOpen: !prev.utilityOpen }));
  }, []);
  const setUtilityOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, utilityOpen: open }));
  }, []);
  const setActiveUtilityTab = useCallback((tab: ChatWorkbenchUtilityTab) => {
    setState((prev) => ({ ...prev, activeUtilityTab: tab }));
  }, []);

  return {
    ...state,
    toggleRail,
    setRailOpen,
    toggleArtifact,
    setArtifactOpen,
    toggleUtility,
    setUtilityOpen,
    setActiveUtilityTab,
  };
}
