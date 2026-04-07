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

import crypto from 'crypto';
import { app, Notification } from 'electron';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';

import { getConfigValue } from './config';
import { buildHookCommands } from './hookInstallerCommands';
import { registerStatusLineInSettings } from './hookInstallerStatusLine';
import log from './logger';

// ─── Version ──────────────────────────────────────────────────────────────────
// Auto-computed from hook script contents — no manual bumping needed.
// Any change to a hook script file automatically triggers re-installation.
let _cachedVersion: string | null = null;

export function invalidateHookVersionCache(): void {
  _cachedVersion = null;
}

export function getCurrentHookVersion(): string {
  if (_cachedVersion) return _cachedVersion;
  const assetsDir = getAssetsHooksDir();
  const hooks = getPlatformHooks();
  const hash = crypto.createHash('sha256');
  for (const entry of hooks) {
    const filePath = path.join(assetsDir, entry.src);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from known assets dir + manifest entry
      hash.update(fs.readFileSync(filePath));
    } catch {
      hash.update(entry.src); // fallback: use filename if file missing
    }
  }
  _cachedVersion = hash.digest('hex').slice(0, 16);
  return _cachedVersion;
}
// Keep a static export for backward compat (e.g. logs, settings UI)
export const CURRENT_HOOK_VERSION = 'auto';

const VERSION_MARKER_FILE = '.agent-ide-version';

// ─── Hook file manifests ──────────────────────────────────────────────────────

interface HookEntry {
  /** Source filename inside assets/hooks/ */
  src: string;
  /** Destination filename inside ~/.claude/hooks/ */
  dest: string;
  /** Make executable (macOS/Linux .sh scripts) */
  executable: boolean;
}

const WINDOWS_HOOKS: HookEntry[] = [
  { src: 'pre_tool_use.ps1', dest: 'pre_tool_use.ps1', executable: false },
  { src: 'post_tool_use.ps1', dest: 'post_tool_use.ps1', executable: false },
  { src: 'agent_start.ps1', dest: 'agent_start.ps1', executable: false },
  { src: 'agent_end.ps1', dest: 'agent_end.ps1', executable: false },
  { src: 'session_start.ps1', dest: 'session_start.ps1', executable: false },
  { src: 'session_stop.ps1', dest: 'session_stop.ps1', executable: false },
  { src: 'instructions_loaded.ps1', dest: 'instructions_loaded.ps1', executable: false },
  { src: 'statusline_capture.ps1', dest: 'statusline_capture.ps1', executable: false },
  { src: 'generic_hook.ps1', dest: 'generic_hook.ps1', executable: false },
];

const UNIX_HOOKS: HookEntry[] = [
  { src: 'pre_tool_use.sh', dest: 'pre_tool_use.sh', executable: true },
  { src: 'post_tool_use.sh', dest: 'post_tool_use.sh', executable: true },
  { src: 'agent_start.sh', dest: 'agent_start.sh', executable: true },
  { src: 'session_start.sh', dest: 'session_start.sh', executable: true },
  { src: 'instructions_loaded.sh', dest: 'instructions_loaded.sh', executable: true },
  { src: 'generic_hook.sh', dest: 'generic_hook.sh', executable: true },
  { src: 'session_stop.sh', dest: 'session_stop.sh', executable: true },
  { src: 'agent_end.sh', dest: 'agent_end.sh', executable: true },
];

// ─── Claude Code hook event types to register ────────────────────────────────

interface ClaudeHookEntry {
  type: 'command';
  command: string;
}

interface ClaudeHookMatcher {
  hooks: ClaudeHookEntry[];
  matcher?: string;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function getClaudeHooksDir(): string {
  return path.join(os.homedir(), '.claude', 'hooks');
}

function getAssetsHooksDir(): string {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'assets', 'hooks'),
    path.join(app.getAppPath(), 'assets', 'hooks'),
    path.join(__dirname, '..', '..', 'assets', 'hooks'),
  ];

  for (const candidate of candidates) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from known app paths
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[1];
}

function getPlatformHooks(): HookEntry[] {
  return process.platform === 'win32' ? WINDOWS_HOOKS : UNIX_HOOKS;
}

