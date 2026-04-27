import { useCallback, useEffect, useState } from 'react';

import type { InnerSidebarTab } from './InnerSidebar';

const STORAGE_KEY = 'agent-ide:chat-workbench-layout';

export type ChatWorkbenchUtilityTab = 'activity' | 'review' | 'approvals' | 'rules' | 'subagents';

// ── Per-project state ─────────────────────────────────────────────────────────

export interface ProjectRailState {
  activeInnerTab: InnerSidebarTab;
}

const DEFAULT_PROJECT_STATE: ProjectRailState = { activeInnerTab: 'chats' };

function isInnerTab(v: unknown): v is InnerSidebarTab {
  return v === 'chats' || v === 'terminals' || v === 'code';
}

function parseProjectStates(raw: unknown): Record<string, ProjectRailState> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, ProjectRailState> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>;
      result[key] = { activeInnerTab: isInnerTab(v.activeInnerTab) ? v.activeInnerTab : 'chats' };
    }
  }
  return result;
}

// ── Top-level layout state ─────────────────────────────────────────────────────

export interface ChatWorkbenchLayoutState {
  railOpen: boolean;
  artifactOpen: boolean;
  utilityOpen: boolean;
  activeUtilityTab: ChatWorkbenchUtilityTab;
  activeProject: string | null;
  projectStates: Record<string, ProjectRailState>;
}

export interface ChatWorkbenchLayoutApi extends ChatWorkbenchLayoutState {
  toggleRail: () => void;
  setRailOpen: (open: boolean) => void;
  toggleArtifact: () => void;
  setArtifactOpen: (open: boolean) => void;
  toggleUtility: () => void;
  setUtilityOpen: (open: boolean) => void;
  setActiveUtilityTab: (tab: ChatWorkbenchUtilityTab) => void;
  setActiveProject: (projectPath: string) => void;
  setActiveInnerTab: (projectPath: string, tab: InnerSidebarTab) => void;
  getProjectState: (projectPath: string) => ProjectRailState;
}

const DEFAULT_STATE: ChatWorkbenchLayoutState = {
  railOpen: true,
  artifactOpen: false,
  utilityOpen: false,
  activeUtilityTab: 'activity',
  activeProject: null,
  projectStates: {},
};

// ── Persistence ────────────────────────────────────────────────────────────────

function isUtilityTab(value: unknown): value is ChatWorkbenchUtilityTab {
  return (
    value === 'activity' ||
    value === 'review' ||
    value === 'approvals' ||
    value === 'rules' ||
    value === 'subagents'
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
      activeProject: typeof parsed.activeProject === 'string' ? parsed.activeProject : null,
      projectStates: parseProjectStates(parsed.projectStates),
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

// ── Callback builders ─────────────────────────────────────────────────────────

type Setter = React.Dispatch<React.SetStateAction<ChatWorkbenchLayoutState>>;

function buildCallbacks(setState: Setter) {
  return {
    toggleRail: () => setState((p) => ({ ...p, railOpen: !p.railOpen })),
    setRailOpen: (open: boolean) => setState((p) => ({ ...p, railOpen: open })),
    toggleArtifact: () => setState((p) => ({ ...p, artifactOpen: !p.artifactOpen })),
    setArtifactOpen: (open: boolean) => setState((p) => ({ ...p, artifactOpen: open })),
    toggleUtility: () => setState((p) => ({ ...p, utilityOpen: !p.utilityOpen })),
    setUtilityOpen: (open: boolean) => setState((p) => ({ ...p, utilityOpen: open })),
    setActiveUtilityTab: (tab: ChatWorkbenchUtilityTab) =>
      setState((p) => ({ ...p, activeUtilityTab: tab })),
    setActiveProject: (projectPath: string) =>
      setState((p) => ({ ...p, activeProject: projectPath })),
    setActiveInnerTab: (projectPath: string, tab: InnerSidebarTab) =>
      setState((p) => ({
        ...p,
        projectStates: {
          ...p.projectStates,
          [projectPath]: {
            ...DEFAULT_PROJECT_STATE,
            ...p.projectStates[projectPath],
            activeInnerTab: tab,
          },
        },
      })),
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useChatWorkbenchLayout(): ChatWorkbenchLayoutApi {
  const [state, setState] = useState<ChatWorkbenchLayoutState>(() => readPersisted());

  useEffect(() => {
    persist(state);
  }, [state]);

  // Wrap each stable callback in useCallback so consumers get referential stability.
  const cbs = buildCallbacks(setState);
  const toggleRail = useCallback(cbs.toggleRail, [setState]); // eslint-disable-line react-hooks/exhaustive-deps
  const setRailOpen = useCallback(cbs.setRailOpen, [setState]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleArtifact = useCallback(cbs.toggleArtifact, [setState]); // eslint-disable-line react-hooks/exhaustive-deps
  const setArtifactOpen = useCallback(cbs.setArtifactOpen, [setState]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleUtility = useCallback(cbs.toggleUtility, [setState]); // eslint-disable-line react-hooks/exhaustive-deps
  const setUtilityOpen = useCallback(cbs.setUtilityOpen, [setState]); // eslint-disable-line react-hooks/exhaustive-deps
  const setActiveUtilityTab = useCallback(cbs.setActiveUtilityTab, [setState]); // eslint-disable-line react-hooks/exhaustive-deps
  const setActiveProject = useCallback(cbs.setActiveProject, [setState]); // eslint-disable-line react-hooks/exhaustive-deps
  const setActiveInnerTab = useCallback(cbs.setActiveInnerTab, [setState]); // eslint-disable-line react-hooks/exhaustive-deps

  const getProjectState = useCallback(
    (projectPath: string): ProjectRailState =>
      state.projectStates[projectPath] ?? DEFAULT_PROJECT_STATE,
    [state.projectStates],
  );

  return {
    ...state,
    toggleRail,
    setRailOpen,
    toggleArtifact,
    setArtifactOpen,
    toggleUtility,
    setUtilityOpen,
    setActiveUtilityTab,
    setActiveProject,
    setActiveInnerTab,
    getProjectState,
  };
}
