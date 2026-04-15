/**
 * LayoutPresetResolver — React context provider (Wave 17)
 *
 * Reads the active session's layoutPresetId (or falls back to ide-primary)
 * and exposes the resolved LayoutPreset via useLayoutPreset().
 *
 * When the feature flag layout.presets.v2 is off (default), always returns
 * idePrimaryPreset regardless of session state.
 *
 * The resolver does NOT drive slot-component swapping in Wave 17.
 * It is a data-provision layer; Wave 20 consumers will read it.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { idePrimaryPreset, resolveBuiltInPreset } from './presets';
import type { LayoutPreset } from './types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const LayoutPresetContext = createContext<LayoutPreset>(idePrimaryPreset);

// ---------------------------------------------------------------------------
// Provider props
// ---------------------------------------------------------------------------

export interface LayoutPresetResolverProps {
  /**
   * The layoutPresetId from the active Session record.
   * Pass undefined when no session is active — falls back to ide-primary.
   * Wave 20 will wire this from the session store.
   */
  sessionPresetId?: string;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Feature-flag reader
// ---------------------------------------------------------------------------

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

async function readPresetsFlag(): Promise<boolean> {
  if (!hasElectronAPI()) return false;
  try {
    const cfg = await window.electronAPI.config.getAll();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cfg as any)?.layout?.presets?.v2 === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LayoutPresetResolverProvider({
  sessionPresetId,
  children,
}: LayoutPresetResolverProps): React.ReactElement {
  const [flagOn, setFlagOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readPresetsFlag().then((v) => {
      if (!cancelled) setFlagOn(v);
    });
    return () => { cancelled = true; };
  }, []);

  const preset = useMemo<LayoutPreset>(() => {
    if (!flagOn) return idePrimaryPreset;
    return resolveBuiltInPreset(sessionPresetId);
  }, [flagOn, sessionPresetId]);

  return (
    <LayoutPresetContext.Provider value={preset}>
      {children}
    </LayoutPresetContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

/**
 * Returns the resolved LayoutPreset for the current session.
 *
 * When layout.presets.v2 is off (default), always returns idePrimaryPreset.
 * Must be called inside a LayoutPresetResolverProvider.
 */
export function useLayoutPreset(): LayoutPreset {
  return useContext(LayoutPresetContext);
}
