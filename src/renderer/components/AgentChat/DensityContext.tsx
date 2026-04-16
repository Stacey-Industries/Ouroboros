/**
 * DensityContext.tsx — Chat message density state.
 *
 * Reads `chat.density` from config and provides { density, setDensity }
 * to the AgentChat subtree. Density controls vertical padding and text
 * sizing on message cards.
 */

import React, { createContext, useCallback, useContext, useMemo } from 'react';

import { useConfig } from '../../hooks/useConfig';

// ── Types ────────────────────────────────────────────────────────────────────

export type ChatDensity = 'comfortable' | 'compact';

export interface DensityContextValue {
  density: ChatDensity;
  setDensity: (density: ChatDensity) => void;
}

// ── Context ──────────────────────────────────────────────────────────────────

const DensityContext = createContext<DensityContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function DensityProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { config, set } = useConfig();

  const density: ChatDensity = (config?.chat?.density as ChatDensity | undefined) ?? 'comfortable';

  const setDensity = useCallback(
    (next: ChatDensity) => {
      void set('chat', { density: next });
    },
    [set],
  );

  const value = useMemo<DensityContextValue>(() => ({ density, setDensity }), [density, setDensity]);

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

// ── Consumer hook ────────────────────────────────────────────────────────────

export function useDensity(): DensityContextValue {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error('useDensity must be used inside <DensityProvider>');
  return ctx;
}
