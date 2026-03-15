import type { ElectronAPI } from './electron-workspace'

export * from './electron-foundation'
export * from './electron-agent-chat'
export * from './electron-runtime-apis'
export * from './electron-git'
export * from './electron-observability'
export * from './electron-workspace'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
