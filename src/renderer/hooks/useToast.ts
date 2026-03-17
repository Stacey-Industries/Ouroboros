/**
 * useToast.ts — Toast notification state management hook.
 *
 * Manages a queue of toast notifications with auto-dismiss, FIFO overflow,
 * and manual dismiss/dismissAll support. Also maintains a persistent
 * notification center history (last N notifications).
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  /** Auto-dismiss duration in ms. Defaults to 4000. Set to 0 to disable. */
  duration?: number;
  /** Optional action button */
  action?: { label: string; onClick: () => void };
  /** If true, the toast will not auto-dismiss (duration is ignored). */
  persistent?: boolean;
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

/** An entry stored in the notification center history. */
export interface NotificationEntry {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
  read: boolean;
  action?: { label: string; onClick: () => void };
}

export interface UseToastReturn {
  toasts: ToastItem[];
  toast: (message: string, type?: ToastType, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  /** Persistent notification history for the notification center. */
  notifications: NotificationEntry[];
  /** Number of unread notifications. */
  unreadCount: number;
  /** Mark all notifications as read. */
  markAllRead: () => void;
  /** Remove a single notification from the center. */
  removeNotification: (id: string) => void;
  /** Clear all notifications from the center. */
  clearAllNotifications: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 5;
const DEFAULT_DURATION = 4000;
const DISMISS_ANIMATION_MS = 300;
const MAX_NOTIFICATION_HISTORY = 50;

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
  timers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  setToasts((prev) =>
    prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)),
  );
  const animTimer = setTimeout(() => {
    timers.delete(`dismiss-${id}`);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, DISMISS_ANIMATION_MS);
  timers.set(`dismiss-${id}`, animTimer);
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
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  const scheduleAutoDismiss = useCallback((id: string, duration: number) => {
    if (duration <= 0) return;
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      startDismissAnimation(setToasts, id, timersRef.current);
    }, duration);
    timersRef.current.set(id, timer);
  }, []);

  const addNotification = useCallback(
    (id: string, message: string, type: ToastType, action?: { label: string; onClick: () => void }) => {
      const entry: NotificationEntry = {
        id, message, type, createdAt: Date.now(), read: false, action,
      };
      setNotifications((prev) => {
        const next = [entry, ...prev];
        return next.length > MAX_NOTIFICATION_HISTORY
          ? next.slice(0, MAX_NOTIFICATION_HISTORY)
          : next;
      });
    },
    [],
  );

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', options?: ToastOptions): string => {
      const id = generateToastId();
      const effectiveDuration = options?.persistent ? 0 : (options?.duration ?? DEFAULT_DURATION);
      const item = createToastItem(id, message, type, { ...options, duration: effectiveDuration });
      setToasts((prev) => applyFifoOverflow([...prev, item], timersRef.current));
      scheduleAutoDismiss(id, item.duration);
      // Also store in persistent notification history
      addNotification(id, message, type, options?.action);
      return id;
    },
    [scheduleAutoDismiss, addNotification],
  );

  const dismiss = useCallback((id: string) => {
    clearTimerForId(timersRef.current, id);
    startDismissAnimation(setToasts, id, timersRef.current);
  }, []);

  const dismissAll = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.clear();
    setToasts((prev) => prev.map((t) => ({ ...t, dismissing: true })));
    const dismissAllTimer = setTimeout(() => {
      timersRef.current.delete('dismiss-all');
      setToasts([]);
    }, DISMISS_ANIMATION_MS);
    timersRef.current.set('dismiss-all', dismissAllTimer);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    toasts, toast: addToast, dismiss, dismissAll,
    notifications, unreadCount, markAllRead, removeNotification, clearAllNotifications,
  };
}
