/**
 * useToast.ts — Toast notification state management hook.
 *
 * Manages a queue of toast notifications with auto-dismiss, FIFO overflow,
 * and manual dismiss/dismissAll support.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

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

function generateToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createToastItem(
  id: string, message: string, type: ToastType, options?: ToastOptions,
): ToastItem {
  return {
    id, message, type,
    duration: options?.duration ?? DEFAULT_DURATION,
    createdAt: Date.now(),
    action: options?.action,
  };
}

function applyFifoOverflow(
  next: ToastItem[],
  timers: Map<string, ReturnType<typeof setTimeout>>,
): ToastItem[] {
  if (next.length <= MAX_VISIBLE) return next;
  const overflow = next.slice(0, next.length - MAX_VISIBLE);
  overflow.forEach((t) => {
    const existingTimer = timers.get(t.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      timers.delete(t.id);
    }
  });
  return next.slice(next.length - MAX_VISIBLE);
}

function startDismissAnimation(
  setToasts: React.Dispatch<React.SetStateAction<ToastItem[]>>,
  id: string,
): void {
  setToasts((prev) =>
    prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)),
  );
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, DISMISS_ANIMATION_MS);
}

function clearTimerForId(
  timers: Map<string, ReturnType<typeof setTimeout>>, id: string,
): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  const scheduleAutoDismiss = useCallback((id: string, duration: number) => {
    if (duration <= 0) return;
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      startDismissAnimation(setToasts, id);
    }, duration);
    timersRef.current.set(id, timer);
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', options?: ToastOptions): string => {
      const id = generateToastId();
      const item = createToastItem(id, message, type, options);
      setToasts((prev) => applyFifoOverflow([...prev, item], timersRef.current));
      scheduleAutoDismiss(id, item.duration);
      return id;
    },
    [scheduleAutoDismiss],
  );

  const dismiss = useCallback((id: string) => {
    clearTimerForId(timersRef.current, id);
    startDismissAnimation(setToasts, id);
  }, []);

  const dismissAll = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
    setToasts((prev) => prev.map((t) => ({ ...t, dismissing: true })));
    setTimeout(() => { setToasts([]); }, DISMISS_ANIMATION_MS);
  }, []);

  return { toasts, toast: addToast, dismiss, dismissAll };
}
