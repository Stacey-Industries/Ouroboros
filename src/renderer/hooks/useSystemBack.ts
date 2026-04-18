/**
 * useSystemBack.ts — Android system back button handler.
 *
 * On native: subscribes to @capacitor/app backButton events.
 * Handler priority (highest → lowest):
 *   1. Drawer or sheet open → close it.
 *   2. Active panel is not 'chat' → cycle back through the panel stack.
 *   3. Active panel is 'chat' → show "press back again to exit" toast for 2 s;
 *      second press within the window calls App.exitApp().
 *
 * Panel back-cycle: files → chat, editor → files, terminal → editor, chat → exit.
 *
 * No-op on web (isNative() === false).
 * Phase G — mounted once in App.tsx.
 */

import { App } from '@capacitor/app';
import { useEffect, useRef } from 'react';

import { isNative } from '../../web/capacitor';
import type { MobilePanel } from '../components/Layout/AppLayout.mobile';
import { useMobileLayout } from '../contexts/MobileLayoutContext';

// ─── Panel cycle map ──────────────────────────────────────────────────────────

const BACK_PANEL: Record<MobilePanel, MobilePanel | null> = {
  files: 'chat',
  editor: 'files',
  terminal: 'editor',
  chat: null, // null → exit flow
};

// ─── Toast helper ─────────────────────────────────────────────────────────────

/** Show a brief native-style "press back again to exit" overlay using a DOM toast. */
function showExitToast(): void {
  const existing = document.getElementById('system-back-exit-toast');
  if (existing) return;
  const el = document.createElement('div');
  el.id = 'system-back-exit-toast';
  el.textContent = 'Press back again to exit';
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.75)', // hardcoded: opacity scrim — non-semantic, no token equivalent
    color: '#fff', // hardcoded: static exit toast text — non-semantic chrome
    padding: '8px 16px',
    borderRadius: '20px',
    fontSize: '14px',
    zIndex: '9999',
    pointerEvents: 'none',
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSystemBack(): void {
  const { activePanel, setActivePanel, isDrawerOpen, closeDrawer, isSheetOpen, closeSheet } =
    useMobileLayout();

  const exitPendingRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep current values in refs so the listener closure is always fresh.
  const activePanelRef = useRef(activePanel);
  const isDrawerOpenRef = useRef(isDrawerOpen);
  const isSheetOpenRef = useRef(isSheetOpen);

  useEffect(() => { activePanelRef.current = activePanel; }, [activePanel]);
  useEffect(() => { isDrawerOpenRef.current = isDrawerOpen; }, [isDrawerOpen]);
  useEffect(() => { isSheetOpenRef.current = isSheetOpen; }, [isSheetOpen]);

  useEffect(() => {
    if (!isNative()) return;

    const handle = App.addListener('backButton', () => {
      // Priority 1: close drawer / sheet.
      if (isDrawerOpenRef.current) { closeDrawer(); return; }
      if (isSheetOpenRef.current) { closeSheet(); return; }

      // Priority 2: cycle panel back.
      const target = BACK_PANEL[activePanelRef.current];
      if (target !== null) { setActivePanel(target); return; }

      // Priority 3: exit flow (chat is the home panel).
      if (exitPendingRef.current) {
        if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current);
        void App.exitApp();
        return;
      }
      exitPendingRef.current = true;
      showExitToast();
      exitTimerRef.current = setTimeout(() => {
        exitPendingRef.current = false;
        exitTimerRef.current = null;
      }, 2000);
    });

    return () => {
      void handle.then((h) => h.remove());
      if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current);
    };
  }, [closeDrawer, closeSheet, setActivePanel]);
}
