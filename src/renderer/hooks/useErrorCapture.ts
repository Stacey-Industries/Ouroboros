/**
 * useErrorCapture — captures global renderer errors and sends them
 * to the main process for crash reporting.
 *
 * Extracted from InnerApp to reduce complexity.
 */

import { useEffect, useRef } from 'react';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

const MAX_ERRORS_PER_WINDOW = 50;
const WINDOW_MS = 60_000;

export function useErrorCapture(): void {
  const countRef = useRef(0);
  const windowStartRef = useRef(Date.now());
  const sendingRef = useRef(false);

  useEffect(() => {
    if (!hasElectronAPI()) return;

    function shouldThrottle(): boolean {
      const now = Date.now();
      if (now - windowStartRef.current > WINDOW_MS) {
        windowStartRef.current = now;
        countRef.current = 0;
      }
      countRef.current += 1;
      return countRef.current > MAX_ERRORS_PER_WINDOW;
    }

    function safeSend(source: string, message: string, stack?: string): void {
      if (sendingRef.current || shouldThrottle()) return;
      sendingRef.current = true;
      window.electronAPI.crash.logError(source, message, stack).catch(() => {
        // Swallow — prevents infinite loop if logError IPC is missing
      }).finally(() => { sendingRef.current = false; });
    }

    function onError(event: ErrorEvent): void {
      const stack = event.error instanceof Error ? (event.error.stack ?? '') : '';
      safeSend('renderer:window.onerror', event.message, stack);
    }

    function onUnhandledRejection(event: PromiseRejectionEvent): void {
      const msg = event.reason instanceof Error
        ? (event.reason.stack ?? event.reason.message)
        : String(event.reason);
      safeSend('renderer:unhandledRejection', msg);
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);
}
