/**
 * ToastContext.tsx — Provides toast notifications to the entire app.
 *
 * Wrap the app with <ToastProvider> and use the useToastContext() hook
 * from any component to trigger toasts.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useToast } from '../hooks/useToast';
import type { UseToastReturn } from '../hooks/useToast';
import { ToastContainer } from '../components/shared/Toast';

// ── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<UseToastReturn | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps): React.ReactElement {
  const toastState = useToast();

  const value = useMemo<UseToastReturn>(
    () => ({
      toasts: toastState.toasts,
      toast: toastState.toast,
      dismiss: toastState.dismiss,
      dismissAll: toastState.dismissAll,
      notifications: toastState.notifications,
      unreadCount: toastState.unreadCount,
      markAllRead: toastState.markAllRead,
      removeNotification: toastState.removeNotification,
      clearAllNotifications: toastState.clearAllNotifications,
    }),
    [
      toastState.toasts, toastState.toast, toastState.dismiss, toastState.dismissAll,
      toastState.notifications, toastState.unreadCount, toastState.markAllRead,
      toastState.removeNotification, toastState.clearAllNotifications,
    ],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={value.toasts} onDismiss={value.dismiss} />
    </ToastContext.Provider>
  );
}

// ── Consumer hook ────────────────────────────────────────────────────────────

export function useToastContext(): UseToastReturn {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToastContext must be used inside <ToastProvider>');
  }
  return ctx;
}
