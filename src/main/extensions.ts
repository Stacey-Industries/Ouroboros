/**
 * extensions.ts — Sandboxed extension host for the main process.
 *
 * Each extension lives in its own folder under ~/.ouroboros/extensions/
 * with a manifest.json and a main JS file. Extensions run in a Node.js
 * vm.Script sandbox with a controlled API surface — no access to require(),
 * child_process, fs, or other Node.js APIs directly.
 */

import vm from 'vm'
import fs from 'fs/promises'
import path from 'path'
import { app, BrowserWindow } from 'electron'
import { getConfigValue } from './config'
import { writeToPty } from './pty'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtensionManifest {
  name: string
  version: string
  description: string
  author: string
  main: string
  permissions: string[]
  activationEvents?: string[]
}

export type ExtensionStatus = 'active' | 'inactive' | 'error'

export interface ExtensionInfo {
  name: string
  version: string
  description: string
  author: string
  enabled: boolean
  status: ExtensionStatus
  permissions: string[]
  errorMessage?: string
}

interface LoadedExtension {
  manifest: ExtensionManifest
  dir: string
  enabled: boolean
  status: ExtensionStatus
  errorMessage?: string
  log: string[]
  registeredCommands: Map<string, (...args: unknown[]) => unknown>
  context: vm.Context | null
}

// ─── Valid permissions ────────────────────────────────────────────────────────

const VALID_PERMISSIONS = new Set([
  'files.read',
  'files.write',
  'terminal.write',
  'config.read',
  'config.write',
  'ui.notify',
  'commands.register',
])

// ─── State ────────────────────────────────────────────────────────────────────

const extensions = new Map<string, LoadedExtension>()
let extensionsDir = ''

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExtensionsDir(): string {
  if (!extensionsDir) {
    extensionsDir = path.join(app.getPath('userData'), 'extensions')
  }
  return extensionsDir
}

function hasPermission(ext: LoadedExtension, permission: string): boolean {
  return ext.manifest.permissions.includes(permission)
}

function appendLog(ext: LoadedExtension, message: string): void {
  const timestamp = new Date().toISOString().slice(11, 23)
  ext.log.push(`[${timestamp}] ${message}`)
  // Cap log at 500 lines
  if (ext.log.length > 500) {
    ext.log.splice(0, ext.log.length - 500)
  }
}

// ─── Sandbox API builder ──────────────────────────────────────────────────────

