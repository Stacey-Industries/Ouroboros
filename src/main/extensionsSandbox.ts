import fs from 'fs/promises'
import path from 'path'
import { BrowserWindow } from 'electron'
import { getConfigValue, type AppConfig } from './config'
import { writeToPty } from './pty'
import type { LoadedExtension } from './extensionsTypes'

interface ConsoleProxy {
  log: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
}

export interface ExtensionSandboxApi {
  ouroboros: Record<string, unknown>
  console: ConsoleProxy
}

function requirePermission(ext: LoadedExtension, permission: string): void {
  if (!ext.manifest.permissions.includes(permission)) {
    throw new Error(`Permission denied: ${permission} not granted`)
  }
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`)
  }
}

function requireNonEmptyString(value: unknown, label: string): asserts value is string {
  requireString(value, label)
  if (!value) {
    throw new Error(`Invalid ${label.toLowerCase()}`)
  }
}

function getResolvedPath(filePath: string): string {
  return path.resolve(filePath)
}

function getPrimaryWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0]
}

export function appendLog(ext: LoadedExtension, message: string): void {
  const timestamp = new Date().toISOString().slice(11, 23)
  ext.log.push(`[${timestamp}] ${message}`)
  if (ext.log.length > 500) {
    ext.log.splice(0, ext.log.length - 500)
  }
}

function buildFilesApi(ext: LoadedExtension): Record<string, unknown> {
  return {
    readFile: async (filePath: string): Promise<string> => {
      requirePermission(ext, 'files.read')
      requireNonEmptyString(filePath, 'file path')
      const resolved = getResolvedPath(filePath)
      appendLog(ext, `files.readFile: ${resolved}`)
      return fs.readFile(resolved, 'utf-8')
    },
    writeFile: async (filePath: string, content: string): Promise<void> => {
      requirePermission(ext, 'files.write')
      requireNonEmptyString(filePath, 'file path')
      requireString(content, 'Content')
      const resolved = getResolvedPath(filePath)
      appendLog(ext, `files.writeFile: ${resolved}`)
      await fs.writeFile(resolved, content, 'utf-8')
    },
  }
}

function buildTerminalApi(ext: LoadedExtension): Record<string, unknown> {
  return {
    write: async (tabId: string, data: string): Promise<void> => {
      requirePermission(ext, 'terminal.write')
      requireString(tabId, 'tabId')
      requireString(data, 'data')
      appendLog(ext, `terminal.write: tab=${tabId}, ${data.length} chars`)
      await writeToPty(tabId, data)
    },
  }
}

function buildConfigApi(ext: LoadedExtension): Record<string, unknown> {
  return {
    get: (key: string): unknown => {
      requirePermission(ext, 'config.read')
      requireString(key, 'Key')
      appendLog(ext, `config.get: ${key}`)
      return getConfigValue(key as keyof AppConfig)
    },
  }
}

function buildUiApi(ext: LoadedExtension): Record<string, unknown> {
  return {
    showNotification: (message: string): void => {
      requireString(message, 'Message')
      appendLog(ext, `ui.showNotification: ${message.slice(0, 100)}`)
      const window = getPrimaryWindow()
      if (window && !window.isDestroyed()) {
        window.webContents.send('extensions:notification', {
          extensionName: ext.manifest.name,
          message,
        })
      }
    },
  }
}

function buildCommandsApi(ext: LoadedExtension): Record<string, unknown> {
  return {
    register: (id: string, handler: (...args: unknown[]) => unknown): void => {
      requirePermission(ext, 'commands.register')
      requireString(id, 'id')
      if (typeof handler !== 'function') {
        throw new Error('Invalid arguments: handler must be a function')
      }
      const fullId = `ext:${ext.manifest.name}:${id}`
      appendLog(ext, `commands.register: ${fullId}`)
      ext.registeredCommands.set(fullId, handler)
    },
    unregister: (id: string): void => {
      requireString(id, 'id')
      const fullId = `ext:${ext.manifest.name}:${id}`
      ext.registeredCommands.delete(fullId)
      appendLog(ext, `commands.unregister: ${fullId}`)
    },
  }
}

function buildConsoleMethod(ext: LoadedExtension, level: string) {
  return (...args: unknown[]): void => {
    appendLog(ext, `[${level}] ${args.map(String).join(' ')}`)
  }
}

function buildConsoleProxy(ext: LoadedExtension): ConsoleProxy {
  return {
    log: buildConsoleMethod(ext, 'log'),
    warn: buildConsoleMethod(ext, 'warn'),
    error: buildConsoleMethod(ext, 'error'),
    info: buildConsoleMethod(ext, 'info'),
  }
}

export function buildSandboxAPI(ext: LoadedExtension): ExtensionSandboxApi {
  return {
    ouroboros: {
      files: buildFilesApi(ext),
      terminal: buildTerminalApi(ext),
      config: buildConfigApi(ext),
      ui: buildUiApi(ext),
      commands: buildCommandsApi(ext),
    },
    console: buildConsoleProxy(ext),
  }
}

export function getSafeSandboxGlobals(): Record<string, unknown> {
  return {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    Error,
    TypeError,
    RangeError,
    URIError,
    SyntaxError,
    ReferenceError,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    undefined,
    NaN,
    Infinity,
  }
}
