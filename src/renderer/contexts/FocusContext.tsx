/**
 * FocusContext — tracks which panel currently has keyboard focus.
 *
 * Panels: 'sidebar' | 'editor' | 'terminal' | 'agentMonitor'
 *
 * Keyboard shortcuts (Ctrl+1–4) switch focus programmatically.
 * Click handlers on each panel container update focus on interaction.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FocusPanel = 'sidebar' | 'editor' | 'terminal' | 'agentMonitor';

export interface FocusContextValue {
  focusedPanel: FocusPanel;
  setFocusedPanel: (panel: FocusPanel) => void;
  focusRingStyle: (panel: FocusPanel) => React.CSSProperties;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const FocusContext = createContext<FocusContextValue>({
  focusedPanel: 'editor',
  setFocusedPanel: () => undefined,
  focusRingStyle: () => ({}),
});

// ─── DOM focus helper ─────────────────────────────────────────────────────────

const FOCUS_TARGETS: Record<FocusPanel, [string, string]> = {
  sidebar:      ['[data-panel="sidebar"] [tabindex]', '[data-panel="sidebar"]'],
  editor:       ['.monaco-editor textarea', '[data-panel="editor"]'],
  terminal:     ['.xterm-helper-textarea', '[data-panel="terminal"]'],
  agentMonitor: ['[data-panel="agent-monitor"] textarea', '[data-panel="agent-monitor"]'],
};

function focusPanelElement(panel: FocusPanel): void {
  requestAnimationFrame(() => {
    const [primary, fallback] = FOCUS_TARGETS[panel];
    const el = (document.querySelector(primary) ?? document.querySelector(fallback)) as HTMLElement | null;
    el?.focus({ preventScroll: true });
  });
}

// ─── Keyboard shortcut handler (extracted for max-lines-per-function) ────────

function useFocusKeyboard(setPanel: (p: FocusPanel) => void): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      const map: Record<string, FocusPanel> = {
        '1': 'sidebar', '2': 'editor', '3': 'terminal', '4': 'agentMonitor',
      };
      const panel = map[e.key];
      if (panel) { e.preventDefault(); setPanel(panel); focusPanelElement(panel); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setPanel]);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function FocusProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [focusedPanel, setFocusedPanel] = useState<FocusPanel>('editor');
  const stableSet = useCallback((panel: FocusPanel) => setFocusedPanel(panel), []);

  useFocusKeyboard(stableSet);

  const ringStyle = useCallback(
    (panel: FocusPanel): React.CSSProperties => focusRingStyle(panel, focusedPanel),
    [focusedPanel],
  );

  const value = useMemo<FocusContextValue>(
    () => ({ focusedPanel, focusRingStyle: ringStyle, setFocusedPanel: stableSet }),
    [focusedPanel, ringStyle, stableSet],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFocusPanel(): FocusContextValue {
  return useContext(FocusContext);
}

// ─── Utility: returns inline style for focused panel ring ─────────────────────

export function focusRingStyle(panel: FocusPanel, focused: FocusPanel): React.CSSProperties {
  if (panel !== focused) return {};
  return { boxShadow: 'inset 0 0 0 2px var(--interactive-focus)' };
}
