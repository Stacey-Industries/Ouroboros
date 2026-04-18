/**
 * MobileLayoutContext.tsx
 *
 * Surfaces the mobileActivePanel state (owned by useMobileActivePanel) via
 * React context so any descendant can read or update the active panel without
 * prop-drilling through the layout tree.
 *
 * Wave 32 Phase D — mobile panel state lift to context.
 * Wave 32 Phase F — drawer + bottom sheet open/close state added.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { MobileActivePanelValue } from '../hooks/useMobileActivePanel';
import { useMobileActivePanel } from '../hooks/useMobileActivePanel';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MobileOverlayState {
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  isSheetOpen: boolean;
  activeSheetView: string | null;
  openSheet: (viewKey?: string) => void;
  closeSheet: () => void;
}

export type MobileLayoutValue = MobileActivePanelValue & MobileOverlayState;

// ── Context ───────────────────────────────────────────────────────────────────

const MobileLayoutContext = createContext<MobileLayoutValue | null>(null);

// ── Overlay state hook ────────────────────────────────────────────────────────

function useMobileOverlayState(): MobileOverlayState {
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [activeSheetView, setActiveSheetView] = useState<string | null>(null);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const openSheet = useCallback((viewKey?: string) => {
    setActiveSheetView(viewKey ?? null);
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setActiveSheetView(null);
  }, []);

  return { isDrawerOpen, openDrawer, closeDrawer, isSheetOpen, activeSheetView, openSheet, closeSheet };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function MobileLayoutProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const panel = useMobileActivePanel();
  const overlay = useMobileOverlayState();

  const value = useMemo<MobileLayoutValue>(
    () => ({
      activePanel: panel.activePanel,
      setActivePanel: panel.setActivePanel,
      isDrawerOpen: overlay.isDrawerOpen,
      openDrawer: overlay.openDrawer,
      closeDrawer: overlay.closeDrawer,
      isSheetOpen: overlay.isSheetOpen,
      activeSheetView: overlay.activeSheetView,
      openSheet: overlay.openSheet,
      closeSheet: overlay.closeSheet,
    }),
    [
      panel.activePanel,
      panel.setActivePanel,
      overlay.isDrawerOpen,
      overlay.openDrawer,
      overlay.closeDrawer,
      overlay.isSheetOpen,
      overlay.activeSheetView,
      overlay.openSheet,
      overlay.closeSheet,
    ],
  );

  return (
    <MobileLayoutContext.Provider value={value}>
      {children}
    </MobileLayoutContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMobileLayout(): MobileLayoutValue {
  const ctx = useContext(MobileLayoutContext);
  if (!ctx) throw new Error('useMobileLayout must be used inside <MobileLayoutProvider>');
  return ctx;
}
