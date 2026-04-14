/**
 * useStreamingInlineEditFlag — mirrors config.streamingInlineEdit onto
 * window.__streamingInlineEdit__ so that useInlineEdit can read the flag
 * synchronously at submit time without an async IPC round-trip.
 *
 * Called once in App.tsx alongside useThemeRuntimeBootstrap so the flag is
 * kept in sync for the lifetime of the renderer process.
 */
import { useEffect } from 'react';

import type { AppConfig } from '../types/electron';

export function useStreamingInlineEditFlag(config: AppConfig | null): void {
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__streamingInlineEdit__ =
      config?.streamingInlineEdit === true;
  }, [config?.streamingInlineEdit]);
}
