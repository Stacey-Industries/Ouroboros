import { ipcRenderer } from 'electron'

import type { AppConfig } from '../renderer/types/electron'

const externalChangeCallbacks = new Set<(config: AppConfig) => void>()
let externalChangeListenerInstalled = false

export function subscribeToConfigExternalChange(callback: (config: AppConfig) => void): () => void {
  externalChangeCallbacks.add(callback)
  if (!externalChangeListenerInstalled) {
    externalChangeListenerInstalled = true
    ipcRenderer.on('config:externalChange', (_event, config: AppConfig) => {
      for (const cb of externalChangeCallbacks) {
        try {
          cb(config)
        } catch {
          /* ignore subscriber errors */
        }
      }
    })
  }
  return () => {
    externalChangeCallbacks.delete(callback)
  }
}
