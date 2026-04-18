/**
 * DispatchNotificationBanner.tsx — Wave 34 Phase F.
 *
 * Listens for `sessionDispatch:notification` IPC events and surfaces them as
 * toasts via the existing ToastContext infrastructure. Up to 3 banners are
 * queued; each auto-dismisses after 6 seconds. Click-to-dismiss is handled
 * by the shared Toast component.
 *
 * Renders nothing — purely a side-effect component. Mount once inside a
 * ToastProvider subtree (e.g. inside ConfiguredApp or InnerApp).
 */

import { useEffect } from 'react';

import { useToastContext } from '../../contexts/ToastContext';

// Inline type mirrors sessionDispatchNotifier.DispatchNotificationPayload — renderer
// cannot import from src/main at runtime.
interface DispatchNotificationPayload {
  jobId: string;
  title: string;
  body: string;
  status: 'completed' | 'failed';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BANNER_DURATION_MS = 6_000;
const MAX_QUEUED = 3;

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Subscribes to `sessionDispatch:notification` and fires toasts.
 * Must be rendered inside a `<ToastProvider>`.
 */
export function DispatchNotificationBanner(): null {
  const { toast, toasts } = useToastContext();

  useEffect(() => {
    if (!window.electronAPI?.sessions?.onDispatchNotification) return;

    const cleanup = window.electronAPI.sessions.onDispatchNotification(
      (payload: DispatchNotificationPayload) => {
        if (toasts.length >= MAX_QUEUED) return;
        const type = payload.status === 'completed' ? 'success' : 'error';
        toast(`${payload.title}: ${payload.body}`, type, { duration: BANNER_DURATION_MS });
      },
    );

    return cleanup;
  }, [toast, toasts.length]);

  return null;
}
