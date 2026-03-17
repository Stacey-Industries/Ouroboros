/**
 * useExtensionThemes.ts — Loads theme contributions from installed VS Code
 * extensions and registers them with the Ouroboros theme registry.
 *
 * Call this once at app init. It loads themes on mount and re-loads after
 * install/uninstall events from the extension store.
 */

import { useCallback, useEffect, useState } from 'react'
import type { Theme } from '../themes'
import { registerExtensionTheme, unregisterExtensionTheme, themes } from '../themes'

/**
 * Returns a live array of extension theme objects registered with the theme system.
 * Automatically refreshes when extensions are installed or uninstalled.
 */
export function useExtensionThemes(): Theme[] {
  const [extensionThemes, setExtensionThemes] = useState<Theme[]>([])

  const loadThemes = useCallback(async () => {
    const api = window.electronAPI?.extensionStore
    if (!api?.getThemeContributions) return

    try {
      const result = await api.getThemeContributions()
      if (!result.success || !result.themes) return

      // Unregister any previously registered extension themes
      const extThemeIds = Object.keys(themes).filter((id) => id.startsWith('ext:'))
      for (const id of extThemeIds) {
        unregisterExtensionTheme(id)
      }

      // Register the new set
      const loaded: Theme[] = []
      for (const t of result.themes) {
        // The data from main process matches the Theme interface
        const theme: Theme = {
          id: t.id,
          name: t.name,
          fontFamily: t.fontFamily,
          colors: t.colors,
        }
        registerExtensionTheme(theme)
        loaded.push(theme)
      }
      setExtensionThemes(loaded)
    } catch {
      // Non-critical — extension themes are optional
    }
  }, [])

  // Load on mount
  useEffect(() => {
    void loadThemes()
  }, [loadThemes])

  // Reload when extensions change (listen for IPC events broadcast from main)
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    // The main process broadcasts these events after install/uninstall
    const cleanups: Array<() => void> = []

    const events = [
      'extensionStore:installed',
      'extensionStore:uninstalled',
      'extensionStore:contributionsChanged',
    ]

    for (const channel of events) {
      const handler = () => { void loadThemes() }
      // Use the general IPC listener if available
      const cleanup = api.on?.(channel, handler)
      if (typeof cleanup === 'function') {
        cleanups.push(cleanup)
      }
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [loadThemes])

  return extensionThemes
}
