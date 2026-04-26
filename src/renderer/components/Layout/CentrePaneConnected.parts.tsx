import React, { useCallback, useState } from 'react';

import { useProject } from '../../contexts/ProjectContext';
import { useConfig } from '../../hooks/useConfig';
import type { AgentSession as AgentMonitorSession } from '../AgentMonitor/types';
import { useDiffReview } from '../DiffReview';
import { CentrePane } from './CentrePane';
import { useCentrePaneWiring } from './CentrePaneConnected.wiring';
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

const layerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  flexDirection: 'column',
};

function resolveSpecialViewContent(
  view: SpecialViewType,
  projectRoot: string | null,
  noop: () => void,
  fallback: React.ReactElement,
): React.ReactElement | null {
  switch (view) {
    case 'settings':
      return <React.Suspense fallback={fallback}><SettingsPanel onClose={noop} /></React.Suspense>;
    case 'usage':
      return <React.Suspense fallback={fallback}><UsagePanel /></React.Suspense>;
    case 'context-builder':
      return projectRoot
        ? <React.Suspense fallback={fallback}><ContextBuilder projectRoot={projectRoot} onClose={noop} /></React.Suspense>
        : null;
    case 'time-travel':
      return <React.Suspense fallback={fallback}><TimeTravelPanelConnected onClose={noop} /></React.Suspense>;
    case 'extensions':
      return <React.Suspense fallback={fallback}><ExtensionStorePage /></React.Suspense>;
    case 'mcp':
      return <React.Suspense fallback={fallback}><McpStorePage /></React.Suspense>;
    case 'usage-dashboard':
      return <React.Suspense fallback={fallback}><UsageDashboard /></React.Suspense>;
    case 'graph-panel':
      return <React.Suspense fallback={fallback}><LazyGraphPanel /></React.Suspense>;
    default:
      return null;
  }
}

function SpecialViewPanel({
  view,
  projectRoot,
}: {
  view: SpecialViewType;
  projectRoot: string | null;
}): React.ReactElement | null {
  const noop = useCallback(() => {}, []);
  return resolveSpecialViewContent(view, projectRoot, noop, <LazyPanelFallback />);
}

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

  const openAndActivate = useCallback(
    (view: SpecialViewType) => {
      setReplaySession(null);
      closeReview();
      setOpenViews((prev) => (prev.includes(view) ? prev : [...prev, view]));
      setActiveView(view);
    },
    [closeReview],
  );

  const closeView = useCallback((view: SpecialViewType) => {
    setOpenViews((prev) => prev.filter((v) => v !== view));
    setActiveView((prev) => (prev === view ? 'editor' : prev));
  }, []);

  return {
    openViews,
    activeView,
    replaySession,
    setReplaySession,
    setActiveView,
    openAndActivate,
    closeView,
  };
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

type DiffReviewHookReturn = ReturnType<typeof useDiffReview>;

function renderActiveDiffReview(
  review: DiffReviewHookReturn,
  enhancedEnabled: boolean,
): React.ReactElement {
  const {
    state,
    acceptHunk, rejectHunk, acceptAllFile, rejectAllFile,
    acceptAll, rejectAll, canRollback, rollback, closeReview,
  } = review;
  return (
    <LazyDiffReview
      state={state!}
      canRollback={canRollback}
      enhancedEnabled={enhancedEnabled}
      onAcceptHunk={acceptHunk}
      onRejectHunk={rejectHunk}
      onAcceptAllFile={acceptAllFile}
      onRejectAllFile={rejectAllFile}
      onAcceptAll={acceptAll}
      onRejectAll={rejectAll}
      onRollback={rollback}
      onClose={closeReview}
    />
  );
}

export function CentrePaneConnectedShell(): React.ReactElement {
  const review = useDiffReview();
  const { projectRoot } = useProject();
  const enhancedEnabled = useConfig().config?.review?.enhanced ?? true;
  const {
    openViews, activeView, replaySession,
    setReplaySession, setActiveView, openAndActivate, closeView,
  } = useCentrePaneState(review.closeReview);

  useCentrePaneWiring({
    closeReview: review.closeReview,
    openAndActivate,
    setReplaySession,
    setActiveView,
    openReview: review.openReview,
    projectRoot,
    enhancedEnabled,
  });

  if (review.state) return renderActiveDiffReview(review, enhancedEnabled);

  if (replaySession) {
    return <LazySessionReplay session={replaySession} onClose={() => setReplaySession(null)} />;
  }

  return (
    <EditorViewContent
      activeView={activeView}
      openViews={openViews}
      projectRoot={projectRoot}
      openAndActivate={openAndActivate}
      closeView={closeView}
    />
  );
}
