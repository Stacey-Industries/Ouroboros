/**
 * useMobileActivePanel.ts
 *
 * Owns the mobileActivePanel state that was previously local to AppLayout.tsx.
 * Subscribes to DOM events so any dispatcher can flip the active panel without
 * prop-drilling through the layout tree.
 *
 * Wave 32 Phase D — state lift + context extraction.
 */

import { useEffect, useState } from 'react';

import type { MobilePanel } from '../components/Layout/AppLayout.mobile';
import {
  FOCUS_AGENT_CHAT_EVENT,
  FOCUS_TERMINAL_SESSION_EVENT,
  OPEN_AGENT_CHAT_PANEL_EVENT,
} from './appEventNames';

export interface MobileActivePanelValue {
  activePanel: MobilePanel;
  setActivePanel: (panel: MobilePanel) => void;
}

export function useMobileActivePanel(): MobileActivePanelValue {
  const [activePanel, setActivePanel] = useState<MobilePanel>('chat');

  useEffect(() => {
    const onFocusChat = (): void => setActivePanel('chat');
    const onFocusTerminal = (): void => setActivePanel('terminal');

    window.addEventListener(FOCUS_AGENT_CHAT_EVENT, onFocusChat);
    window.addEventListener(OPEN_AGENT_CHAT_PANEL_EVENT, onFocusChat);
    window.addEventListener(FOCUS_TERMINAL_SESSION_EVENT, onFocusTerminal);

    return () => {
      window.removeEventListener(FOCUS_AGENT_CHAT_EVENT, onFocusChat);
      window.removeEventListener(OPEN_AGENT_CHAT_PANEL_EVENT, onFocusChat);
      window.removeEventListener(FOCUS_TERMINAL_SESSION_EVENT, onFocusTerminal);
    };
  }, []);

  return { activePanel, setActivePanel };
}
