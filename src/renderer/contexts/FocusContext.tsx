/**
 * FocusContext — tracks which panel currently has keyboard focus.
 *
 * Panels: 'sidebar' | 'editor' | 'terminal' | 'agentMonitor'
 *
 * Keyboard shortcuts (Ctrl+1–4) switch focus programmatically.
 * Click handlers on each panel container update focus on interaction.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FocusPanel = 'sidebar' | 'editor' | 'terminal' | 'agentMonitor';

interface FocusContextValue {
  focusedPanel: FocusPanel;
  setFocusedPanel: (panel: FocusPanel) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const FocusContext = createContext<FocusContextValue>({
  focusedPanel: 'editor',
  setFocusedPanel: () => undefined,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function FocusProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [focusedPanel, setFocusedPanel] = useState<FocusPanel>('editor');

  // Keyboard shortcuts: Ctrl+1=sidebar, Ctrl+2=editor, Ctrl+3=terminal, Ctrl+4=agentMonitor
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;

      switch (e.key) {
        case '1':
          e.preventDefault();
          setFocusedPanel('sidebar');
          break;
        case '2':
          e.preventDefault();
          setFocusedPanel('editor');
          break;
        case '3':
          e.preventDefault();
          setFocusedPanel('terminal');
          break;
        case '4':
          e.preventDefault();
          setFocusedPanel('agentMonitor');
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const stableSetFocusedPanel = useCallback((panel: FocusPanel) => setFocusedPanel(panel), []);

  const value = useMemo<FocusContextValue>(
    () => ({ focusedPanel, setFocusedPanel: stableSetFocusedPanel }),
    [focusedPanel, stableSetFocusedPanel],
  );

  return (
    <FocusContext.Provider value={value}>
      {children}
    </FocusContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFocusPanel(): FocusContextValue {
  return useContext(FocusContext);
}

// ─── Utility: returns inline style for focused panel ring ─────────────────────

export function focusRingStyle(): React.CSSProperties {
  return {};
}
