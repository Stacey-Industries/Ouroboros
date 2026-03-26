/**
 * Toast.tsx — Toast notification components.
 *
 * ToastContainer: fixed-position container in bottom-right corner.
 * ToastItemView: individual toast with icon, message, optional action, close button,
 *   and a progress bar for auto-dismiss countdown.
 *
 * Styling uses CSS custom properties for theme compatibility.
 * Animations use CSS keyframes (no JS animation).
 */

import React, { memo, useEffect, useRef, useState } from 'react';

import type { ToastItem, ToastType } from '../../hooks/useToast';

// ── Style constants ──────────────────────────────────────────────────────────

const TOAST_STYLES = `
@keyframes toast-slide-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes toast-fade-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

@keyframes toast-progress {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}
`;

// ── Color mapping per toast type ─────────────────────────────────────────────

function getTypeColor(type: ToastType): string {
  switch (type) {
    case 'success':
      return 'var(--status-success)';
    case 'error':
      return 'var(--status-error)';
    case 'warning':
      return 'var(--status-warning)';
    case 'info':
    default:
      return 'var(--interactive-accent)';
  }
}

// ── Icons per toast type (inline SVGs) ───────────────────────────────────────

function ToastIconSuccess({ color, size }: { color: string; size: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
      <path
        d="M5 8l2 2 4-4"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ToastIconError({ color, size }: { color: string; size: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
      <path d="M6 6l4 4M10 6l-4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ToastIconWarning({ color, size }: { color: string; size: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.5l6.93 12H1.07L8 1.5z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 6.5v3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.75" fill={color} />
    </svg>
  );
}

function ToastIconInfo({ color, size }: { color: string; size: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke={color} strokeWidth="1.5" />
      <path d="M8 7v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="4.75" r="0.75" fill={color} />
    </svg>
  );
}

function ToastIcon({ type }: { type: ToastType }): React.ReactElement {
  const color = getTypeColor(type);
  const size = 16;
  if (type === 'success') return <ToastIconSuccess color={color} size={size} />;
  if (type === 'error') return <ToastIconError color={color} size={size} />;
  if (type === 'warning') return <ToastIconWarning color={color} size={size} />;
  return <ToastIconInfo color={color} size={size} />;
}

// ── Close button ─────────────────────────────────────────────────────────────

function CloseButton({ onClick }: { onClick: () => void }): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Dismiss notification"
      className="text-text-semantic-muted"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '20px',
        height: '20px',
        padding: 0,
        border: 'none',
        borderRadius: '4px',
        background: hovered ? 'rgba(128,128,128,0.2)' : 'transparent',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

// ── Individual toast ─────────────────────────────────────────────────────────

interface ToastItemViewProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

function useToastProgressPause(
  elRef: React.RefObject<HTMLDivElement | null>,
  paused: boolean,
): void {
  useEffect(() => {
    if (!elRef.current) return;
    const bar = elRef.current.querySelector('[data-toast-progress]') as HTMLElement | null;
    if (bar) bar.style.animationPlayState = paused ? 'paused' : 'running';
  }, [elRef, paused]);
}

function buildToastItemStyle(typeColor: string, dismissing: boolean): React.CSSProperties {
  return {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 12px',
    minWidth: '280px',
    maxWidth: '400px',
    borderLeft: `3px solid ${typeColor}`,
    borderRadius: '6px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
    fontFamily: 'var(--font-ui)',
    fontSize: '0.8125rem',
    lineHeight: '1.4',
    overflow: 'hidden',
    animation: dismissing
      ? 'toast-fade-out 300ms ease-in forwards'
      : 'toast-slide-in 300ms ease-out',
  };
}

function buildToastActionStyle(typeColor: string): React.CSSProperties {
  return {
    display: 'inline-block',
    marginLeft: '8px',
    padding: '0 4px',
    border: 'none',
    borderRadius: '3px',
    background: 'transparent',
    color: typeColor,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: 600,
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  };
}

function ToastMessage({
  item,
  typeColor,
}: {
  item: ToastItem;
  typeColor: string;
}): React.ReactElement {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <span style={{ wordBreak: 'break-word' }}>{item.message}</span>
      {item.action && (
        <button
          type="button"
          onClick={item.action.onClick}
          style={buildToastActionStyle(typeColor)}
        >
          {item.action.label}
        </button>
      )}
    </div>
  );
}

function ToastProgressBar({
  item,
  typeColor,
}: {
  item: ToastItem;
  typeColor: string;
}): React.ReactElement | null {
  if (item.duration <= 0 || item.dismissing) return null;

  return (
    <div
      data-toast-progress
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        height: '2px',
        background: typeColor,
        opacity: 0.5,
        animation: `toast-progress ${item.duration}ms linear forwards`,
      }}
    />
  );
}

const ToastItemView = memo(function ToastItemView({
  item,
  onDismiss,
}: ToastItemViewProps): React.ReactElement {
  const typeColor = getTypeColor(item.type);
  const elRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  useToastProgressPause(elRef, paused);

  return (
    <div
      ref={elRef}
      role="alert"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="bg-surface-panel border border-border-semantic text-text-semantic-primary"
      style={buildToastItemStyle(typeColor, item.dismissing ?? false)}
    >
      <div style={{ flexShrink: 0, marginTop: '1px' }}>
        <ToastIcon type={item.type} />
      </div>
      <ToastMessage item={item} typeColor={typeColor} />
      <CloseButton onClick={() => onDismiss(item.id)} />
      <ToastProgressBar item={item} typeColor={typeColor} />
    </div>
  );
});

// ── Container ────────────────────────────────────────────────────────────────

export interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer = memo(function ToastContainer({
  toasts,
  onDismiss,
}: ToastContainerProps): React.ReactElement | null {
  if (toasts.length === 0) return null;

  return (
    <>
      <style>{TOAST_STYLES}</style>
      <div
        aria-live="polite"
        aria-label="Notifications"
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((item) => (
          <div key={item.id} style={{ pointerEvents: 'auto' }}>
            <ToastItemView item={item} onDismiss={onDismiss} />
          </div>
        ))}
      </div>
    </>
  );
});
