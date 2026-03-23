import { useCallback,useEffect, useState } from 'react'

import type { AppConfig } from '../types/electron'

interface UseConfigReturn {
  config: AppConfig | null
  isLoading: boolean
  error: string | null
  set: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>
  refresh: () => Promise<void>
}

/**
 * useConfig — reads and writes electron-store config via IPC.
 *
 * Optimistic updates: `set` updates local state immediately, then persists.
 * On error, reverts to previous value.
 */
export function useConfig(): UseConfigReturn {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const all = await window.electronAPI.config.getAll()
      setConfig(all)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const set = useCallback(
    async <K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> => {
      const previous = config
      // Optimistic update
      setConfig((prev) => (prev ? { ...prev, [key]: value } : prev))

      const result = await window.electronAPI.config.set(key, value)
      if (!result.success) {
        // Revert
        setConfig(previous)
        throw new Error(result.error ?? 'Config write failed')
      }
    },
    [config]
  )

  return { config, isLoading, error, set, refresh: load }
}
