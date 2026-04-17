/**
 * useResearchModeShortcut.ts — Keyboard shortcut Ctrl+Alt+R cycles the
 * research mode for the current chat session.
 *
 * Wave 30 Phase G. Cycle order: off → conservative → aggressive → off.
 * Shows a toast with the new mode name after each cycle.
 *
 * Note: Ctrl+Shift+R is reserved by the command palette for "Reload Window",
 * so Ctrl+Alt+R is used instead per spec fallback.
 */

import { useCallback, useEffect } from 'react';

import type { ResearchMode } from '../../types/electron-research';

// ─── Cycle order ──────────────────────────────────────────────────────────────

const CYCLE: ResearchMode[] = ['off', 'conservative', 'aggressive'];

const MODE_LABELS: Record<ResearchMode, string> = {
  off: 'Off',
  conservative: 'Conservative',
  aggressive: 'Aggressive',
};

function nextMode(current: ResearchMode): ResearchMode {
  const idx = CYCLE.indexOf(current);
  return CYCLE[(idx + 1) % CYCLE.length];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseResearchModeShortcutOpts {
  /** Active session ID. When falsy the shortcut is still registered but writes are skipped. */
  sessionId?: string | null;
  /** Toast callback from useToastContext(). */
  toast: (msg: string, type?: 'success' | 'info' | 'error' | 'warning') => void;
}

export function useResearchModeShortcut({ sessionId, toast }: UseResearchModeShortcutOpts): void {
  const handleShortcut = useCallback(async () => {
    if (!sessionId) {
      toast('Research mode: no active session', 'info');
      return;
    }
    const res = await window.electronAPI.research.getSessionMode(sessionId).catch(() => null);
    const current: ResearchMode = res?.success ? res.mode : 'conservative';
    const next = nextMode(current);
    await window.electronAPI.research.setSessionMode(sessionId, next).catch(() => undefined);
    toast(`Research mode: ${MODE_LABELS[next]}`, 'info');
  }, [sessionId, toast]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      // Ctrl+Alt+R (Windows/Linux) — Ctrl+Shift+R is taken by Reload Window
      if (e.ctrlKey && e.altKey && !e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        void handleShortcut();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleShortcut]);
}
