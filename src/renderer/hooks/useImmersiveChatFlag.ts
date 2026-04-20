/**
 * useImmersiveChatFlag — reads and live-toggles the immersive-chat feature flag.
 *
 * Modelled on `useChatPrimaryFlag` in LayoutPresetResolver.tsx.
 * - Initial value: read from `config.layout.immersiveChat` via `getAll()`.
 * - Live toggle: subscribes to `agent-ide:toggle-immersive-chat` DOM event;
 *   flips local state and persists the new value via `config.set`.
 *
 * Note: `isChatWindow` (from useChatWindowMode) reads the query string once at
 * boot — it does not update live. `immersiveFlag` covers the live-toggle case;
 * both compose with OR in InnerApp.
 */

import { useEffect, useState } from 'react';

import type { AppConfig } from '../types/electron-foundation';
import { TOGGLE_IMMERSIVE_CHAT_EVENT } from './appEventNames';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

// Exported for testing — stable pure async reader.
export async function readFlag(): Promise<boolean> {
  if (!hasElectronAPI()) return false;
  try {
    const cfg = await window.electronAPI.config.getAll();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cfg as any)?.layout?.immersiveChat === true;
  } catch {
    return false;
  }
}

export const __testing = { readFlag };

async function persistFlag(value: boolean): Promise<void> {
  if (!hasElectronAPI()) return;
  try {
    const cfg = await window.electronAPI.config.getAll();
    const merged = { ...(cfg?.layout ?? {}), immersiveChat: value };
    await window.electronAPI.config.set('layout', merged as unknown as AppConfig['layout']);
  } catch {
    // Best-effort persist; UI state already flipped.
  }
}

export function useImmersiveChatFlag(): boolean {
  const [flagOn, setFlagOn] = useState(false);

  // Read initial value from config on mount.
  useEffect(() => {
    let cancelled = false;
    void readFlag().then((v) => { if (!cancelled) setFlagOn(v); });
    return () => { cancelled = true; };
  }, []);

  // Subscribe to live toggle event.
  useEffect(() => {
    const handler = (): void => {
      setFlagOn((prev) => {
        const next = !prev;
        void persistFlag(next);
        return next;
      });
    };
    window.addEventListener(TOGGLE_IMMERSIVE_CHAT_EVENT, handler);
    return () => { window.removeEventListener(TOGGLE_IMMERSIVE_CHAT_EVENT, handler); };
  }, []);

  return flagOn;
}
