import { useState, useCallback, useEffect, useRef } from 'react';

export type CollapseTarget = 'leftSidebar' | 'rightSidebar' | 'terminal';

export interface CollapseState {
  leftSidebar: boolean;
  rightSidebar: boolean;
  terminal: boolean;
}

function loadCollapseState(): CollapseState {
  try {
    const stored = localStorage.getItem('agent-ide:panel-collapse');
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<CollapseState>;
      return {
        leftSidebar: parsed.leftSidebar ?? false,
        rightSidebar: parsed.rightSidebar ?? false,
        terminal: parsed.terminal ?? false,
      };
    }
  } catch {
    // ignore
  }
  return { leftSidebar: false, rightSidebar: false, terminal: false };
}

function saveCollapseState(state: CollapseState): void {
  try {
    localStorage.setItem('agent-ide:panel-collapse', JSON.stringify(state));
  } catch {
    // ignore
  }
}

export interface UsePanelCollapseReturn {
  collapsed: CollapseState;
  toggle: (panel: CollapseTarget) => void;
  collapse: (panel: CollapseTarget) => void;
  expand: (panel: CollapseTarget) => void;
  /** Apply a complete collapse state (used by workspace layout switching) */
  applyState: (state: CollapseState) => void;
}

export interface UsePanelCollapseOptions {
  /** User-configured keybindings (action-id → shortcut string, e.g. "Ctrl+J") */
  keybindings?: Record<string, string>;
}

/**
 * Parse a shortcut string like "Ctrl+J" or "Ctrl+\\" into modifier flags and key.
 * Returns null if the format is unrecognised.
 */
function parseShortcut(shortcut: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } | null {
  const parts = shortcut.split('+');
  const key = parts[parts.length - 1];
  if (!key) return null;
  const ctrl = parts.includes('Ctrl');
  const shift = parts.includes('Shift');
  const alt = parts.includes('Alt');
  return { ctrl, shift, alt, key: key.toLowerCase() };
}

export function usePanelCollapse(options?: UsePanelCollapseOptions): UsePanelCollapseReturn {
  const keybindingsRef = useRef<Record<string, string>>(options?.keybindings ?? {});
  keybindingsRef.current = options?.keybindings ?? {};
  const [collapsed, setCollapsed] = useState<CollapseState>(loadCollapseState);

  const update = useCallback((next: CollapseState) => {
    setCollapsed(next);
    saveCollapseState(next);
  }, []);

  const toggle = useCallback(
    (panel: CollapseTarget) => {
      setCollapsed((prev) => {
        const next = { ...prev, [panel]: !prev[panel] };
        saveCollapseState(next);
        return next;
      });
    },
    [],
  );

  const collapse = useCallback(
    (panel: CollapseTarget) => {
      setCollapsed((prev) => {
        if (prev[panel]) return prev;
        const next = { ...prev, [panel]: true };
        saveCollapseState(next);
        return next;
      });
    },
    [],
  );

  const expand = useCallback(
    (panel: CollapseTarget) => {
      setCollapsed((prev) => {
        if (!prev[panel]) return prev;
        const next = { ...prev, [panel]: false };
        saveCollapseState(next);
        return next;
      });
    },
    [],
  );

  const applyState = useCallback(
    (state: CollapseState) => {
      setCollapsed(state);
      saveCollapseState(state);
    },
    [],
  );

  // Keyboard shortcuts — default bindings, overrideable via keybindingsRef
  useEffect(() => {
    // Default shortcuts for panel toggles
    const DEFAULTS: Record<string, { panel: CollapseTarget; shortcut: string }> = {
      'view:toggle-sidebar':       { panel: 'leftSidebar', shortcut: 'Ctrl+B' },
      'view:toggle-terminal':      { panel: 'terminal',    shortcut: 'Ctrl+J' },
      'view:toggle-agent-monitor': { panel: 'rightSidebar', shortcut: 'Ctrl+\\' },
    };

    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      for (const [actionId, config] of Object.entries(DEFAULTS)) {
        const shortcutStr = keybindingsRef.current[actionId] ?? config.shortcut;
        const parsed = parseShortcut(shortcutStr);
        if (!parsed) continue;

        const keyMatch = e.key.toLowerCase() === parsed.key || e.key === parsed.key;
        const shiftMatch = parsed.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = parsed.alt ? e.altKey : !e.altKey;

        if (ctrl && keyMatch && shiftMatch && altMatch) {
          e.preventDefault();
          toggle(config.panel);
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  return { collapsed, toggle, collapse, expand, applyState };
}
