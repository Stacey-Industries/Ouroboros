import { useEffect } from 'react';

import {
  OPEN_EXTENSION_STORE_EVENT,
  OPEN_MCP_STORE_EVENT,
  OPEN_SETTINGS_PANEL_EVENT,
  OPEN_USAGE_DASHBOARD_EVENT,
} from '../../hooks/appEventNames';
import type { AgentSession as AgentMonitorSession } from '../AgentMonitor/types';
import type { SpecialViewType } from './EditorTabBar';

export const SPECIAL_VIEW_EVENTS: Array<[string, SpecialViewType]> = [
  [OPEN_SETTINGS_PANEL_EVENT, 'settings'],
  ['agent-ide:open-usage-panel', 'usage'],
  ['agent-ide:open-context-builder', 'context-builder'],
  ['agent-ide:open-time-travel', 'time-travel'],
  [OPEN_EXTENSION_STORE_EVENT, 'extensions'],
  [OPEN_MCP_STORE_EVENT, 'mcp'],
  [OPEN_USAGE_DASHBOARD_EVENT, 'usage-dashboard'],
];

export const GRAPH_PANEL_EVENT = 'agent-ide:open-graph-panel';

export function useDiffReviewEvents(
  openReview: (
    sessionId: string,
    snapshotHash: string,
    projectRoot: string,
    filePaths?: string[],
  ) => void,
  setReplaySession: (s: AgentMonitorSession | null) => void,
  setActiveView: (v: 'editor') => void,
): void {
  useEffect(() => {
    function onOpen(e: Event): void {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setReplaySession(null);
        setActiveView('editor');
        openReview(detail.sessionId, detail.snapshotHash, detail.projectRoot, detail.filePaths);
      }
    }
    window.addEventListener('agent-ide:diff-review-open', onOpen);
    return () => window.removeEventListener('agent-ide:diff-review-open', onOpen);
  }, [openReview, setReplaySession, setActiveView]);
}

export function useSessionReplayEvents(
  closeReview: () => void,
  setReplaySession: (s: AgentMonitorSession | null) => void,
  setActiveView: (v: 'editor') => void,
): void {
  useEffect(() => {
    function onOpen(e: Event): void {
      const detail = (e as CustomEvent<{ session: AgentMonitorSession }>).detail;
      if (detail?.session) {
        closeReview();
        setActiveView('editor');
        setReplaySession(detail.session);
      }
    }
    window.addEventListener('agent-ide:open-session-replay', onOpen);
    return () => window.removeEventListener('agent-ide:open-session-replay', onOpen);
  }, [closeReview, setReplaySession, setActiveView]);
}

export function useSpecialViewEvents(openAndActivate: (view: SpecialViewType) => void): void {
  useEffect(() => {
    const handlers = SPECIAL_VIEW_EVENTS.map(([event, view]) => {
      const handler = () => openAndActivate(view);
      window.addEventListener(event, handler);
      return [event, handler] as const;
    });
    return () => handlers.forEach(([event, handler]) => window.removeEventListener(event, handler));
  }, [openAndActivate]);
}

export function useGraphPanelEvent(
  openAndActivate: (view: SpecialViewType) => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = () => openAndActivate('graph-panel');
    window.addEventListener(GRAPH_PANEL_EVENT, handler);
    return () => window.removeEventListener(GRAPH_PANEL_EVENT, handler);
  }, [openAndActivate, enabled]);
}

export function useFileTabClicksSwitchToEditor(setActiveView: (v: 'editor') => void): void {
  useEffect(() => {
    const handler = () => setActiveView('editor');
    window.addEventListener('agent-ide:file-tab-clicked-while-special-view', handler);
    return () =>
      window.removeEventListener('agent-ide:file-tab-clicked-while-special-view', handler);
  }, [setActiveView]);
}

export function useGlobalReviewEvents(
  openReview: (
    sessionId: string,
    snapshotHash: string,
    projectRoot: string,
    filePaths?: string[],
  ) => void,
  projectRoot: string | null,
  setReplaySession: (s: AgentMonitorSession | null) => void,
  setActiveView: (v: 'editor') => void,
): void {
  useEffect(() => {
    function onReviewAll() {
      if (!projectRoot) return;
      setReplaySession(null);
      setActiveView('editor');
      openReview('global-review', 'HEAD', projectRoot);
    }
    function onReviewUnstaged() {
      if (!projectRoot) return;
      setReplaySession(null);
      setActiveView('editor');
      openReview('global-review-unstaged', 'INDEX', projectRoot);
    }
    window.addEventListener('agent-ide:review-all-changes', onReviewAll);
    window.addEventListener('agent-ide:review-unstaged-changes', onReviewUnstaged);
    return () => {
      window.removeEventListener('agent-ide:review-all-changes', onReviewAll);
      window.removeEventListener('agent-ide:review-unstaged-changes', onReviewUnstaged);
    };
  }, [openReview, projectRoot, setReplaySession, setActiveView]);
}

export interface CentrePaneWiringArgs {
  closeReview: () => void;
  openAndActivate: (v: SpecialViewType) => void;
  setReplaySession: (s: AgentMonitorSession | null) => void;
  setActiveView: (v: 'editor') => void;
  openReview: (
    sessionId: string,
    snapshotHash: string,
    projectRoot: string,
    filePaths?: string[],
  ) => void;
  projectRoot: string | null;
  enhancedEnabled: boolean;
}

export function useCentrePaneWiring(args: CentrePaneWiringArgs): void {
  const {
    closeReview,
    openAndActivate,
    setReplaySession,
    setActiveView,
    openReview,
    projectRoot,
    enhancedEnabled,
  } = args;
  useDiffReviewEvents(openReview, setReplaySession, setActiveView);
  useSessionReplayEvents(closeReview, setReplaySession, setActiveView);
  useSpecialViewEvents(openAndActivate);
  useGraphPanelEvent(openAndActivate, enhancedEnabled);
  useFileTabClicksSwitchToEditor(setActiveView);
  useGlobalReviewEvents(openReview, projectRoot, setReplaySession, setActiveView);
}