export function readClaudeSettings(settingsPath: string): Record<string, unknown> {
  let settings: unknown = {};

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/settings.json
    if (fs.existsSync(settingsPath)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/settings.json
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch {
    return {};
  }

  return typeof settings === 'object' && settings !== null
    ? (settings as Record<string, unknown>)
    : {};
}

function ensureHooksMap(settings: Record<string, unknown>): Record<string, ClaudeHookMatcher[]> {
  const hooks = settings['hooks'];
  if (typeof hooks === 'object' && hooks !== null) {
    return hooks as Record<string, ClaudeHookMatcher[]>;
  }

  settings['hooks'] = {};
  return settings['hooks'] as Record<string, ClaudeHookMatcher[]>;
}

function ensureHookMatchers(
  hooks: Record<string, ClaudeHookMatcher[]>,
  eventType: string,
): ClaudeHookMatcher[] {
  // eslint-disable-next-line security/detect-object-injection -- eventType from buildHookCommands (fixed set of known keys)
  if (Array.isArray(hooks[eventType])) {
    // eslint-disable-next-line security/detect-object-injection -- same as above
    return hooks[eventType];
  }

  // eslint-disable-next-line security/detect-object-injection -- same as above
  hooks[eventType] = [];
  // eslint-disable-next-line security/detect-object-injection -- same as above
  return hooks[eventType];
}

function registerHookCommand(entries: ClaudeHookMatcher[], command: string): boolean {
  const alreadyRegistered = entries.some((entry) =>
    entry.hooks?.some((hook) => hook.command === command),
  );

  if (alreadyRegistered) return false;

  entries.push({ hooks: [{ type: 'command', command }] });
  return true;
}

// ─── Settings.json hook registration ─────────────────────────────────────────

/**
 * Merges Ouroboros hook commands into ~/.claude/settings.json so Claude Code
 * actually invokes them. Safe to call multiple times — deduplicates by command.
 */
async function registerHooksInSettings(hooksDir: string): Promise<void> {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = readClaudeSettings(settingsPath);
  const hooks = ensureHooksMap(settings);

  for (const [eventType, command] of Object.entries(buildHookCommands(hooksDir))) {
    const entries = ensureHookMatchers(hooks, eventType);
    if (!registerHookCommand(entries, command)) continue;
    log.info(`registered ${eventType} hook in settings.json`);
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/settings.json
  await fsPromises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

// ─── Installer ────────────────────────────────────────────────────────────────

export interface InstallResult {
  installed: boolean;
  firstInstall: boolean;
  hooksDir: string;
  skippedReason?: string;
}

function createSkippedInstallResult(hooksDir: string, skippedReason: string): InstallResult {
  return {
    installed: false,
    firstInstall: false,
    hooksDir,
    skippedReason,
  };
}

async function installHookFile(
  entry: HookEntry,
  assetsDir: string,
  hooksDir: string,
): Promise<void> {
  const srcPath = path.join(assetsDir, entry.src);
  const destPath = path.join(hooksDir, entry.dest);

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from assets dir + hook manifest entry
  const srcExists = await fsPromises
    .access(srcPath)
    .then(() => true)
    .catch(() => false);
  if (!srcExists) {
    log.warn(`source script not found: ${srcPath}`);
    return;
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from hooks dir + hook manifest entry
  await fsPromises.copyFile(srcPath, destPath);

  if (entry.executable && process.platform !== 'win32') {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from hooks dir + hook manifest entry
    await fsPromises.chmod(destPath, 0o755);
  }

  log.info(`installed ${entry.dest} -> ${destPath}`);
}

async function installHookFiles(assetsDir: string, hooksDir: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/hooks
  await fsPromises.mkdir(hooksDir, { recursive: true });

  await Promise.all(getPlatformHooks().map((entry) => installHookFile(entry, assetsDir, hooksDir)));
}

async function writeVersionMarker(markerPath: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/hooks version marker
  await fsPromises.writeFile(markerPath, getCurrentHookVersion(), 'utf8');
}

async function syncHooksIntoSettings(hooksDir: string): Promise<void> {
  try {
    await registerHooksInSettings(hooksDir);
    registerStatusLineInSettings(hooksDir);
  } catch (err) {
    log.warn('could not update settings.json:', err);
  }
}

function maybeShowInstallNotification(firstInstall: boolean, hooksDir: string): void {
  if (!firstInstall || !Notification.isSupported()) return;

  const notification = new Notification({
    title: 'Ouroboros',
    body: `Hook scripts installed to ${hooksDir}.\nOuroboros will now receive live tool events from Claude Code.`,
    silent: false,
  });

  notification.show();
}

function logInstallComplete(firstInstall: boolean): void {
  log.info(
    `${firstInstall ? 'first' : 'updated'} install complete — version ${getCurrentHookVersion()}`,
  );
}

export async function installHooks(): Promise<InstallResult> {
  const hooksDir = getClaudeHooksDir();
  const autoInstall = getConfigValue('autoInstallHooks') as boolean;

  if (!autoInstall) {
    return createSkippedInstallResult(hooksDir, 'autoInstallHooks disabled in config');
  }

  invalidateHookVersionCache();
  const markerPath = path.join(hooksDir, VERSION_MARKER_FILE);
  const installedVersion = await readVersionMarker(markerPath);

  const currentVersion = getCurrentHookVersion();
  if (installedVersion === currentVersion) {
    return createSkippedInstallResult(hooksDir, `hooks already at version ${currentVersion}`);
  }

  const firstInstall = installedVersion === null;

  await installHookFiles(getAssetsHooksDir(), hooksDir);
  await writeVersionMarker(markerPath);
  await syncHooksIntoSettings(hooksDir);
  maybeShowInstallNotification(firstInstall, hooksDir);
  logInstallComplete(firstInstall);

  return { installed: true, firstInstall, hooksDir };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readVersionMarker(markerPath: string): Promise<string | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/hooks version marker
    const content = await fsPromises.readFile(markerPath, 'utf8');
    return content.trim() || null;
  } catch {
    return null;
  }
}

/** Returns true if hooks are installed at the current version. */
export async function hooksAreUpToDate(): Promise<boolean> {
  invalidateHookVersionCache();
  const markerPath = path.join(getClaudeHooksDir(), VERSION_MARKER_FILE);
  return (await readVersionMarker(markerPath)) === getCurrentHookVersion();
}

/** Removes all installed hook scripts and the version marker. */
export function uninstallHooks(): void {
  const hooksDir = getClaudeHooksDir();
  const allHooks = [...WINDOWS_HOOKS, ...UNIX_HOOKS];

  for (const entry of allHooks) {
    const destPath = path.join(hooksDir, entry.dest);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from hooks dir + hook manifest entry
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { force: true });
    }
  }

  const markerPath = path.join(hooksDir, VERSION_MARKER_FILE);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/hooks version marker
  if (fs.existsSync(markerPath)) {
    fs.rmSync(markerPath, { force: true });
  }

  log.info('hooks uninstalled');
}
