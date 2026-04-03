/**
 * useToast.ts — Toast notification state management hook.
 *
 * Manages a queue of toast notifications with auto-dismiss, FIFO overflow,
 * and manual dismiss/dismissAll support. Also maintains a persistent
 * notification center history (last N notifications).
 */

import React, { useCallback, useEffect,useRef, useState } from 'react';

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

export interface NotificationProgress {
  status: 'active' | 'completed' | 'error';
  completed: number;
  total: number;
  currentItem?: string;
  /** Set when status transitions to 'completed' or 'error' */
  summary?: string;
}

/** An entry stored in the notification center history. */
export interface NotificationEntry {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
  read: boolean;
  action?: { label: string; onClick: () => void };
  /** If present, this notification tracks a long-running operation */
  progress?: NotificationProgress;
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
  /** Create a progress notification (appears in notification center, no toast popup). Returns the ID. */
  startProgress: (title: string, options?: { total?: number }) => string;
  /** Update an existing progress notification's progress state. */
  updateProgress: (id: string, update: { completed?: number; total?: number; currentItem?: string }) => void;
  /** Mark a progress notification as complete (success/error/warning). */
  completeProgress: (id: string, summary: string, type?: ToastType) => void;
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

function pushNotification(
  setNotifications: React.Dispatch<React.SetStateAction<NotificationEntry[]>>,
  entry: NotificationEntry,
): void {
  setNotifications((prev) => {
    const next = [entry, ...prev];
    return next.length > MAX_NOTIFICATION_HISTORY ? next.slice(0, MAX_NOTIFICATION_HISTORY) : next;
  });
}

function updateProgressEntry({
  setNotifications,
  id,
  update,
  summary,
  type = 'success',
}: {
  setNotifications: React.Dispatch<React.SetStateAction<NotificationEntry[]>>
  id: string
  update: { completed?: number; total?: number; currentItem?: string }
  summary?: string
  type?: ToastType
}): void {
  setNotifications((prev) => prev.map((n) => {
    if (n.id !== id || !n.progress) return n;
    return { ...n, type, read: false, progress: { ...n.progress, ...(update.completed !== undefined ? { completed: update.completed } : {}), ...(update.total !== undefined ? { total: update.total } : {}), ...(update.currentItem !== undefined ? { currentItem: update.currentItem } : {}), ...(summary ? { summary, status: type === 'error' ? 'error' as const : 'completed' as const } : {}) } };
  }));
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
    timersRef.current.set(id, setTimeout(() => {
      timersRef.current.delete(id);
      startDismissAnimation(setToasts, id, timersRef.current);
    }, duration));
  }, []);
  const addNotification = useCallback((id: string, message: string, type: ToastType, action?: { label: string; onClick: () => void }) => pushNotification(setNotifications, { id, message, type, createdAt: Date.now(), read: false, action }), []);

  const addToast = useCallback((message: string, type: ToastType = 'info', options?: ToastOptions): string => {
    const id = generateToastId();
    const effectiveDuration = options?.persistent ? 0 : (options?.duration ?? DEFAULT_DURATION);
    const item = createToastItem(id, message, type, { ...options, duration: effectiveDuration });
    setToasts((prev) => applyFifoOverflow([...prev, item], timersRef.current));
    scheduleAutoDismiss(id, item.duration);
    addNotification(id, message, type, options?.action);
    return id;
  }, [scheduleAutoDismiss, addNotification]);
  const dismiss = useCallback((id: string) => { clearTimerForId(timersRef.current, id); startDismissAnimation(setToasts, id, timersRef.current); }, []);
  const dismissAll = useCallback(() => {
    timersRef.current.forEach(clearTimeout); timersRef.current.clear();
    setToasts((prev) => prev.map((t) => ({ ...t, dismissing: true })));
    timersRef.current.set('dismiss-all', setTimeout(() => { timersRef.current.delete('dismiss-all'); setToasts([]); }, DISMISS_ANIMATION_MS));
  }, []);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const markAllRead = useCallback(() => setNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true }))), []);
  const removeNotification = useCallback((id: string) => setNotifications((prev) => prev.filter((n) => n.id !== id)), []);
  const clearAllNotifications = useCallback(() => setNotifications([]), []);
  const startProgress = useCallback((title: string, options?: { total?: number }): string => { const id = generateToastId(); pushNotification(setNotifications, { id, message: title, type: 'info', createdAt: Date.now(), read: false, progress: { status: 'active', completed: 0, total: options?.total ?? 0 } }); return id; }, []);
  const updateProgress = useCallback((id: string, update: { completed?: number; total?: number; currentItem?: string }): void => updateProgressEntry({ setNotifications, id, update }), []);
  const completeProgress = useCallback((id: string, summary: string, type: ToastType = 'success'): void => updateProgressEntry({ setNotifications, id, update: {}, summary, type }), []);

  return { toasts, toast: addToast, dismiss, dismissAll, notifications, unreadCount, markAllRead, removeNotification, clearAllNotifications, startProgress, updateProgress, completeProgress };
}
