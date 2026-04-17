/**
 * CentrePaneConnected — switches between EditorContent, DiffReview,
 * SessionReplay, Settings, Usage, ContextBuilder, and TimeTravel views.
 *
 * Extracted from App.tsx.
 */

import React, { useCallback, useEffect, useState } from 'react';

import { useProject } from '../../contexts/ProjectContext';
import {
  OPEN_EXTENSION_STORE_EVENT,
  OPEN_MCP_STORE_EVENT,
  OPEN_SETTINGS_PANEL_EVENT,
  OPEN_USAGE_DASHBOARD_EVENT,
} from '../../hooks/appEventNames';
import { useConfig } from '../../hooks/useConfig';
import type { AgentSession as AgentMonitorSession } from '../AgentMonitor/types';
import { useDiffReview } from '../DiffReview';
import { CentrePane } from './CentrePane';
import { EditorContent } from './EditorContent';
import { EditorTabBar, type SpecialViewType } from './EditorTabBar';
import { LazyPanelFallback } from './LazyPanelFallback';

const ContextBuilder = React.lazy(() =>
  import('../ContextBuilder').then((m) => ({ default: m.ContextBuilder })),
);
const DiffReviewPanel = React.lazy(() =>
  import('../DiffReview').then((m) => ({ default: m.DiffReviewPanel })),
);
const ExtensionStorePage = React.lazy(() =>
  import('../ExtensionStore/ExtensionStorePage').then((m) => ({ default: m.ExtensionStorePage })),
);
const McpStorePage = React.lazy(() =>
  import('../McpStore/McpStorePage').then((m) => ({ default: m.McpStorePage })),
);
const SessionReplayPanel = React.lazy(() =>
  import('../SessionReplay').then((m) => ({ default: m.SessionReplayPanel })),
);
const SettingsPanel = React.lazy(() =>
  import('../Settings/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
);
const UsagePanel = React.lazy(() =>
  import('../UsageModal/UsagePanel').then((m) => ({ default: m.UsagePanel })),
);
const UsageDashboard = React.lazy(() =>
  import('../UsageDashboard').then((m) => ({ default: m.UsageDashboard })),
);
const TimeTravelPanelConnected = React.lazy(() =>
  import('./TimeTravelPanelConnected').then((m) => ({ default: m.TimeTravelPanelConnected })),
);
const LazyGraphPanel = React.lazy(() =>
  import('./GraphPanel/GraphPanel').then((m) => ({ default: m.GraphPanel })),
);

// ── Event → view mapping ────────────────────────────────────────────────────

const SPECIAL_VIEW_EVENTS: Array<[string, SpecialViewType]> = [
  [OPEN_SETTINGS_PANEL_EVENT, 'settings'],
  ['agent-ide:open-usage-panel', 'usage'],
  ['agent-ide:open-context-builder', 'context-builder'],
  ['agent-ide:open-time-travel', 'time-travel'],
  [OPEN_EXTENSION_STORE_EVENT, 'extensions'],
  [OPEN_MCP_STORE_EVENT, 'mcp'],
  [OPEN_USAGE_DASHBOARD_EVENT, 'usage-dashboard'],
];

const GRAPH_PANEL_EVENT = 'agent-ide:open-graph-panel';

// ── Hooks ───────────────────────────────────────────────────────────────────

function useDiffReviewEvents(
  openReview: (sessionId: string, snapshotHash: string, projectRoot: string, filePaths?: string[]) => void,
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

function useSessionReplayEvents(
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

function useSpecialViewEvents(
  openAndActivate: (view: SpecialViewType) => void,
): void {
  useEffect(() => {
    const handlers = SPECIAL_VIEW_EVENTS.map(([event, view]) => {
      const handler = () => openAndActivate(view);
      window.addEventListener(event, handler);
      return [event, handler] as const;
    });
    return () => handlers.forEach(([event, handler]) => window.removeEventListener(event, handler));
  }, [openAndActivate]);
}

function useGraphPanelEvent(
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

function useFileTabClicksSwitchToEditor(
  setActiveView: (v: 'editor') => void,
): void {
  useEffect(() => {
    const handler = () => setActiveView('editor');
    window.addEventListener('agent-ide:file-tab-clicked-while-special-view', handler);
    return () => window.removeEventListener('agent-ide:file-tab-clicked-while-special-view', handler);
  }, [setActiveView]);
}

// ── Panel rendering ─────────────────────────────────────────────────────────

const layerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0, left: 0, right: 0, bottom: 0,
  flexDirection: 'column',
};


function SpecialViewPanel({ view, projectRoot }: { view: SpecialViewType; projectRoot: string | null }): React.ReactElement | null {
  const noop = useCallback(() => {}, []);
  const fallback = <LazyPanelFallback />;
  switch (view) {
    case 'settings': return <React.Suspense fallback={fallback}><SettingsPanel onClose={noop} /></React.Suspense>;
    case 'usage': return <React.Suspense fallback={fallback}><UsagePanel /></React.Suspense>;
    case 'context-builder': return projectRoot
      ? <React.Suspense fallback={fallback}><ContextBuilder projectRoot={projectRoot} onClose={noop} /></React.Suspense>
      : null;
    case 'time-travel': return <React.Suspense fallback={fallback}><TimeTravelPanelConnected onClose={noop} /></React.Suspense>;
    case 'extensions': return <React.Suspense fallback={fallback}><ExtensionStorePage /></React.Suspense>;
    case 'mcp': return <React.Suspense fallback={fallback}><McpStorePage /></React.Suspense>;
    case 'usage-dashboard': return <React.Suspense fallback={fallback}><UsageDashboard /></React.Suspense>;
    case 'graph-panel': return <React.Suspense fallback={fallback}><LazyGraphPanel /></React.Suspense>;
    default: return null;
  }
}

// ── Main component state hook ────────────────────────────────────────────────

interface CentrePaneState {
  openViews: SpecialViewType[];
  activeView: 'editor' | SpecialViewType;
  replaySession: AgentMonitorSession | null;
  setReplaySession: (s: AgentMonitorSession | null) => void;
  setActiveView: (view: 'editor' | SpecialViewType) => void;
  openAndActivate: (view: SpecialViewType) => void;
  closeView: (view: SpecialViewType) => void;
}

function useCentrePaneState(closeReview: () => void): CentrePaneState {
  const [replaySession, setReplaySession] = useState<AgentMonitorSession | null>(null);
  const [openViews, setOpenViews] = useState<SpecialViewType[]>([]);
  const [activeView, setActiveView] = useState<'editor' | SpecialViewType>('editor');

  const openAndActivate = useCallback((view: SpecialViewType) => {
    setReplaySession(null);
    closeReview();
    setOpenViews((prev) => prev.includes(view) ? prev : [...prev, view]);
    setActiveView(view);
  }, [closeReview]);

  const closeView = useCallback((view: SpecialViewType) => {
    setOpenViews((prev) => prev.filter((v) => v !== view));
    setActiveView((prev) => prev === view ? 'editor' : prev);
  }, []);

  return { openViews, activeView, replaySession, setReplaySession, setActiveView, openAndActivate, closeView };
}

function useGlobalReviewEvents(
  openReview: (sessionId: string, snapshotHash: string, projectRoot: string, filePaths?: string[]) => void,
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

function EditorViewContent({
  activeView,
  openViews,
  projectRoot,
  openAndActivate,
  closeView,
}: {
  activeView: 'editor' | SpecialViewType;
  openViews: SpecialViewType[];
  projectRoot: string | null;
  openAndActivate: (view: SpecialViewType) => void;
  closeView: (view: SpecialViewType) => void;
}): React.ReactElement {
  const activeSpecialView = activeView === 'editor' ? null : activeView;
  return (
    <CentrePane
      rootStyle={{ height: '100%' }}
      tabBar={
        <EditorTabBar
          openSpecialViews={openViews}
          activeSpecialView={activeSpecialView}
          onSpecialViewClick={openAndActivate}
          onSpecialViewClose={closeView}
        />
      }
    >
      <div style={{ ...layerStyle, display: activeView === 'editor' ? 'flex' : 'none' }}>
        <EditorContent />
      </div>
      {openViews.map((view) => (
        <div key={view} style={{ ...layerStyle, display: activeView === view ? 'flex' : 'none' }}>
          <SpecialViewPanel view={view} projectRoot={projectRoot} />
        </div>
      ))}
    </CentrePane>
  );
}

// ── Lazy full-pane overlays ──────────────────────────────────────────────────

type DiffReviewProps = React.ComponentPropsWithoutRef<typeof DiffReviewPanel>;

function LazyDiffReview(props: DiffReviewProps): React.ReactElement {
  return (
    <React.Suspense fallback={<LazyPanelFallback />}>
      <DiffReviewPanel {...props} />
    </React.Suspense>
  );
}

function LazySessionReplay({
  session,
  onClose,
}: React.ComponentPropsWithoutRef<typeof SessionReplayPanel>): React.ReactElement {
  return (
    <React.Suspense fallback={<LazyPanelFallback />}>
      <SessionReplayPanel session={session} onClose={onClose} />
    </React.Suspense>
  );
}

// ── Main connected component ─────────────────────────────────────────────────

interface CentrePaneWiringArgs {
  closeReview: () => void;
  openAndActivate: (v: SpecialViewType) => void;
  setReplaySession: (s: AgentMonitorSession | null) => void;
  setActiveView: (v: 'editor') => void;
  openReview: (sessionId: string, snapshotHash: string, projectRoot: string, filePaths?: string[]) => void;
  projectRoot: string | null;
  enhancedEnabled: boolean;
}

function useCentrePaneWiring(args: CentrePaneWiringArgs): void {
  const { closeReview, openAndActivate, setReplaySession, setActiveView, openReview, projectRoot, enhancedEnabled } = args;
  useDiffReviewEvents(openReview, setReplaySession, setActiveView);
  useSessionReplayEvents(closeReview, setReplaySession, setActiveView);
  useSpecialViewEvents(openAndActivate);
  useGraphPanelEvent(openAndActivate, enhancedEnabled);
  useFileTabClicksSwitchToEditor(setActiveView);
  useGlobalReviewEvents(openReview, projectRoot, setReplaySession, setActiveView);
}

export function CentrePaneConnected(): React.ReactElement {
  const { state, openReview, closeReview, acceptHunk, rejectHunk, acceptAllFile, rejectAllFile, acceptAll, rejectAll, canRollback, rollback } = useDiffReview();
  const { projectRoot } = useProject();
  const enhancedEnabled = useConfig().config?.review?.enhanced ?? true;
  const { openViews, activeView, replaySession, setReplaySession, setActiveView, openAndActivate, closeView } = useCentrePaneState(closeReview);

  useCentrePaneWiring({ closeReview, openAndActivate, setReplaySession, setActiveView, openReview, projectRoot, enhancedEnabled });

  if (state) {
    return (
      <LazyDiffReview
        state={state} canRollback={canRollback} enhancedEnabled={enhancedEnabled}
        onAcceptHunk={acceptHunk} onRejectHunk={rejectHunk}
        onAcceptAllFile={acceptAllFile} onRejectAllFile={rejectAllFile}
        onAcceptAll={acceptAll} onRejectAll={rejectAll}
        onRollback={rollback} onClose={closeReview}
      />
    );
  }

  if (replaySession) {
    return <LazySessionReplay session={replaySession} onClose={() => setReplaySession(null)} />;
  }

  return (
    <EditorViewContent activeView={activeView} openViews={openViews}
      projectRoot={projectRoot} openAndActivate={openAndActivate} closeView={closeView} />
  );
}
