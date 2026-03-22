/**
 * CentrePaneConnected — switches between EditorContent, DiffReview,
 * SessionReplay, Settings, Usage, ContextBuilder, and TimeTravel views.
 *
 * Extracted from App.tsx.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useDiffReview, DiffReviewPanel } from '../DiffReview';
import { useProject } from '../../contexts/ProjectContext';
import { SessionReplayPanel } from '../SessionReplay';
import { SettingsPanel } from '../Settings/SettingsPanel';
import { UsagePanel } from '../UsageModal/UsagePanel';
import { ContextBuilder } from '../ContextBuilder';
import { TimeTravelPanelConnected } from './TimeTravelPanelConnected';
import { EditorTabBar, type SpecialViewType } from './EditorTabBar';
import { CentrePane } from './CentrePane';
import { EditorContent } from './EditorContent';
import type { AgentSession as AgentMonitorSession } from '../AgentMonitor/types';
import { ExtensionStoreSection } from '../Settings/ExtensionStoreSection';
import { McpStoreSection } from '../Settings/McpStoreSection';
import {
  OPEN_SETTINGS_PANEL_EVENT,
  OPEN_EXTENSION_STORE_EVENT,
  OPEN_MCP_STORE_EVENT,
} from '../../hooks/appEventNames';

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
  openReview: (sessionId: string, snapshotHash: string, projectRoot: string) => void,
  setReplaySession: (s: AgentMonitorSession | null) => void,
  setActiveView: (v: 'editor') => void,
): void {
  useEffect(() => {
    function onOpen(e: Event): void {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setReplaySession(null);
        setActiveView('editor');
        openReview(detail.sessionId, detail.snapshotHash, detail.projectRoot);
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
    case 'usage': return <UsagePanel onClose={noop} />;
    case 'context-builder': return projectRoot ? <ContextBuilder projectRoot={projectRoot} onClose={noop} /> : null;
    case 'time-travel': return <TimeTravelPanelConnected onClose={noop} />;
    case 'extensions': return <div className="bg-surface-base" style={panelStyle}><div style={scrollStyle}><ExtensionStoreSection /></div></div>;
    case 'mcp': return <div className="bg-surface-base" style={panelStyle}><div style={scrollStyle}><McpStoreSection /></div></div>;
    default: return null;
  }
}

// ── Main component ──────────────────────────────────────────────────────────

export function CentrePaneConnected(): React.ReactElement {
  const { state, openReview, closeReview, acceptHunk, rejectHunk, acceptAllFile, rejectAllFile, acceptAll, rejectAll } = useDiffReview();
  const { projectRoot } = useProject();
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

  const activeSpecialView = activeView === 'editor' ? null : activeView;

  useDiffReviewEvents(openReview, setReplaySession, setActiveView);
  useSessionReplayEvents(closeReview, setReplaySession, setActiveView);
  useSpecialViewEvents(openAndActivate);
  useFileTabClicksSwitchToEditor(setActiveView);

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
      {/* Editor — hidden when a special view is active */}
      <div style={{ ...layerStyle, display: activeView === 'editor' ? 'flex' : 'none' }}>
        <EditorContent />
      </div>
      {/* Persistent special views — hidden but not unmounted when inactive */}
      {openViews.map((view) => (
        <div key={view} style={{ ...layerStyle, display: activeView === view ? 'flex' : 'none' }}>
          <SpecialViewPanel view={view} projectRoot={projectRoot} />
        </div>
      ))}
    </CentrePane>
  );
}
