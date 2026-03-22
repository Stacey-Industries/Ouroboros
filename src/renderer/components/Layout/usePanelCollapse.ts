import { useState, useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';

export type CollapseTarget = 'leftSidebar' | 'rightSidebar' | 'terminal' | 'editor';

export interface CollapseState {
  leftSidebar: boolean;
  rightSidebar: boolean;
  terminal: boolean;
  editor: boolean;
}

export interface UsePanelCollapseReturn {
  collapsed: CollapseState;
  toggle: (panel: CollapseTarget) => void;
  collapse: (panel: CollapseTarget) => void;
  expand: (panel: CollapseTarget) => void;
  applyState: (state: CollapseState) => void;
}

export interface UsePanelCollapseOptions {
  keybindings?: Record<string, string>;
}

interface ShortcutConfig {
  panel: CollapseTarget;
  shortcut: string;
}

interface ParsedShortcut {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

const STORAGE_KEY = 'agent-ide:panel-collapse';
const DEFAULT_STATE: CollapseState = {
  leftSidebar: false,
  rightSidebar: false,
  terminal: false,
  editor: false,
};
const DEFAULT_SHORTCUTS: Record<string, ShortcutConfig> = {
  'view:toggle-sidebar': { panel: 'leftSidebar', shortcut: 'Ctrl+B' },
  'view:toggle-terminal': { panel: 'terminal', shortcut: 'Ctrl+J' },
  'view:toggle-agent-monitor': { panel: 'rightSidebar', shortcut: 'Ctrl+\\' },
};

function cloneDefaultState(): CollapseState {
  return { ...DEFAULT_STATE };
}

function normalizeCollapseState(parsed?: Partial<CollapseState>): CollapseState {
  return {
    leftSidebar: parsed?.leftSidebar ?? DEFAULT_STATE.leftSidebar,
    rightSidebar: parsed?.rightSidebar ?? DEFAULT_STATE.rightSidebar,
    terminal: parsed?.terminal ?? DEFAULT_STATE.terminal,
    editor: parsed?.editor ?? DEFAULT_STATE.editor,
  };
}

function loadCollapseState(): CollapseState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeCollapseState(JSON.parse(stored) as Partial<CollapseState>) : cloneDefaultState();
  } catch {
    return cloneDefaultState();
  }
}

function saveCollapseState(state: CollapseState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

type CollapseUpdate = CollapseState | ((prev: CollapseState) => CollapseState);

function usePersistentCollapseState(): [CollapseState, (next: CollapseUpdate) => void] {
  const [collapsed, setCollapsed] = useState<CollapseState>(loadCollapseState);

  const update = useCallback((next: CollapseUpdate) => {
    setCollapsed((prev) => {
      const resolved = typeof next === 'function'
        ? (next as (state: CollapseState) => CollapseState)(prev)
        : next;
      saveCollapseState(resolved);
      return resolved;
    });
  }, []);

  return [collapsed, update];
}

function updatePanelState(state: CollapseState, panel: CollapseTarget, collapsed: boolean): CollapseState {
  if (state[panel] === collapsed) {
    return state;
  }
  return { ...state, [panel]: collapsed };
}

function parseShortcut(shortcut: string): ParsedShortcut | null {
  const parts = shortcut.split('+');
  const key = parts[parts.length - 1];
  if (!key) {
    return null;
  }
  return {
    ctrl: parts.includes('Ctrl'),
    shift: parts.includes('Shift'),
    alt: parts.includes('Alt'),
    key: key.toLowerCase(),
  };
}

function matchesShortcut(event: KeyboardEvent, parsed: ParsedShortcut): boolean {
  const key = event.key.toLowerCase();
  const ctrl = event.ctrlKey || event.metaKey;
  return ctrl === parsed.ctrl
    && event.shiftKey === parsed.shift
    && event.altKey === parsed.alt
    && key === parsed.key;
}

function getShortcutTarget(event: KeyboardEvent, keybindings: Record<string, string>): CollapseTarget | null {
  for (const [actionId, config] of Object.entries(DEFAULT_SHORTCUTS)) {
    const shortcut = keybindings[actionId] ?? config.shortcut;
    const parsed = parseShortcut(shortcut);
    if (parsed && matchesShortcut(event, parsed)) {
      return config.panel;
    }
  }
  return null;
}

function usePanelCollapseShortcuts(
  toggle: (panel: CollapseTarget) => void,
  keybindingsRef: MutableRefObject<Record<string, string>>,
): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = getShortcutTarget(event, keybindingsRef.current);
      if (!target) {
        return;
      }
      event.preventDefault();
      toggle(target);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle, keybindingsRef]);
}

export function usePanelCollapse(options?: UsePanelCollapseOptions): UsePanelCollapseReturn {
  const keybindingsRef = useRef<Record<string, string>>(options?.keybindings ?? {});
  keybindingsRef.current = options?.keybindings ?? {};

  const [collapsed, setCollapsed] = usePersistentCollapseState();
  const toggle = useCallback((panel: CollapseTarget) => {
    setCollapsed((prev) => ({ ...prev, [panel]: !prev[panel] }));
  }, [setCollapsed]);
  const collapse = useCallback((panel: CollapseTarget) => {
    setCollapsed((prev) => updatePanelState(prev, panel, true));
  }, [setCollapsed]);
  const expand = useCallback((panel: CollapseTarget) => {
    setCollapsed((prev) => updatePanelState(prev, panel, false));
  }, [setCollapsed]);
  const applyState = useCallback((state: CollapseState) => {
    setCollapsed(state);
  }, [setCollapsed]);

  usePanelCollapseShortcuts(toggle, keybindingsRef);
  return { collapsed, toggle, collapse, expand, applyState };
}
