/**
 * useOverlayDrawerWidths — Wave 89 Phase 3
 *
 * Thin persistence orchestration for the two overlay drawer widths:
 *   - overlayDrawerWidth  (utility drawer, default 380px)
 *   - artifactOverlayWidth (artifact pane, default 480px)
 *
 * Follows the useDockSlotHeights pattern: reads from / writes to the shared
 * `agent-ide:dock-persistence` localStorage key via dockPersistenceSchema.
 *
 * Each `onWidthChange` callback passed to OverlayDrawer writes the updated
 * value back to storage and mirrors to electron-store (non-critical path).
 */

import { useCallback, useState } from 'react';

import type {
  DockPersistenceData,
  RawDockPersistence,
} from '../../../../shared/config/dockPersistenceSchema';
import {
  DEFAULT_ARTIFACT_OVERLAY_WIDTH,
  DEFAULT_OVERLAY_DRAWER_WIDTH,
  migrateDockPersistence,
} from '../../../../shared/config/dockPersistenceSchema';

const PERSIST_KEY = 'agent-ide:dock-persistence';

// ---------------------------------------------------------------------------
// Persistence helpers (exported for tests)
// ---------------------------------------------------------------------------

export interface OverlayDrawerWidths {
  overlayDrawerWidth: number;
  artifactOverlayWidth: number;
}

export function loadOverlayWidths(): OverlayDrawerWidths {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RawDockPersistence;
      const { data } = migrateDockPersistence(parsed);
      return {
        overlayDrawerWidth: data.overlayDrawerWidth,
        artifactOverlayWidth: data.artifactOverlayWidth,
      };
    }
  } catch {
    // ignore — fall through to defaults
  }
  return {
    overlayDrawerWidth: DEFAULT_OVERLAY_DRAWER_WIDTH,
    artifactOverlayWidth: DEFAULT_ARTIFACT_OVERLAY_WIDTH,
  };
}

function buildOverlayWidthsPayload(
  existing: RawDockPersistence,
  widths: Partial<OverlayDrawerWidths>,
): DockPersistenceData {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { dockHeight: _legacy, ...rest } = existing; // drop legacy key (ADR #5)
  return {
    terminalDockSlots: rest.terminalDockSlots ?? { primary: 160, secondary: 100 },
    overlayDrawerWidth:
      widths.overlayDrawerWidth ?? rest.overlayDrawerWidth ?? DEFAULT_OVERLAY_DRAWER_WIDTH,
    artifactOverlayWidth:
      widths.artifactOverlayWidth ?? rest.artifactOverlayWidth ?? DEFAULT_ARTIFACT_OVERLAY_WIDTH,
  };
}

function mirrorToElectronStore(data: DockPersistenceData): void {
  if (typeof window !== 'undefined' && window.electronAPI?.config?.set) {
    window.electronAPI.config.set('dockPersistence', data).catch(() => {
      // Non-critical.
    });
  }
}

export function saveOverlayWidths(widths: Partial<OverlayDrawerWidths>): void {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    const existing: RawDockPersistence = raw ? (JSON.parse(raw) as RawDockPersistence) : {};
    const next = buildOverlayWidthsPayload(existing, widths);
    localStorage.setItem(PERSIST_KEY, JSON.stringify(next));
    mirrorToElectronStore(next);
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------

export interface UseOverlayDrawerWidthsReturn {
  overlayDrawerWidth: number;
  artifactOverlayWidth: number;
  setOverlayDrawerWidth: (w: number) => void;
  setArtifactOverlayWidth: (w: number) => void;
}

export function useOverlayDrawerWidths(): UseOverlayDrawerWidthsReturn {
  const [widths, setWidths] = useState<OverlayDrawerWidths>(loadOverlayWidths);

  const setOverlayDrawerWidth = useCallback((w: number) => {
    setWidths((prev) => {
      const next = { ...prev, overlayDrawerWidth: w };
      saveOverlayWidths({ overlayDrawerWidth: w });
      return next;
    });
  }, []);

  const setArtifactOverlayWidth = useCallback((w: number) => {
    setWidths((prev) => {
      const next = { ...prev, artifactOverlayWidth: w };
      saveOverlayWidths({ artifactOverlayWidth: w });
      return next;
    });
  }, []);

  return {
    overlayDrawerWidth: widths.overlayDrawerWidth,
    artifactOverlayWidth: widths.artifactOverlayWidth,
    setOverlayDrawerWidth,
    setArtifactOverlayWidth,
  };
}
