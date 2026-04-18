/**
 * MobileOverflowMenu — phone-only ⋯ overflow button + tap dropdown.
 *
 * On phone viewports replaces hover-only action toolbars with a persistent
 * ⋯ button. Tapping it opens a compact popover anchored below the button
 * listing the same actions. The popover closes on outside tap or Escape.
 *
 * On non-phone viewports this component renders nothing — the caller renders
 * the normal hover toolbar instead.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useViewportBreakpoint } from '../../hooks/useViewportBreakpoint';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OverflowAction {
  label: string;
  title?: string;
  onClick: () => void;
  /** If true, render with a warning-tone colour. */
  danger?: boolean;
}

export interface MobileOverflowMenuProps {
  actions: OverflowAction[];
  /** Extra class names on the trigger ⋯ button. */
  buttonClassName?: string;
}

// ── Popover dismiss hook ──────────────────────────────────────────────────────

function usePopoverDismiss(
  open: boolean,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  popoverRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent): void {
      const target = e.target as Node;
      const outside =
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target);
      if (outside) onClose();
    }
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, triggerRef, popoverRef, onClose]);
}

// ── Popover ───────────────────────────────────────────────────────────────────

const POPOVER_STYLE: React.CSSProperties = {
  position: 'fixed', minWidth: 140, zIndex: 9999,
  backgroundColor: 'var(--surface-overlay)',
  border: '1px solid var(--border-subtle)', borderRadius: 8,
  boxShadow: '0 4px 16px color-mix(in srgb, var(--surface-base) 40%, transparent)',
  padding: '4px 0',
};

function actionItemStyle(danger?: boolean): React.CSSProperties {
  return {
    display: 'flex', width: '100%', alignItems: 'center',
    padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '0.8125rem', fontFamily: 'var(--font-ui)', textAlign: 'left', gap: 8,
    color: danger ? 'var(--status-error)' : 'var(--text-primary)',
  };
}

function OverflowPopover({ popoverRef, rect, actions, onClose }: {
  popoverRef: React.RefObject<HTMLDivElement | null>;
  rect: DOMRect; actions: OverflowAction[]; onClose: () => void;
}): React.ReactElement {
  return createPortal(
    <div ref={popoverRef} role="menu"
      style={{ ...POPOVER_STYLE, top: rect.bottom + 4, right: window.innerWidth - rect.right }}>
      {actions.map((action) => (
        <button key={action.label} role="menuitem" type="button"
          title={action.title ?? action.label}
          onClick={() => { action.onClick(); onClose(); }}
          style={actionItemStyle(action.danger)}>
          {action.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function MobileOverflowMenu({
  actions,
  buttonClassName = '',
}: MobileOverflowMenuProps): React.ReactElement | null {
  const breakpoint = useViewportBreakpoint();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const handleClose = useCallback(() => setOpen(false), []);

  usePopoverDismiss(open, triggerRef, popoverRef, handleClose);

  if (breakpoint !== 'phone') return null;

  const rect = triggerRef.current?.getBoundingClientRect();
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-center rounded px-1.5 py-0.5 text-text-semantic-muted transition-colors duration-100 hover:bg-surface-hover hover:text-text-semantic-primary ${buttonClassName}`}
        style={{ fontSize: '1rem', lineHeight: 1, minWidth: 28, minHeight: 28 }}
      >
        &#x22EF;
      </button>
      {open && rect && (
        <OverflowPopover
          popoverRef={popoverRef}
          rect={rect}
          actions={actions}
          onClose={handleClose}
        />
      )}
    </>
  );
}
