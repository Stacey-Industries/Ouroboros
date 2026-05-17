/**
 * OverlayDrawer — non-modal full-height drawer that slides in from the right,
 * anchored to its nearest positioned ancestor (NOT the viewport).
 *
 * Wave 89 Phase 2. Used by ChatWorkbenchUtilityDrawer and ChatWorkbenchArtifactPane
 * in Phase 3. Ships only the primitive here — no consumer migration.
 *
 * z-index: 200 — between in-layout content (z-10/z-20) and full-screen modals
 * (ChatSearchOverlay z-900, ChatOnlySettingsOverlay z-900, KeyboardShortcutCheatSheet
 * z-9998, ChatOnlyUserMenu z-9999). Sits in the same tier as mobile overlay surfaces.
 *
 * Decision 4 (locked): NON-MODAL forever. No focus trap, no role="dialog",
 * no route blocking. Chat composer underneath stays keyboard-focusable.
 *
 * Backdrop tint: rgba(0,0,0,0.35) — allowed renderer-rule exception for scrim
 * opacity overlays. NOT a semantic color token; using var(--surface-scroll-track)
 * at 30% was rejected because mica/vibrancy forces --bg transparent, causing
 * desktop bleed through a semi-transparent token.
 */

import React, { type ReactNode, useCallback, useEffect, useRef } from 'react';

// ─── Sub-components ────────────────────────────────────────────────────────────

interface BackdropProps {
  onClick: () => void;
  drawerWidth: number;
}

function Backdrop({ onClick, drawerWidth }: BackdropProps): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      // hardcoded: opacity scrim — non-semantic overlay, rgba(0,0,0,*) allowed per renderer.md
      style={{ right: drawerWidth }}
      className="absolute inset-y-0 left-0 cursor-default"
      // hardcoded: scrim — opacity overlay, not a semantic color
      onClick={onClick}
      data-testid="overlay-drawer-backdrop"
    >
      {/* Inner div carries the tint so the outer can be sized via style */}
      <div
        className="absolute inset-0"
        // hardcoded: rgba(0,0,0,0.35) — scrim opacity overlay, allowed per renderer.md
        style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
      />
    </div>
  );
}

interface WidthHandleProps {
  onDrag: (newWidth: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function WidthHandle({ onDrag, containerRef }: WidthHandleProps): React.ReactElement {
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const container = containerRef.current;
      if (!container) return;
      const startWidth = container.getBoundingClientRect().width;

      const handleMove = (moveEvent: PointerEvent): void => {
        const delta = startX - moveEvent.clientX;
        onDrag(Math.max(120, startWidth + delta));
      };

      const handleUp = (): void => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [onDrag, containerRef],
  );

  return (
    <div
      className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-interactive-accent/40 active:bg-interactive-accent"
      onPointerDown={handlePointerDown}
      data-testid="overlay-drawer-handle"
      aria-hidden="true"
    />
  );
}

// ─── Escape key hook ───────────────────────────────────────────────────────────

function useEscapeKey(open: boolean, onClose: () => void): void {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    // Bind on the capture phase so we intercept before bubbling consumers,
    // but scoped — we stopPropagation so the composer underneath is not affected.
    // We attach to 'window' here but stop propagation immediately; the drawer
    // is visible and this is the expected affordance when the drawer has focus.
    // NOT stealing from the composer: the composer handles Escape on its own
    // element; our handler fires first but we only close-and-stop when open.
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [open, handleKeyDown]);
}

// ─── Main component ────────────────────────────────────────────────────────────

export interface OverlayDrawerProps {
  open: boolean;
  onClose: () => void;
  width: number;
  onWidthChange?: (width: number) => void;
  children: ReactNode;
  dataTestId?: string;
}

export function OverlayDrawer({
  open,
  onClose,
  width,
  onWidthChange,
  children,
  dataTestId,
}: OverlayDrawerProps): React.ReactElement | null {
  const containerRef = useRef<HTMLDivElement>(null);

  useEscapeKey(open, onClose);

  // Slide transform: closed = fully off-screen to the right
  const translate = open ? 'translate-x-0' : 'translate-x-full';

  return (
    // Positioned container — must be inside a `position: relative` ancestor
    // (Phase 3 wraps the chat-area in one) so `absolute` here anchors to that
    // area, NOT the viewport.
    // z-index: 200 — see module header for tier rationale.
    <div className="absolute inset-0 z-[200] pointer-events-none overflow-hidden">
      {open && <Backdrop onClick={onClose} drawerWidth={width} />}
      <div
        ref={containerRef}
        className={`absolute inset-y-0 right-0 flex flex-col bg-surface-overlay shadow-xl transition-transform duration-200 ease-in-out pointer-events-auto ${translate}`}
        style={{ width }}
        data-testid={dataTestId ?? 'overlay-drawer'}
      >
        {onWidthChange && <WidthHandle onDrag={onWidthChange} containerRef={containerRef} />}
        {children}
      </div>
    </div>
  );
}
