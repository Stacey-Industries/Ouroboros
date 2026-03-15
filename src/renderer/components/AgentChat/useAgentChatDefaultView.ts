import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentChatDefaultView } from '../../types/electron';
import { useConfig } from '../../hooks/useConfig';
import {
  FOCUS_AGENT_CHAT_EVENT,
  OPEN_AGENT_CHAT_PANEL_EVENT,
} from '../../hooks/appEventNames';

export interface AgentChatDefaultViewState {
  activeView: AgentChatDefaultView;
  setActiveView: (view: AgentChatDefaultView) => void;
}

export function useAgentChatDefaultView(): AgentChatDefaultViewState {
  const { config } = useConfig();
  const [activeView, setActiveViewState] = useState<AgentChatDefaultView>('chat');
  const hasUserSelectionRef = useRef(false);

  useEffect(() => {
    if (!config || hasUserSelectionRef.current) {
      return;
    }

    setActiveViewState(config.agentChatSettings.defaultView);
  }, [config]);

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
