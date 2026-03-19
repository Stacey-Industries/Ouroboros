/**
 * hookInstaller.ts â€” Auto-installs Claude Code hook scripts on first launch.
 *
 * Behaviour:
 *  - Copies platform-appropriate scripts into ~/.claude/hooks/
 *  - On macOS/Linux: chmod +x the .sh scripts
 *  - Writes a version marker (~/.claude/hooks/.agent-ide-version)
 *  - Skips installation if the version marker matches CURRENT_HOOK_VERSION
 *  - Respects config.autoInstallHooks â€” if false, does nothing
 *  - Shows an Electron notification on first install
 */

import crypto from 'crypto'
import { app, Notification } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { getConfigValue } from './config'

// â”€â”€â”€ Version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Auto-computed from hook script contents — no manual bumping needed.
// Any change to a hook script file automatically triggers re-installation.
let _cachedVersion: string | null = null
export function getCurrentHookVersion(): string {
  if (_cachedVersion) return _cachedVersion
  const assetsDir = getAssetsHooksDir()
  const hooks = getPlatformHooks()
  const hash = crypto.createHash('sha256')
  for (const entry of hooks) {
    const filePath = path.join(assetsDir, entry.src)
    try {
      hash.update(fs.readFileSync(filePath))
    } catch {
      hash.update(entry.src) // fallback: use filename if file missing
    }
  }
  _cachedVersion = hash.digest('hex').slice(0, 16)
  return _cachedVersion
}
// Keep a static export for backward compat (e.g. logs, settings UI)
export const CURRENT_HOOK_VERSION = 'auto'

const VERSION_MARKER_FILE = '.agent-ide-version'

// â”€â”€â”€ Hook file manifests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface HookEntry {
  /** Source filename inside assets/hooks/ */
  src: string
  /** Destination filename inside ~/.claude/hooks/ */
  dest: string
  /** Make executable (macOS/Linux .sh scripts) */
  executable: boolean
}

const WINDOWS_HOOKS: HookEntry[] = [
  { src: 'pre_tool_use.ps1', dest: 'pre_tool_use.ps1', executable: false },
  { src: 'post_tool_use.ps1', dest: 'post_tool_use.ps1', executable: false },
  { src: 'agent_start.ps1', dest: 'agent_start.ps1', executable: false },
  { src: 'agent_end.ps1', dest: 'agent_end.ps1', executable: false },
  { src: 'session_start.ps1', dest: 'session_start.ps1', executable: false },
  { src: 'session_stop.ps1', dest: 'session_stop.ps1', executable: false },
]

const UNIX_HOOKS: HookEntry[] = [
  { src: 'pre_tool_use.sh', dest: 'pre_tool_use.sh', executable: true },
  { src: 'post_tool_use.sh', dest: 'post_tool_use.sh', executable: true },
  { src: 'agent_start.sh', dest: 'agent_start.sh', executable: true },
  { src: 'session_start.sh', dest: 'session_start.sh', executable: true }
]

// â”€â”€â”€ Claude Code hook event types to register â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ClaudeHookEntry {
  type: 'command'
  command: string
}

interface ClaudeHookMatcher {
  hooks: ClaudeHookEntry[]
  matcher?: string
}

// â”€â”€â”€ Path helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getClaudeHooksDir(): string {
  return path.join(os.homedir(), '.claude', 'hooks')
}

function getAssetsHooksDir(): string {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'assets', 'hooks'),
    path.join(app.getAppPath(), 'assets', 'hooks'),
    path.join(__dirname, '..', '..', 'assets', 'hooks')
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return candidates[1]
}

function getPlatformHooks(): HookEntry[] {
  return process.platform === 'win32' ? WINDOWS_HOOKS : UNIX_HOOKS
}

function buildHookCommands(hooksDir: string): Record<string, string> {
  if (process.platform === 'win32') {
    return {
      PreToolUse: `powershell -ExecutionPolicy Bypass -NonInteractive -File "${path.join(hooksDir, 'pre_tool_use.ps1')}"`,
      PostToolUse: `powershell -ExecutionPolicy Bypass -NonInteractive -File "${path.join(hooksDir, 'post_tool_use.ps1')}"`,
      SubagentStart: `powershell -ExecutionPolicy Bypass -NonInteractive -File "${path.join(hooksDir, 'agent_start.ps1')}"`,
      SubagentStop: `powershell -ExecutionPolicy Bypass -NonInteractive -File "${path.join(hooksDir, 'agent_end.ps1')}"`,
      SessionStart: `powershell -ExecutionPolicy Bypass -NonInteractive -File "${path.join(hooksDir, 'session_start.ps1')}"`,
      Stop: `powershell -ExecutionPolicy Bypass -NonInteractive -File "${path.join(hooksDir, 'session_stop.ps1')}"`,
    }
  }

  return {
    PreToolUse: path.join(hooksDir, 'pre_tool_use.sh'),
    PostToolUse: path.join(hooksDir, 'post_tool_use.sh'),
    SubagentStart: path.join(hooksDir, 'agent_start.sh'),
    SessionStart: path.join(hooksDir, 'session_start.sh'),
  }
}

function readClaudeSettings(settingsPath: string): Record<string, unknown> {
  let settings: unknown = {}

  try {
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    }
  } catch {
    return {}
  }

  return typeof settings === 'object' && settings !== null ? settings as Record<string, unknown> : {}
}

function ensureHooksMap(settings: Record<string, unknown>): Record<string, ClaudeHookMatcher[]> {
  const hooks = settings['hooks']
  if (typeof hooks === 'object' && hooks !== null) {
    return hooks as Record<string, ClaudeHookMatcher[]>
  }

  settings['hooks'] = {}
  return settings['hooks'] as Record<string, ClaudeHookMatcher[]>
}

