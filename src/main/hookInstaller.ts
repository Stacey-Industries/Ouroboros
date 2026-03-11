/**
 * hookInstaller.ts — Auto-installs Claude Code hook scripts on first launch.
 *
 * Behaviour:
 *  - Copies platform-appropriate scripts into ~/.claude/hooks/
 *  - On macOS/Linux: chmod +x the .sh scripts
 *  - Writes a version marker (~/.claude/hooks/.agent-ide-version)
 *  - Skips installation if the version marker matches CURRENT_HOOK_VERSION
 *  - Respects config.autoInstallHooks — if false, does nothing
 *  - Shows an Electron notification on first install
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { app, Notification } from 'electron'
import { getConfigValue } from './config'

// ─── Version ──────────────────────────────────────────────────────────────────
// Bump this string whenever the hook scripts change so existing installs update.
export const CURRENT_HOOK_VERSION = '1.0.2'

const VERSION_MARKER_FILE = '.agent-ide-version'

// ─── Hook file manifests ──────────────────────────────────────────────────────

interface HookEntry {
  /** Source filename inside assets/hooks/ */
  src: string
  /** Destination filename inside ~/.claude/hooks/ */
  dest: string
  /** Make executable (macOS/Linux .sh scripts) */
  executable: boolean
}

const WINDOWS_HOOKS: HookEntry[] = [
  { src: 'pre_tool_use.ps1',  dest: 'pre_tool_use.ps1',  executable: false },
  { src: 'post_tool_use.ps1', dest: 'post_tool_use.ps1', executable: false },
  { src: 'agent_start.ps1',   dest: 'agent_start.ps1',   executable: false }
]

const UNIX_HOOKS: HookEntry[] = [
  { src: 'pre_tool_use.sh',   dest: 'pre_tool_use.sh',   executable: true },
  { src: 'post_tool_use.sh',  dest: 'post_tool_use.sh',  executable: true },
  { src: 'agent_start.sh',    dest: 'agent_start.sh',    executable: true }
]

// ─── Claude Code hook event types to register ────────────────────────────────

