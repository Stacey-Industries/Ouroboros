/**
 * useUpdater.ts — Subscribes to auto-updater events and exposes check/install.
 *
 * Shows toasts for each updater lifecycle event. The "update-downloaded" toast
 * includes an "Install Now" action button.
 */

import { useEffect, useCallback } from 'react';
import type { UpdaterEvent } from '../types/electron';
import { useToastContext } from '../contexts/ToastContext';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export interface UseUpdaterReturn {
  checkForUpdates: () => Promise<void>;
}

export function useUpdater(): UseUpdaterReturn {
  const { toast } = useToastContext();

  useEffect(() => {
    if (!hasElectronAPI()) return;

    const cleanup = window.electronAPI.updater.onUpdateEvent((evt: UpdaterEvent) => {
      switch (evt.type) {
        case 'checking-for-update':
          toast('Checking for updates\u2026', 'info', { duration: 3000 });
          break;

        case 'update-available': {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const info = evt.info as any;
          const version: string = info?.version ?? '';
          toast(
            `Update available${version ? `: v${version}` : ''} \u2014 Downloading\u2026`,
            'info',
            { duration: 0 }, // keep visible until dismissed or superseded
          );
          break;
        }

        case 'download-progress': {
          const pct = evt.progress?.percent ?? 0;
          toast(`Downloading update\u2026 ${Math.round(pct)}%`, 'info', { duration: 3000 });
          break;
        }

        case 'update-downloaded': {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const info = evt.info as any;
          const version: string = info?.version ?? '';
          toast(
            `Update ready${version ? ` (v${version})` : ''} \u2014 Restart to install`,
            'success',
            {
              duration: 0, // must be manually dismissed or acted on
              action: {
                label: 'Install Now',
                onClick: () => {
                  if (hasElectronAPI()) {
                    void window.electronAPI.updater.install();
                  }
                },
              },
            },
          );
          break;
        }

        case 'update-not-available':
          toast("You're up to date", 'success', { duration: 3000 });
          break;

        case 'error':
          toast(`Update error: ${evt.error ?? 'unknown'}`, 'error', { duration: 6000 });
          break;
      }
    });

    return cleanup;
  }, [toast]);

  const checkForUpdates = useCallback(async (): Promise<void> => {
    if (!hasElectronAPI()) return;
    await window.electronAPI.updater.check();
  }, []);

  return { checkForUpdates };
}
