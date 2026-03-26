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
} from '../../hooks/appEventNames';
import type { AgentSession as AgentMonitorSession } from '../AgentMonitor/types';
import { ContextBuilder } from '../ContextBuilder';
import { DiffReviewPanel,useDiffReview } from '../DiffReview';
import { SessionReplayPanel } from '../SessionReplay';
import { ExtensionStoreSection } from '../Settings/ExtensionStoreSection';
import { McpStoreSection } from '../Settings/McpStoreSection';
import { SettingsPanel } from '../Settings/SettingsPanel';
import { UsagePanel } from '../UsageModal/UsagePanel';
import { CentrePane } from './CentrePane';
import { EditorContent } from './EditorContent';
import { EditorTabBar, type SpecialViewType } from './EditorTabBar';
import { TimeTravelPanelConnected } from './TimeTravelPanelConnected';

// ── Event → view mapping ────────────────────────────────────────────────────

const SPECIAL_VIEW_EVENTS: Array<[string, SpecialViewType]> = [
  [OPEN_SETTINGS_PANEL_EVENT, 'settings'],
  ['agent-ide:open-usage-panel', 'usage'],
  ['agent-ide:open-context-builder', 'context-builder'],
  ['agent-ide:open-time-travel', 'time-travel'],
  [OPEN_EXTENSION_STORE_EVENT, 'extensions'],
  [OPEN_MCP_STORE_EVENT, 'mcp'],
];

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

const panelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100%',
  fontFamily: 'var(--font-ui)',
};

const scrollStyle: React.CSSProperties = {
  flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px',
};

function SpecialViewPanel({ view, projectRoot }: { view: SpecialViewType; projectRoot: string | null }): React.ReactElement | null {
  const noop = useCallback(() => {}, []);
  switch (view) {
    case 'settings': return <SettingsPanel onClose={noop} />;
    case 'usage': return <UsagePanel />;
    case 'context-builder': return projectRoot ? <ContextBuilder projectRoot={projectRoot} onClose={noop} /> : null;
    case 'time-travel': return <TimeTravelPanelConnected onClose={noop} />;
    case 'extensions': return <div className="bg-surface-base" style={panelStyle}><div style={scrollStyle}><ExtensionStoreSection /></div></div>;
    case 'mcp': return <div className="bg-surface-base" style={panelStyle}><div style={scrollStyle}><McpStoreSection /></div></div>;
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

export function CentrePaneConnected(): React.ReactElement {
  const { state, openReview, closeReview, acceptHunk, rejectHunk, acceptAllFile, rejectAllFile, acceptAll, rejectAll } = useDiffReview();
  const { projectRoot } = useProject();
  const { openViews, activeView, replaySession, setReplaySession, setActiveView, openAndActivate, closeView } = useCentrePaneState(closeReview);

  useDiffReviewEvents(openReview, setReplaySession, setActiveView);
  useSessionReplayEvents(closeReview, setReplaySession, setActiveView);
  useSpecialViewEvents(openAndActivate);
  useFileTabClicksSwitchToEditor(setActiveView);
  useGlobalReviewEvents(openReview, projectRoot, setReplaySession, setActiveView);

  if (state) {
    return (
      <DiffReviewPanel
        state={state}
        onAcceptHunk={acceptHunk}
        onRejectHunk={rejectHunk}
        onAcceptAllFile={acceptAllFile}
        onRejectAllFile={rejectAllFile}
        onAcceptAll={acceptAll}
        onRejectAll={rejectAll}
        onClose={closeReview}
      />
    );
  }

  if (replaySession) {
    return <SessionReplayPanel session={replaySession} onClose={() => setReplaySession(null)} />;
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
