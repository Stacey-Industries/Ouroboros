import { useCallback, useEffect, useState } from 'react';

import type { InnerSidebarTab } from './InnerSidebar';

const STORAGE_KEY = 'agent-ide:chat-workbench-layout';

export type ChatWorkbenchUtilityTab = 'activity' | 'review' | 'approvals' | 'rules' | 'monitor';

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

export type RightPaneView = 'utility' | 'artifact';

export interface ChatWorkbenchLayoutState {
  railOpen: boolean;
  artifactOpen: boolean;
  utilityOpen: boolean;
  activeUtilityTab: ChatWorkbenchUtilityTab;
  lastRightPaneView: RightPaneView;
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
  setActiveProject: (projectPath: string | null) => void;
  setActiveInnerTab: (projectPath: string, tab: InnerSidebarTab) => void;
  getProjectState: (projectPath: string) => ProjectRailState;
  // Phase A (Wave 94): named aliases for direct button binding
  isUtilityOpen: boolean;
  isArtifactOpen: boolean;
  // Right pane (utility ⇄ artifact, tiling — both can be open simultaneously)
  rightPaneOpen: boolean;
  rightPaneView: RightPaneView | null;
  toggleRightPane: () => void;
  setRightPaneView: (view: RightPaneView) => void;
}

const DEFAULT_STATE: ChatWorkbenchLayoutState = {
  railOpen: true,
  artifactOpen: false,
  utilityOpen: false,
  activeUtilityTab: 'activity',
  lastRightPaneView: 'utility',
  activeProject: null,
  projectStates: {},
};

function isRightPaneView(value: unknown): value is RightPaneView {
  return value === 'utility' || value === 'artifact';
}

// ── Persistence ────────────────────────────────────────────────────────────────

function isUtilityTab(value: unknown): value is ChatWorkbenchUtilityTab {
  return (
    value === 'activity' ||
    value === 'review' ||
    value === 'approvals' ||
    value === 'rules' ||
    value === 'monitor'
  );
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(max-width: 768px)').matches;
}

function readPersisted(): ChatWorkbenchLayoutState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Cold boot on mobile — start with rail closed so chat fills the screen.
      return isMobileViewport() ? { ...DEFAULT_STATE, railOpen: false } : DEFAULT_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<ChatWorkbenchLayoutState>;
    return {
      railOpen: Boolean(parsed.railOpen),
      artifactOpen: Boolean(parsed.artifactOpen),
      utilityOpen: Boolean(parsed.utilityOpen),
      activeUtilityTab: isUtilityTab(parsed.activeUtilityTab)
        ? parsed.activeUtilityTab
        : DEFAULT_STATE.activeUtilityTab,
      lastRightPaneView: isRightPaneView(parsed.lastRightPaneView)
        ? parsed.lastRightPaneView
        : DEFAULT_STATE.lastRightPaneView,
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

function applyArtifactOpen(p: ChatWorkbenchLayoutState, open: boolean): ChatWorkbenchLayoutState {
  // Wave 89 Phase 3: overlays tile — no longer mutually exclusive.
  // artifact and utility CAN both be open simultaneously (tile layout).
  if (!open) return { ...p, artifactOpen: false };
  return { ...p, artifactOpen: true, lastRightPaneView: 'artifact' };
}

function applyUtilityOpen(p: ChatWorkbenchLayoutState, open: boolean): ChatWorkbenchLayoutState {
  // Wave 89 Phase 3: overlays tile — no longer mutually exclusive.
  if (!open) return { ...p, utilityOpen: false };
  return { ...p, utilityOpen: true, lastRightPaneView: 'utility' };
}

function applyToggleRightPane(p: ChatWorkbenchLayoutState): ChatWorkbenchLayoutState {
  const open = p.utilityOpen || p.artifactOpen;
  if (open) return { ...p, utilityOpen: false, artifactOpen: false };
  return p.lastRightPaneView === 'artifact'
    ? applyArtifactOpen(p, true)
    : applyUtilityOpen(p, true);
}

function buildCallbacks(setState: Setter) {
  return {
    toggleRail: () => setState((p) => ({ ...p, railOpen: !p.railOpen })),
    setRailOpen: (open: boolean) => setState((p) => ({ ...p, railOpen: open })),
    toggleArtifact: () => setState((p) => applyArtifactOpen(p, !p.artifactOpen)),
    setArtifactOpen: (open: boolean) => setState((p) => applyArtifactOpen(p, open)),
    toggleUtility: () => setState((p) => applyUtilityOpen(p, !p.utilityOpen)),
    setUtilityOpen: (open: boolean) => setState((p) => applyUtilityOpen(p, open)),
    setActiveUtilityTab: (tab: ChatWorkbenchUtilityTab) =>
      setState((p) => ({ ...p, activeUtilityTab: tab })),
    setActiveProject: (projectPath: string | null) => {
      setState((p) => ({ ...p, activeProject: projectPath }));
    },
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
    toggleRightPane: () => setState(applyToggleRightPane),
    setRightPaneView: (view: RightPaneView) =>
      setState((p) =>
        view === 'artifact' ? applyArtifactOpen(p, true) : applyUtilityOpen(p, true),
      ),
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────────

function useStableCallbacks(setState: Setter): ReturnType<typeof buildCallbacks> {
  const cbs = buildCallbacks(setState);
  /* eslint-disable react-hooks/exhaustive-deps */
  return {
    toggleRail: useCallback(cbs.toggleRail, [setState]),
    setRailOpen: useCallback(cbs.setRailOpen, [setState]),
    toggleArtifact: useCallback(cbs.toggleArtifact, [setState]),
    setArtifactOpen: useCallback(cbs.setArtifactOpen, [setState]),
    toggleUtility: useCallback(cbs.toggleUtility, [setState]),
    setUtilityOpen: useCallback(cbs.setUtilityOpen, [setState]),
    setActiveUtilityTab: useCallback(cbs.setActiveUtilityTab, [setState]),
    setActiveProject: useCallback(cbs.setActiveProject, [setState]),
    setActiveInnerTab: useCallback(cbs.setActiveInnerTab, [setState]),
    toggleRightPane: useCallback(cbs.toggleRightPane, [setState]),
    setRightPaneView: useCallback(cbs.setRightPaneView, [setState]),
  };
  /* eslint-enable react-hooks/exhaustive-deps */
}

function deriveRightPane(state: ChatWorkbenchLayoutState): {
  isUtilityOpen: boolean;
  isArtifactOpen: boolean;
  rightPaneOpen: boolean;
  rightPaneView: RightPaneView | null;
} {
  const rightPaneOpen = state.utilityOpen || state.artifactOpen;
  const rightPaneView: RightPaneView | null = state.utilityOpen
    ? 'utility'
    : state.artifactOpen
      ? 'artifact'
      : null;
  return {
    isUtilityOpen: state.utilityOpen,
    isArtifactOpen: state.artifactOpen,
    rightPaneOpen,
    rightPaneView,
  };
}

export function useChatWorkbenchLayout(): ChatWorkbenchLayoutApi {
  const [state, setState] = useState<ChatWorkbenchLayoutState>(() => readPersisted());
  useEffect(() => {
    persist(state);
  }, [state]);
  const callbacks = useStableCallbacks(setState);
  const getProjectState = useCallback(
    (projectPath: string): ProjectRailState =>
      state.projectStates[projectPath] ?? DEFAULT_PROJECT_STATE,
    [state.projectStates],
  );
  return { ...state, ...callbacks, ...deriveRightPane(state), getProjectState };
}
