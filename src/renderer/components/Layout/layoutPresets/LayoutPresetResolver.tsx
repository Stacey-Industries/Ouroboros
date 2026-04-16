/**
 * LayoutPresetResolver — React context provider (Wave 17 + Wave 28 Phase B)
 *
 * Reads the active session's layoutPresetId (or falls back to ide-primary)
 * and exposes the resolved LayoutPreset via useLayoutPreset().
 *
 * Wave 28 Phase B adds:
 *  - `swapSlots(a, b)` mutation exposed on the context value
 *  - In-memory slot overrides layered on top of the resolved base preset
 *
 * When the feature flag layout.presets.v2 is off (default), always returns
 * idePrimaryPreset regardless of session state, but swapSlots still works on
 * the in-memory override layer.
 *
 * The resolver does NOT drive slot-component swapping in Wave 17.
 * It is a data-provision layer; Wave 20 consumers will read it.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { idePrimaryPreset, resolveBuiltInPreset } from './presets';
import type { ComponentDescriptor, LayoutPreset, SlotName } from './types';

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

export interface LayoutPresetContextValue {
  preset: LayoutPreset;
  /** Swap the ComponentDescriptors of two slots in the active preset (in-memory). */
  swapSlots: (a: SlotName, b: SlotName) => void;
}

const LayoutPresetContext = createContext<LayoutPresetContextValue>({
  preset: idePrimaryPreset,
  swapSlots: () => undefined,
});

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
  /**
   * Forces a specific preset id, bypassing the feature-flag check.
   * Used by dedicated chat windows (Wave 20 Phase B) where `?mode=chat`
   * must render the `chat-primary` preset regardless of `layout.presets.v2`.
   */
  forcePresetId?: string;
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

function resolveBasePreset(flagOn: boolean, sessionPresetId?: string, forcePresetId?: string): LayoutPreset {
  if (forcePresetId) return resolveBuiltInPreset(forcePresetId);
  if (!flagOn) return idePrimaryPreset;
  return resolveBuiltInPreset(sessionPresetId);
}

function applyOverrides(base: LayoutPreset, overrides: Partial<Record<SlotName, ComponentDescriptor>>): LayoutPreset {
  if (Object.keys(overrides).length === 0) return base;
  return { ...base, slots: { ...base.slots, ...overrides } };
}

function buildSwapOverrides(
  currentSlots: Partial<Record<SlotName, ComponentDescriptor>>,
  prev: Partial<Record<SlotName, ComponentDescriptor>>,
  a: SlotName,
  b: SlotName,
): Partial<Record<SlotName, ComponentDescriptor>> {
  const merged = { ...currentSlots, ...prev };
  const aDesc = merged[a];
  const bDesc = merged[b];
  const next = { ...prev };
  if (bDesc !== undefined) { next[a] = bDesc; } else { delete next[a]; }
  if (aDesc !== undefined) { next[b] = aDesc; } else { delete next[b]; }
  return next;
}

export function LayoutPresetResolverProvider({
  sessionPresetId,
  forcePresetId,
  children,
}: LayoutPresetResolverProps): React.ReactElement {
  const [flagOn, setFlagOn] = useState(false);
  const [slotOverrides, setSlotOverrides] = useState<Partial<Record<SlotName, ComponentDescriptor>>>({});

  useEffect(() => {
    let cancelled = false;
    void readPresetsFlag().then((v) => { if (!cancelled) setFlagOn(v); });
    return () => { cancelled = true; };
  }, []);

  const basePreset = useMemo(() => resolveBasePreset(flagOn, sessionPresetId, forcePresetId), [flagOn, forcePresetId, sessionPresetId]);
  const preset = useMemo(() => applyOverrides(basePreset, slotOverrides), [basePreset, slotOverrides]);

  const swapSlots = useCallback((a: SlotName, b: SlotName) => {
    setSlotOverrides((prev) => buildSwapOverrides(preset.slots, prev, a, b));
  }, [preset.slots]);

  const value = useMemo<LayoutPresetContextValue>(() => ({ preset, swapSlots }), [preset, swapSlots]);

  return (
    <LayoutPresetContext.Provider value={value}>
      {children}
    </LayoutPresetContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

/**
 * Returns the resolved LayoutPreset and slot-swap mutation for the current session.
 *
 * When layout.presets.v2 is off (default), always returns idePrimaryPreset.
 * Must be called inside a LayoutPresetResolverProvider.
 *
 * Wave 28 Phase B: destructure `{ preset, swapSlots }` to access the mutation.
 * For read-only consumers the `preset` field is a drop-in replacement for the
 * previous raw `LayoutPreset` return value.
 */
export function useLayoutPreset(): LayoutPresetContextValue {
  return useContext(LayoutPresetContext);
}
