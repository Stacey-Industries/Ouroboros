/**
 * useToast.ts — Shared toast hook for settings sections.
 */

import { useState } from 'react';

export interface ToastState {
  message: string;
  kind: 'success' | 'error';
}

export function useToast(
  duration = 3500,
): [ToastState | null, (msg: string, kind: ToastState['kind']) => void] {
  const [toast, setToast] = useState<ToastState | null>(null);

  function show(message: string, kind: ToastState['kind']): void {
    setToast({ message, kind });
    setTimeout(() => setToast(null), duration);
  }

  return [toast, show];
}
