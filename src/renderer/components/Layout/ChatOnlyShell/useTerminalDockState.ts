import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'agent-ide:chat-workbench-terminal-dock';
const DEFAULT_HEIGHT = 240;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;

export interface TerminalDockState {
  visible: boolean;
  height: number;
}

export interface TerminalDockApi extends TerminalDockState {
  toggleVisible: () => void;
  setVisible: (next: boolean) => void;
  setHeight: (px: number) => void;
}

function clampHeight(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HEIGHT;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(value)));
}

function readPersisted(): TerminalDockState {
  if (typeof window === 'undefined') return { visible: false, height: DEFAULT_HEIGHT };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { visible: false, height: DEFAULT_HEIGHT };
    const parsed = JSON.parse(raw) as Partial<TerminalDockState>;
    return {
      visible: Boolean(parsed.visible),
      height: clampHeight(typeof parsed.height === 'number' ? parsed.height : DEFAULT_HEIGHT),
    };
  } catch {
    return { visible: false, height: DEFAULT_HEIGHT };
  }
}

function persist(state: TerminalDockState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors — non-critical state.
  }
}

export function useTerminalDockState(): TerminalDockApi {
  const [state, setState] = useState<TerminalDockState>(() => readPersisted());

  useEffect(() => {
    persist(state);
  }, [state]);

  const toggleVisible = useCallback(() => {
    setState((prev) => ({ ...prev, visible: !prev.visible }));
  }, []);
  const setVisible = useCallback((next: boolean) => {
    setState((prev) => ({ ...prev, visible: next }));
  }, []);
  const setHeight = useCallback((px: number) => {
    setState((prev) => ({ ...prev, height: clampHeight(px) }));
  }, []);

  return { ...state, toggleVisible, setVisible, setHeight };
}

export const TERMINAL_DOCK_CONSTANTS = {
  MIN_HEIGHT,
  MAX_HEIGHT,
  DEFAULT_HEIGHT,
} as const;
