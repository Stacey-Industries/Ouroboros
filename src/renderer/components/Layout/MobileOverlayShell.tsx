/**
 * MobileOverlayShell.tsx — shared scrim + focus trap + body scroll lock.
 *
 * Extracted from MobileDrawer and MobileBottomSheet to stay under 300 lines
 * each. Both overlays compose this shell and add their own slide animation.
 *
 * Wave 32 Phase F — mobile drawer + bottom sheet primitives.
 */

import React, { useCallback, useEffect, useRef } from 'react';

// ── Focus trap ────────────────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
}

export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen || !ref.current) return;

    const previous = document.activeElement as HTMLElement | null;
    const focusable = getFocusable(ref.current);
    if (focusable.length > 0) focusable[0].focus();

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Tab' || !ref.current) return;
      const items = getFocusable(ref.current);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [isOpen, ref]);
}

// ── Body scroll lock ──────────────────────────────────────────────────────────

export function useBodyScrollLock(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);
}

// ── Scrim ─────────────────────────────────────────────────────────────────────

const SCRIM_STYLE: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  background: 'rgba(0, 0, 0, 0.45)', // hardcoded: opacity scrim — non-semantic overlay, no design token equivalent
};

interface ScrimProps {
  onClose: () => void;
}

export function Scrim({ onClose }: ScrimProps): React.ReactElement {
  return (
    <div
      role="presentation"
      style={SCRIM_STYLE}
      onClick={onClose}
      aria-hidden="true"
    />
  );
}

// ── Escape key handler ────────────────────────────────────────────────────────

export function useEscapeKey(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);
}

// ── useOverlayCallbacks ───────────────────────────────────────────────────────

export function useOverlayCallbacks(onClose: () => void): {
  stableClose: () => void;
} {
  const stableClose = useCallback(onClose, [onClose]);
  return { stableClose };
}
