/**
 * useToast.ts — Toast notification state management hook.
 *
 * Manages a queue of toast notifications with auto-dismiss, FIFO overflow,
 * and manual dismiss/dismissAll support.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  /** Auto-dismiss duration in ms. Defaults to 4000. Set to 0 to disable. */
  duration?: number;
  /** Optional action button */
  action?: { label: string; onClick: () => void };
}

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  createdAt: number;
  action?: { label: string; onClick: () => void };
  /** Set to true when the toast is being dismissed (for exit animation). */
  dismissing?: boolean;
}

export interface UseToastReturn {
  toasts: ToastItem[];
  toast: (message: string, type?: ToastType, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 5;
const DEFAULT_DURATION = 4000;
const DISMISS_ANIMATION_MS = 300;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, []);

  const scheduleAutoDismiss = useCallback((id: string, duration: number) => {
    if (duration <= 0) return;

    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      // Start dismiss animation
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)),
      );
      // Remove after animation completes
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, DISMISS_ANIMATION_MS);
    }, duration);

    timersRef.current.set(id, timer);
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', options?: ToastOptions): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = options?.duration ?? DEFAULT_DURATION;

      const item: ToastItem = {
        id,
        message,
        type,
        duration,
        createdAt: Date.now(),
        action: options?.action,
      };

      setToasts((prev) => {
        const next = [...prev, item];
        // FIFO: dismiss oldest when exceeding max
        if (next.length > MAX_VISIBLE) {
          const overflow = next.slice(0, next.length - MAX_VISIBLE);
          overflow.forEach((t) => {
            const existingTimer = timersRef.current.get(t.id);
            if (existingTimer) {
              clearTimeout(existingTimer);
              timersRef.current.delete(t.id);
            }
          });
          return next.slice(next.length - MAX_VISIBLE);
        }
        return next;
      });

      scheduleAutoDismiss(id, duration);
      return id;
    },
    [scheduleAutoDismiss],
  );

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    // Start dismiss animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)),
    );
    // Remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DISMISS_ANIMATION_MS);
  }, []);

  const dismissAll = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
    setToasts((prev) => prev.map((t) => ({ ...t, dismissing: true })));
    setTimeout(() => {
      setToasts([]);
    }, DISMISS_ANIMATION_MS);
  }, []);

  return { toasts, toast: addToast, dismiss, dismissAll };
}
