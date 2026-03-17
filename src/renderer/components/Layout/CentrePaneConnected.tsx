/**
 * CentrePaneConnected — switches between EditorContent, DiffReview,
 * SessionReplay, Settings, Usage, ContextBuilder, and TimeTravel views.
 *
 * Extracted from App.tsx.
 */

import React, { useEffect, useState } from 'react';
import { useDiffReview, DiffReviewPanel } from '../DiffReview';
import { useProject } from '../../contexts/ProjectContext';
import { SessionReplayPanel } from '../SessionReplay';
import { SettingsPanel } from '../Settings/SettingsPanel';
import { UsagePanel } from '../UsageModal/UsagePanel';
import { ContextBuilder } from '../ContextBuilder';
import { TimeTravelPanelConnected } from './TimeTravelPanelConnected';
import { EditorContent } from './EditorContent';
import type { AgentSession as AgentMonitorSession } from '../AgentMonitor/types';
import {
  OPEN_SETTINGS_PANEL_EVENT,
} from '../../hooks/appEventNames';

type CentrePaneView = 'editor' | 'settings' | 'usage' | 'context-builder' | 'time-travel';

function resetSpecialView(
  closeReview: () => void,
  setReplaySession: (s: AgentMonitorSession | null) => void,
): void {
  setReplaySession(null);
  closeReview();
}

function bindSpecialViewListener(eventName: string, handler: EventListener, bind: 'addEventListener' | 'removeEventListener'): void {
  window[bind](eventName, handler);
}

function bindSpecialViewListeners(listeners: Array<[string, EventListener]>, bind: 'addEventListener' | 'removeEventListener'): void {
  listeners.forEach(([eventName, handler]) => bindSpecialViewListener(eventName, handler, bind));
}

function createSpecialViewListeners(handlers: {
  onSettings: EventListener;
  onUsage: EventListener;
  onContextBuilder: EventListener;
  onTimeTravel: EventListener;
}): Array<[string, EventListener]> {
  return [
    [OPEN_SETTINGS_PANEL_EVENT, handlers.onSettings],
    ['agent-ide:open-usage-panel', handlers.onUsage],
    ['agent-ide:open-context-builder', handlers.onContextBuilder],
    ['agent-ide:open-time-travel', handlers.onTimeTravel],
  ];
}

function useDiffReviewEvents(
  openReview: (sessionId: string, snapshotHash: string, projectRoot: string) => void,
  setReplaySession: (s: AgentMonitorSession | null) => void,
  setSpecialView: (v: CentrePaneView) => void,
): void {
  useEffect(() => {
    function onOpen(e: Event): void {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setReplaySession(null);
        setSpecialView('editor');
        openReview(detail.sessionId, detail.snapshotHash, detail.projectRoot);
      }
    }
    window.addEventListener('agent-ide:diff-review-open', onOpen);
    return () => window.removeEventListener('agent-ide:diff-review-open', onOpen);
  }, [openReview, setReplaySession, setSpecialView]);
}

function useSessionReplayEvents(
  closeReview: () => void,
  setReplaySession: (s: AgentMonitorSession | null) => void,
  setSpecialView: (v: CentrePaneView) => void,
): void {
  useEffect(() => {
    function onOpen(e: Event): void {
      const detail = (e as CustomEvent<{ session: AgentMonitorSession }>).detail;
      if (detail?.session) {
        closeReview();
        setSpecialView('editor');
        setReplaySession(detail.session);
      }
    }
    window.addEventListener('agent-ide:open-session-replay', onOpen);
    return () => window.removeEventListener('agent-ide:open-session-replay', onOpen);
  }, [closeReview, setReplaySession, setSpecialView]);
}

function useSpecialViewEvents(
  closeReview: () => void,
  setReplaySession: (s: AgentMonitorSession | null) => void,
  setSpecialView: React.Dispatch<React.SetStateAction<CentrePaneView>>,
): void {
  useEffect(() => {
    function toggle(view: CentrePaneView): void {
      resetSpecialView(closeReview, setReplaySession);
      setSpecialView((prev) => (prev === view ? 'editor' : view));
    }

    function onSettings(): void { toggle('settings'); }
    function onUsage(): void { toggle('usage'); }
    function onContextBuilder(): void { toggle('context-builder'); }
    function onTimeTravel(): void { toggle('time-travel'); }

    const listeners = createSpecialViewListeners({
      onSettings,
      onUsage,
      onContextBuilder,
      onTimeTravel,
    });
    bindSpecialViewListeners(listeners, 'addEventListener');
    return () => {
      bindSpecialViewListeners(listeners, 'removeEventListener');
    };
  }, [closeReview, setReplaySession, setSpecialView]);
}

function renderSpecialView(
  specialView: CentrePaneView,
  projectRoot: string | null,
  closeSpecial: () => void,
): React.ReactElement | null {
  if (specialView === 'settings') return <SettingsPanel onClose={closeSpecial} />;
  if (specialView === 'usage') return <UsagePanel onClose={closeSpecial} />;
  if (specialView === 'context-builder' && projectRoot) return <ContextBuilder projectRoot={projectRoot} onClose={closeSpecial} />;
  if (specialView === 'time-travel') return <TimeTravelPanelConnected onClose={closeSpecial} />;
  return null;
}

export function CentrePaneConnected(): React.ReactElement {
  const { state, openReview, closeReview, acceptHunk, rejectHunk, acceptAllFile, rejectAllFile, acceptAll, rejectAll } = useDiffReview();
  const { projectRoot } = useProject();
  const [replaySession, setReplaySession] = useState<AgentMonitorSession | null>(null);
  const [specialView, setSpecialView] = useState<CentrePaneView>('editor');

  useDiffReviewEvents(openReview, setReplaySession, setSpecialView);
  useSessionReplayEvents(closeReview, setReplaySession, setSpecialView);
  useSpecialViewEvents(closeReview, setReplaySession, setSpecialView);

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

  const closeSpecial = (): void => {
    setSpecialView('editor');
  };
  return renderSpecialView(specialView, projectRoot, closeSpecial) ?? <EditorContent />;
}
