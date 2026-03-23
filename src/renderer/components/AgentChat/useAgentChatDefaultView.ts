import { useCallback, useEffect, useRef, useState } from 'react';

import {
  FOCUS_AGENT_CHAT_EVENT,
  OPEN_AGENT_CHAT_PANEL_EVENT,
} from '../../hooks/appEventNames';
import type { AgentChatDefaultView } from '../../types/electron';

export interface AgentChatDefaultViewState {
  activeView: AgentChatDefaultView;
  setActiveView: (view: AgentChatDefaultView) => void;
}

export function useAgentChatDefaultView(): AgentChatDefaultViewState {
  const [activeView, setActiveViewState] = useState<AgentChatDefaultView>('chat');
  const hasUserSelectionRef = useRef(false);

  // Read default view from config on mount (lightweight inline read instead of useConfig hook)
  useEffect(() => {
    if (hasUserSelectionRef.current) return;
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
      window.electronAPI.config.getAll()
        .then((cfg) => {
          if (!hasUserSelectionRef.current && cfg?.agentChatSettings?.defaultView) {
            setActiveViewState(cfg.agentChatSettings.defaultView);
          }
        })
        .catch(() => { /* default 'chat' */ });
    }
  }, []);

  const setActiveView = useCallback((view: AgentChatDefaultView) => {
    hasUserSelectionRef.current = true;
    setActiveViewState(view);
  }, []);

  useEffect(() => {
    function focusChatView(): void {
      hasUserSelectionRef.current = true;
      setActiveViewState('chat');
    }

    window.addEventListener(OPEN_AGENT_CHAT_PANEL_EVENT, focusChatView);
    window.addEventListener(FOCUS_AGENT_CHAT_EVENT, focusChatView);

    return () => {
      window.removeEventListener(OPEN_AGENT_CHAT_PANEL_EVENT, focusChatView);
      window.removeEventListener(FOCUS_AGENT_CHAT_EVENT, focusChatView);
    };
  }, []);

  return { activeView, setActiveView };
}