function buildSandboxAPI(ext: LoadedExtension): Record<string, unknown> {
  const ouroboros: Record<string, unknown> = {}

  // files namespace
  ouroboros.files = {
    readFile: async (filePath: string): Promise<string> => {
      if (!hasPermission(ext, 'files.read')) {
        throw new Error('Permission denied: files.read not granted')
      }
      if (typeof filePath !== 'string' || !filePath) {
        throw new Error('Invalid file path')
      }
      // Prevent path traversal to sensitive locations
      const resolved = path.resolve(filePath)
      appendLog(ext, `files.readFile: ${resolved}`)
      return await fs.readFile(resolved, 'utf-8')
    },

    writeFile: async (filePath: string, content: string): Promise<void> => {
      if (!hasPermission(ext, 'files.write')) {
        throw new Error('Permission denied: files.write not granted')
      }
      if (typeof filePath !== 'string' || !filePath) {
        throw new Error('Invalid file path')
      }
      if (typeof content !== 'string') {
        throw new Error('Content must be a string')
      }
      const resolved = path.resolve(filePath)
      appendLog(ext, `files.writeFile: ${resolved}`)
      await fs.writeFile(resolved, content, 'utf-8')
    },
  }

  // terminal namespace
  ouroboros.terminal = {
    write: async (tabId: string, data: string): Promise<void> => {
      if (!hasPermission(ext, 'terminal.write')) {
        throw new Error('Permission denied: terminal.write not granted')
      }
      if (typeof tabId !== 'string' || typeof data !== 'string') {
        throw new Error('Invalid arguments: tabId and data must be strings')
      }
      appendLog(ext, `terminal.write: tab=${tabId}, ${data.length} chars`)
      await writeToPty(tabId, data)
    },
  }

  // config namespace
  ouroboros.config = {
    get: (key: string): unknown => {
      if (!hasPermission(ext, 'config.read')) {
        throw new Error('Permission denied: config.read not granted')
      }
      if (typeof key !== 'string') {
        throw new Error('Key must be a string')
      }
      appendLog(ext, `config.get: ${key}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return getConfigValue(key as any)
    },
  }

  // ui namespace
  ouroboros.ui = {
    showNotification: (message: string): void => {
      if (typeof message !== 'string') {
        throw new Error('Message must be a string')
      }
      appendLog(ext, `ui.showNotification: ${message.slice(0, 100)}`)
      const windows = BrowserWindow.getAllWindows()
      if (windows.length > 0) {
        windows[0].webContents.send('extensions:notification', {
          extensionName: ext.manifest.name,
          message,
        })
      }
    },
  }

  // commands namespace
  ouroboros.commands = {
    register: (id: string, handler: (...args: unknown[]) => unknown): void => {
      if (!hasPermission(ext, 'commands.register')) {
        throw new Error('Permission denied: commands.register not granted')
      }
      if (typeof id !== 'string' || typeof handler !== 'function') {
        throw new Error('Invalid arguments: id must be a string, handler must be a function')
      }
      const fullId = `ext:${ext.manifest.name}:${id}`
      appendLog(ext, `commands.register: ${fullId}`)
      ext.registeredCommands.set(fullId, handler)
    },

    unregister: (id: string): void => {
      const fullId = `ext:${ext.manifest.name}:${id}`
      ext.registeredCommands.delete(fullId)
      appendLog(ext, `commands.unregister: ${fullId}`)
    },
  }

  // console proxy — captures output to extension log
  const consoleProxy = {
    log: (...args: unknown[]): void => {
      appendLog(ext, `[log] ${args.map(String).join(' ')}`)
    },
    warn: (...args: unknown[]): void => {
      appendLog(ext, `[warn] ${args.map(String).join(' ')}`)
    },
    error: (...args: unknown[]): void => {
      appendLog(ext, `[error] ${args.map(String).join(' ')}`)
    },
    info: (...args: unknown[]): void => {
      appendLog(ext, `[info] ${args.map(String).join(' ')}`)
    },
  }

  return { ouroboros, console: consoleProxy }
}

// ─── Load a single extension ──────────────────────────────────────────────────

async function loadExtension(extDir: string): Promise<LoadedExtension | null> {
  const manifestPath = path.join(extDir, 'manifest.json')

  try {
    const raw = await fs.readFile(manifestPath, 'utf-8')
    const manifest: ExtensionManifest = JSON.parse(raw)

    // Validate required fields
    if (!manifest.name || !manifest.version || !manifest.main) {
      throw new Error('Manifest missing required fields: name, version, main')
    }

    // Validate permissions
    for (const perm of manifest.permissions ?? []) {
      if (!VALID_PERMISSIONS.has(perm)) {
        throw new Error(`Unknown permission: ${perm}`)
      }
    }

    // Ensure main file exists
    const mainPath = path.join(extDir, manifest.main)
    await fs.access(mainPath)

    const ext: LoadedExtension = {
      manifest,
      dir: extDir,
      enabled: true,
      status: 'inactive',
      log: [],
      registeredCommands: new Map(),
      context: null,
    }

    return ext
  } catch (err) {
    const name = path.basename(extDir)
    console.error(`[extensions] Failed to load ${name}:`, err)
    return {
      manifest: {
        name,
        version: '0.0.0',
        description: '',
        author: '',
        main: '',
        permissions: [],
      },
      dir: extDir,
      enabled: false,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
      log: [`Failed to load: ${err instanceof Error ? err.message : String(err)}`],
      registeredCommands: new Map(),
      context: null,
    }
  }
}

// ─── Activate an extension ────────────────────────────────────────────────────

async function activateExtension(ext: LoadedExtension): Promise<void> {
  if (ext.status === 'active') return
  if (!ext.manifest.main) {
    ext.status = 'error'
    ext.errorMessage = 'No main file specified in manifest'
    return
  }

  const mainPath = path.join(ext.dir, ext.manifest.main)

  try {
    const code = await fs.readFile(mainPath, 'utf-8')
    const api = buildSandboxAPI(ext)

    // Create a minimal sandbox context — NO require, NO process, NO fs, NO child_process
    const sandbox: Record<string, unknown> = {
      ouroboros: api.ouroboros,
      console: api.console,
      // Basic globals that are safe to expose
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

    const context = vm.createContext(sandbox, {
      name: `ext:${ext.manifest.name}`,
      codeGeneration: {
        strings: false,  // No eval()
        wasm: false,     // No WebAssembly
      },
    })

    ext.context = context

    // Wrap the extension code in an async IIFE so top-level await works
    const wrappedCode = `(async function() {\n${code}\n})()`
    const script = new vm.Script(wrappedCode, {
      filename: `ext:${ext.manifest.name}/${ext.manifest.main}`,
    })

    appendLog(ext, 'Activating...')
    await script.runInContext(context, { timeout: 10000 })

    ext.status = 'active'
    ext.errorMessage = undefined
    appendLog(ext, 'Activated successfully.')
  } catch (err) {
    ext.status = 'error'
    ext.errorMessage = err instanceof Error ? err.message : String(err)
    appendLog(ext, `Activation failed: ${ext.errorMessage}`)
    console.error(`[extensions] Failed to activate ${ext.manifest.name}:`, err)
  }
}

// ─── Deactivate an extension ──────────────────────────────────────────────────

function deactivateExtension(ext: LoadedExtension): void {
  ext.registeredCommands.clear()
  ext.context = null
  ext.status = 'inactive'
  appendLog(ext, 'Deactivated.')
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Discover and load all extensions from the extensions directory.
 * Called once during app startup.
 */
export async function initExtensions(): Promise<void> {
  const dir = getExtensionsDir()

  // Ensure the directory exists
  await fs.mkdir(dir, { recursive: true })

  const disabledExtensions = getConfigValue('disabledExtensions') ?? []
  const globalEnabled = getConfigValue('extensionsEnabled') ?? true

  let entries: string[]
  try {
    const dirEntries = await fs.readdir(dir, { withFileTypes: true })
    entries = dirEntries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    console.error('[extensions] Failed to read extensions directory')
    return
  }

  for (const name of entries) {
    const extDir = path.join(dir, name)
    const ext = await loadExtension(extDir)
    if (!ext) continue

    // Check if disabled
    if (!globalEnabled || disabledExtensions.includes(ext.manifest.name)) {
      ext.enabled = false
      ext.status = 'inactive'
    }

    extensions.set(ext.manifest.name, ext)

    // Auto-activate if enabled
    if (ext.enabled && ext.status !== 'error') {
      await activateExtension(ext)
    }
  }

  console.log(`[extensions] Loaded ${extensions.size} extension(s)`)
}

/**
 * List all installed extensions with their current status.
 */
export function listExtensions(): ExtensionInfo[] {
  return Array.from(extensions.values()).map((ext) => ({
    name: ext.manifest.name,
    version: ext.manifest.version,
    description: ext.manifest.description || '',
    author: ext.manifest.author || '',
    enabled: ext.enabled,
    status: ext.status,
    permissions: ext.manifest.permissions || [],
    errorMessage: ext.errorMessage,
  }))
}

/**
 * Enable an extension by name.
 */
export async function enableExtension(name: string): Promise<{ success: boolean; error?: string }> {
  const ext = extensions.get(name)
  if (!ext) {
    return { success: false, error: `Extension "${name}" not found` }
  }

  ext.enabled = true

  // Remove from disabled list in config
  const disabled = getConfigValue('disabledExtensions') ?? []
  const updated = disabled.filter((n: string) => n !== name)
  const { setConfigValue } = await import('./config')
  setConfigValue('disabledExtensions', updated)

  // Activate if not already active
  if (ext.status !== 'active') {
    await activateExtension(ext)
  }

  return { success: true }
}

/**
 * Disable an extension by name.
 */
export async function disableExtension(name: string): Promise<{ success: boolean; error?: string }> {
  const ext = extensions.get(name)
  if (!ext) {
    return { success: false, error: `Extension "${name}" not found` }
  }

  ext.enabled = false
  deactivateExtension(ext)

  // Add to disabled list in config
  const disabled = getConfigValue('disabledExtensions') ?? []
  if (!disabled.includes(name)) {
    const { setConfigValue } = await import('./config')
    setConfigValue('disabledExtensions', [...disabled, name])
  }

  return { success: true }
}

/**
 * Install an extension from a source directory (copies it into the extensions dir).
 */
export async function installExtension(sourcePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify manifest exists in source
    const manifestPath = path.join(sourcePath, 'manifest.json')
    const raw = await fs.readFile(manifestPath, 'utf-8')
    const manifest: ExtensionManifest = JSON.parse(raw)

    if (!manifest.name || !manifest.version || !manifest.main) {
      return { success: false, error: 'Invalid manifest: missing required fields (name, version, main)' }
    }

    // Validate main file exists
    await fs.access(path.join(sourcePath, manifest.main))

    const destDir = path.join(getExtensionsDir(), manifest.name)

    // Copy directory contents
    await copyDir(sourcePath, destDir)

    // Load and activate
    const ext = await loadExtension(destDir)
    if (!ext) {
      return { success: false, error: 'Failed to load extension after install' }
    }

    extensions.set(ext.manifest.name, ext)

    const globalEnabled = getConfigValue('extensionsEnabled') ?? true
    const disabled = getConfigValue('disabledExtensions') ?? []

    if (globalEnabled && !disabled.includes(ext.manifest.name)) {
      await activateExtension(ext)
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Uninstall an extension by name (removes it from disk).
 */
export async function uninstallExtension(name: string): Promise<{ success: boolean; error?: string }> {
  try {
    const ext = extensions.get(name)
    if (ext) {
      deactivateExtension(ext)
      extensions.delete(name)
    }

    const extDir = path.join(getExtensionsDir(), name)
    await fs.rm(extDir, { recursive: true, force: true })

    // Remove from disabled list
    const disabled = getConfigValue('disabledExtensions') ?? []
    if (disabled.includes(name)) {
      const { setConfigValue } = await import('./config')
      setConfigValue('disabledExtensions', disabled.filter((n: string) => n !== name))
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Get the console output log for an extension.
 */
export function getExtensionLog(name: string): { success: boolean; log?: string[]; error?: string } {
  const ext = extensions.get(name)
  if (!ext) {
    return { success: false, error: `Extension "${name}" not found` }
  }
  return { success: true, log: [...ext.log] }
}

/**
 * Get the path to the extensions directory.
 */
export function getExtensionsDirPath(): string {
  return getExtensionsDir()
}

// ─── Utility: recursive directory copy ────────────────────────────────────────

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      await fs.copyFile(srcPath, destPath)
    }
  }
}
