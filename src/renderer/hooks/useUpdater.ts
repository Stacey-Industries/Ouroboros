/**
 * useUpdater.ts - Subscribes to auto-updater events and exposes check/install.
 *
 * Shows toasts for each updater lifecycle event. The "update-downloaded" toast
 * includes an "Install Now" action button.
 */

import { useCallback, useEffect } from 'react'

import { useToastContext } from '../contexts/ToastContext'
import type { UpdaterEvent } from '../types/electron'

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window
}

function getEventVersion(event: UpdaterEvent): string {
  return ((event.info as { version?: string } | undefined)?.version) ?? ''
}

function createUpdaterAction(
  label: string,
  action: 'download' | 'install',
): { label: string; onClick: () => void } {
  return {
    label,
    onClick: () => {
      if (!hasElectronAPI()) {
        return
      }

      if (action === 'download') {
        void window.electronAPI.updater.download()
        return
      }

      void window.electronAPI.updater.install()
    },
  }
}

function showUpdateAvailableToast(
  toast: ReturnType<typeof useToastContext>['toast'],
  event: UpdaterEvent,
): void {
  const version = getEventVersion(event)
  toast(`Update available${version ? `: v${version}` : ''}`, 'info', {
    duration: 0,
    action: createUpdaterAction('Download', 'download'),
  })
}

function showUpdateDownloadedToast(
  toast: ReturnType<typeof useToastContext>['toast'],
  event: UpdaterEvent,
): void {
  const version = getEventVersion(event)
  toast(`Update ready${version ? ` (v${version})` : ''} - Restart to install`, 'success', {
    duration: 0,
    action: createUpdaterAction('Install Now', 'install'),
  })
}

function handleUpdaterEvent(
  event: UpdaterEvent,
  toast: ReturnType<typeof useToastContext>['toast'],
): void {
  switch (event.type) {
    case 'checking-for-update':
      toast('Checking for updates...', 'info', { duration: 3000 })
      return
    case 'update-available':
      showUpdateAvailableToast(toast, event)
      return
    case 'download-progress':
      toast(`Downloading update... ${Math.round(event.progress?.percent ?? 0)}%`, 'info', { duration: 3000 })
      return
    case 'update-downloaded':
      showUpdateDownloadedToast(toast, event)
      return
    case 'update-not-available':
      toast("You're up to date", 'success', { duration: 3000 })
      return
    case 'error':
      toast(`Update error: ${event.error ?? 'unknown'}`, 'error', { duration: 6000 })
      return
  }
}

export interface UseUpdaterReturn {
  checkForUpdates: () => Promise<void>
}

export function useUpdater(): UseUpdaterReturn {
  const { toast } = useToastContext()

  useEffect(() => {
    if (!hasElectronAPI()) {
      return
    }

    return window.electronAPI.updater.onUpdateEvent((event: UpdaterEvent) => {
      handleUpdaterEvent(event, toast)
    })
  }, [toast])

  const checkForUpdates = useCallback(async (): Promise<void> => {
    if (!hasElectronAPI()) {
      return
    }
    await window.electronAPI.updater.check()
  }, [])

  return { checkForUpdates }
}
