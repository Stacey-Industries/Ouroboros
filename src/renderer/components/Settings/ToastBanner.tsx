/**
 * ToastBanner.tsx — Inline toast notification for settings sections.
 */

import React from 'react';

import type { ToastState } from './useToast';

interface ToastBannerProps {
  toast: ToastState | null;
}

export function ToastBanner({ toast }: ToastBannerProps): React.ReactElement<any> | null {
  if (!toast) return null;

  const isSuccess = toast.kind === 'success';
  const color = isSuccess ? 'var(--status-success)' : 'var(--status-error)';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: '10px 14px',
        borderRadius: '6px',
        border: `1px solid ${color}`,
        background: `color-mix(in srgb, ${color} 10%, var(--surface-panel))`,
        fontSize: '12px',
        color,
        fontWeight: 500,
      }}
    >
      {toast.message}
    </div>
  );
}