function ensureHookMatchers(hooks: Record<string, ClaudeHookMatcher[]>, eventType: string): ClaudeHookMatcher[] {
  if (Array.isArray(hooks[eventType])) {
    return hooks[eventType]
  }

  hooks[eventType] = []
  return hooks[eventType]
}

function registerHookCommand(entries: ClaudeHookMatcher[], command: string): boolean {
  const alreadyRegistered = entries.some((entry) =>
    entry.hooks?.some((hook) => hook.command === command)
  )

  if (alreadyRegistered) return false

  entries.push({ hooks: [{ type: 'command', command }] })
  return true
}

// â”€â”€â”€ Settings.json hook registration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Merges Ouroboros hook commands into ~/.claude/settings.json so Claude Code
 * actually invokes them. Safe to call multiple times â€” deduplicates by command.
 */
function registerHooksInSettings(hooksDir: string): void {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  const settings = readClaudeSettings(settingsPath)
  const hooks = ensureHooksMap(settings)

  for (const [eventType, command] of Object.entries(buildHookCommands(hooksDir))) {
    const entries = ensureHookMatchers(hooks, eventType)
    if (!registerHookCommand(entries, command)) continue
    console.log(`[hookInstaller] registered ${eventType} hook in settings.json`)
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
}

// â”€â”€â”€ Installer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface InstallResult {
  installed: boolean
  firstInstall: boolean
  hooksDir: string
  skippedReason?: string
}

function createSkippedInstallResult(hooksDir: string, skippedReason: string): InstallResult {
  return {
    installed: false,
    firstInstall: false,
    hooksDir,
    skippedReason,
  }
}

function installHookFile(entry: HookEntry, assetsDir: string, hooksDir: string): void {
  const srcPath = path.join(assetsDir, entry.src)
  const destPath = path.join(hooksDir, entry.dest)

  if (!fs.existsSync(srcPath)) {
    console.warn(`[hookInstaller] source script not found: ${srcPath}`)
    return
  }

  fs.copyFileSync(srcPath, destPath)

  if (entry.executable && process.platform !== 'win32') {
    fs.chmodSync(destPath, 0o755)
  }

  console.log(`[hookInstaller] installed ${entry.dest} -> ${destPath}`)
}

function installHookFiles(assetsDir: string, hooksDir: string): void {
  fs.mkdirSync(hooksDir, { recursive: true })

  for (const entry of getPlatformHooks()) {
    installHookFile(entry, assetsDir, hooksDir)
  }
}

function writeVersionMarker(markerPath: string): void {
  fs.writeFileSync(markerPath, getCurrentHookVersion(), 'utf8')
}

function syncHooksIntoSettings(hooksDir: string): void {
  try {
    registerHooksInSettings(hooksDir)
  } catch (err) {
    console.warn('[hookInstaller] could not update settings.json:', err)
  }
}

function maybeShowInstallNotification(firstInstall: boolean, hooksDir: string): void {
  if (!firstInstall || !Notification.isSupported()) return

  const notification = new Notification({
    title: 'Ouroboros',
    body: `Hook scripts installed to ${hooksDir}.\nOuroboros will now receive live tool events from Claude Code.`,
    silent: false
  })

  notification.show()
}

function logInstallComplete(firstInstall: boolean): void {
  console.log(
    `[hookInstaller] ${firstInstall ? 'first' : 'updated'} install complete — version ${getCurrentHookVersion()}`
  )
}

export async function installHooks(): Promise<InstallResult> {
  const hooksDir = getClaudeHooksDir()
  const autoInstall = getConfigValue('autoInstallHooks') as boolean

  if (!autoInstall) {
    return createSkippedInstallResult(hooksDir, 'autoInstallHooks disabled in config')
  }

  const markerPath = path.join(hooksDir, VERSION_MARKER_FILE)
  const installedVersion = readVersionMarker(markerPath)

  const currentVersion = getCurrentHookVersion()
  if (installedVersion === currentVersion) {
    return createSkippedInstallResult(hooksDir, `hooks already at version ${currentVersion}`)
  }

  const firstInstall = installedVersion === null

  installHookFiles(getAssetsHooksDir(), hooksDir)
  writeVersionMarker(markerPath)
  syncHooksIntoSettings(hooksDir)
  maybeShowInstallNotification(firstInstall, hooksDir)
  logInstallComplete(firstInstall)

  return { installed: true, firstInstall, hooksDir }
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function readVersionMarker(markerPath: string): string | null {
  try {
    if (!fs.existsSync(markerPath)) return null
    return fs.readFileSync(markerPath, 'utf8').trim() || null
  } catch {
    return null
  }
}

/** Returns true if hooks are installed at the current version. */
export function hooksAreUpToDate(): boolean {
  const markerPath = path.join(getClaudeHooksDir(), VERSION_MARKER_FILE)
  return readVersionMarker(markerPath) === getCurrentHookVersion()
}

/** Removes all installed hook scripts and the version marker. */
export function uninstallHooks(): void {
  const hooksDir = getClaudeHooksDir()
  const allHooks = [...WINDOWS_HOOKS, ...UNIX_HOOKS]

  for (const entry of allHooks) {
    const destPath = path.join(hooksDir, entry.dest)
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { force: true })
    }
  }

  const markerPath = path.join(hooksDir, VERSION_MARKER_FILE)
  if (fs.existsSync(markerPath)) {
    fs.rmSync(markerPath, { force: true })
  }

  console.log('[hookInstaller] hooks uninstalled')
}