interface ClaudeHookEntry {
  type: 'command'
  command: string
}
interface ClaudeHookMatcher {
  hooks: ClaudeHookEntry[]
  matcher?: string
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function getClaudeHooksDir(): string {
  return path.join(os.homedir(), '.claude', 'hooks')
}

function getAssetsHooksDir(): string {
  // In production the app is in out/main/index.js; assets/ is packaged alongside.
  // In dev, __dirname is src/main/.
  const candidates = [
    // Production (electron-builder copies assets/ to resources/)
    path.join(process.resourcesPath ?? '', 'assets', 'hooks'),
    // electron-vite dev (assets/ is in project root)
    path.join(app.getAppPath(), 'assets', 'hooks'),
    // Direct dist layout
    path.join(__dirname, '..', '..', 'assets', 'hooks')
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  // Fall back to the last candidate and let callers handle missing files
  return candidates[1]
}

// ─── Settings.json hook registration ─────────────────────────────────────────

/**
 * Merges Ouroboros hook commands into ~/.claude/settings.json so Claude Code
 * actually invokes them. Safe to call multiple times — deduplicates by command.
 */
function registerHooksInSettings(hooksDir: string): void {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')

  // Build the commands for this platform
  const hookCommands: Record<string, string> = process.platform === 'win32'
    ? {
        PreToolUse:    `powershell -ExecutionPolicy Bypass -NonInteractive -File "${path.join(hooksDir, 'pre_tool_use.ps1')}"`,
        PostToolUse:   `powershell -ExecutionPolicy Bypass -NonInteractive -File "${path.join(hooksDir, 'post_tool_use.ps1')}"`,
        SubagentStart: `powershell -ExecutionPolicy Bypass -NonInteractive -File "${path.join(hooksDir, 'agent_start.ps1')}"`,
      }
    : {
        PreToolUse:    path.join(hooksDir, 'pre_tool_use.sh'),
        PostToolUse:   path.join(hooksDir, 'post_tool_use.sh'),
        SubagentStart: path.join(hooksDir, 'agent_start.sh'),
      }

  // Read existing settings (or start fresh)
  let settings: Record<string, unknown> = {}
  try {
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    }
  } catch {
    // Malformed or missing — start fresh
  }

  if (typeof settings !== 'object' || settings === null) settings = {}

  // Ensure hooks section exists
  if (!settings['hooks'] || typeof settings['hooks'] !== 'object') {
    settings['hooks'] = {}
  }
  const hooks = settings['hooks'] as Record<string, ClaudeHookMatcher[]>

  // For each event type, add the command if not already present
  for (const [eventType, command] of Object.entries(hookCommands)) {
    if (!Array.isArray(hooks[eventType])) {
      hooks[eventType] = []
    }

    // Deduplicate — skip if command already registered
    const alreadyRegistered = hooks[eventType].some((entry) =>
      entry.hooks?.some((h) => h.command === command)
    )
    if (alreadyRegistered) continue

    hooks[eventType].push({ hooks: [{ type: 'command', command }] })
    console.log(`[hookInstaller] registered ${eventType} hook in settings.json`)
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
}

// ─── Installer ────────────────────────────────────────────────────────────────

export interface InstallResult {
  installed: boolean
  firstInstall: boolean
  hooksDir: string
  skippedReason?: string
}

export async function installHooks(): Promise<InstallResult> {
  const autoInstall = getConfigValue('autoInstallHooks') as boolean
  if (!autoInstall) {
    return {
      installed: false,
      firstInstall: false,
      hooksDir: getClaudeHooksDir(),
      skippedReason: 'autoInstallHooks disabled in config'
    }
  }

  const hooksDir  = getClaudeHooksDir()
  const assetsDir = getAssetsHooksDir()
  const markerPath = path.join(hooksDir, VERSION_MARKER_FILE)

  // Check version marker
  const installedVersion = readVersionMarker(markerPath)
  if (installedVersion === CURRENT_HOOK_VERSION) {
    return {
      installed: false,
      firstInstall: false,
      hooksDir,
      skippedReason: `hooks already at version ${CURRENT_HOOK_VERSION}`
    }
  }

  const firstInstall = installedVersion === null

  // Ensure target directory exists
  fs.mkdirSync(hooksDir, { recursive: true })

  const hooks = process.platform === 'win32' ? WINDOWS_HOOKS : UNIX_HOOKS

  for (const entry of hooks) {
    const srcPath  = path.join(assetsDir, entry.src)
    const destPath = path.join(hooksDir, entry.dest)

    if (!fs.existsSync(srcPath)) {
      console.warn(`[hookInstaller] source script not found: ${srcPath}`)
      continue
    }

    fs.copyFileSync(srcPath, destPath)

    if (entry.executable && process.platform !== 'win32') {
      fs.chmodSync(destPath, 0o755)
    }

    console.log(`[hookInstaller] installed ${entry.dest} -> ${destPath}`)
  }

  // Write version marker
  fs.writeFileSync(markerPath, CURRENT_HOOK_VERSION, 'utf8')

  // Register hooks in ~/.claude/settings.json so Claude Code actually calls them
  try {
    registerHooksInSettings(hooksDir)
  } catch (err) {
    console.warn('[hookInstaller] could not update settings.json:', err)
  }

  // Notify the user on first install
  if (firstInstall && Notification.isSupported()) {
    const n = new Notification({
      title: 'Ouroboros',
      body: `Hook scripts installed to ${hooksDir}.\nOuroboros will now receive live tool events from Claude Code.`,
      silent: false
    })
    n.show()
  }

  console.log(
    `[hookInstaller] ${firstInstall ? 'first' : 'updated'} install complete — version ${CURRENT_HOOK_VERSION}`
  )

  return { installed: true, firstInstall, hooksDir }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  return readVersionMarker(markerPath) === CURRENT_HOOK_VERSION
}

/** Removes all installed hook scripts and the version marker. */
export function uninstallHooks(): void {
  const hooksDir  = getClaudeHooksDir()
  const allHooks  = [...WINDOWS_HOOKS, ...UNIX_HOOKS]

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
