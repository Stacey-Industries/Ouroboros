/**
 * useErrorCapture — captures global renderer errors and sends them
 * to the main process for crash reporting.
 *
 * Extracted from InnerApp to reduce complexity.
 */

import { useEffect } from 'react';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export function useErrorCapture(): void {
  useEffect(() => {
    if (!hasElectronAPI()) return;

    function onError(event: ErrorEvent): void {
      const stack = event.error instanceof Error ? (event.error.stack ?? '') : '';
      void window.electronAPI.crash.logError('renderer:window.onerror', event.message, stack);
    }

    function onUnhandledRejection(event: PromiseRejectionEvent): void {
      const msg = event.reason instanceof Error
        ? (event.reason.stack ?? event.reason.message)
        : String(event.reason);
      void window.electronAPI.crash.logError('renderer:unhandledRejection', msg);
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);
}
