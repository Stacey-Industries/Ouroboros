/**
 * hookInstaller.ts — Auto-installs Claude Code hook scripts on first launch.
 *
 * Behaviour:
 *  - Copies cross-platform .mjs scripts (+ shared lib/) into ~/.claude/hooks/
 *  - Writes a version marker (~/.claude/hooks/.agent-ide-version)
 *  - Skips installation if the version marker matches CURRENT_HOOK_VERSION
 *  - Removes legacy .ps1/.sh scripts on first .mjs install (best-effort)
 *  - Respects config.autoInstallHooks — if false, does nothing
 *  - Shows an Electron notification on first install
 *
 * Hooks are Node ESM scripts requiring `node` in PATH. Claude Code itself
 * already requires Node, so this is a soft prerequisite.
 */

import crypto from 'crypto';
import { app, Notification } from 'electron';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';

import { getConfigValue } from './config';
import { buildHookCommands } from './hookInstallerCommands';
import { registerTelemetryHooksInSettings } from './hookInstallerSettings';
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
  const hash = crypto.createHash('sha256');
  for (const entry of MJS_HOOKS) {
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
  /** Source path relative to assets/hooks/ (may include subdirs like 'lib/x.mjs') */
  src: string;
  /** Destination path relative to ~/.claude/hooks/ */
  dest: string;
}

/**
 * Cross-platform .mjs hook manifest. Replaces the previous WINDOWS_HOOKS /
 * UNIX_HOOKS split since Node runs everywhere PowerShell and Bash do.
 */
const MJS_HOOKS: HookEntry[] = [
  { src: 'lib/ouroboros.mjs', dest: 'lib/ouroboros.mjs' },
  { src: 'lib/signals.mjs', dest: 'lib/signals.mjs' },
  { src: 'lib/telemetryQueueAppend.mjs', dest: 'lib/telemetryQueueAppend.mjs' },
  { src: 'pre_tool_use.mjs', dest: 'pre_tool_use.mjs' },
  { src: 'post_tool_use.mjs', dest: 'post_tool_use.mjs' },
  { src: 'agent_start.mjs', dest: 'agent_start.mjs' },
  { src: 'agent_end.mjs', dest: 'agent_end.mjs' },
  { src: 'session_start.mjs', dest: 'session_start.mjs' },
  { src: 'session_start_spawn_cost.mjs', dest: 'session_start_spawn_cost.mjs' },
  { src: 'session_stop.mjs', dest: 'session_stop.mjs' },
  { src: 'instructions_loaded.mjs', dest: 'instructions_loaded.mjs' },
  { src: 'statusline_capture.mjs', dest: 'statusline_capture.mjs' },
  { src: 'generic_hook.mjs', dest: 'generic_hook.mjs' },
  { src: 'user_prompt_submit_router_shadow.mjs', dest: 'user_prompt_submit_router_shadow.mjs' },
];

/**
 * Legacy filenames cleaned up on first .mjs install. The version-marker bump
 * (content-hash drives reinstall) ensures every existing user upgrades.
 */
const LEGACY_HOOKS = [
  'pre_tool_use.ps1', 'pre_tool_use.sh',
  'post_tool_use.ps1', 'post_tool_use.sh',
  'agent_start.ps1', 'agent_start.sh',
  'agent_end.ps1', 'agent_end.sh',
  'session_start.ps1', 'session_start.sh',
  'session_stop.ps1', 'session_stop.sh',
  'instructions_loaded.ps1', 'instructions_loaded.sh',
  'statusline_capture.ps1',
  'generic_hook.ps1', 'generic_hook.sh',
  '_token-lookup.ps1', '_token-lookup.sh',
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

  const srcExists = await fsPromises
    .access(srcPath)
    .then(() => true)
    .catch(() => false);
  if (!srcExists) {
    log.warn(`source script not found: ${srcPath}`);
    return;
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from hooks dir + manifest entry
  await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
  await fsPromises.copyFile(srcPath, destPath);

  log.info(`installed ${entry.dest} -> ${destPath}`);
}

async function removeLegacyHooks(hooksDir: string): Promise<void> {
  await Promise.all(
    LEGACY_HOOKS.map(async (name) => {
      const filePath = path.join(hooksDir, name);
      try {
        await fsPromises.rm(filePath, { force: true });
      } catch {
        /* best-effort */
      }
    }),
  );
}

async function installHookFiles(assetsDir: string, hooksDir: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/hooks
  await fsPromises.mkdir(hooksDir, { recursive: true });

  await removeLegacyHooks(hooksDir);
  await Promise.all(MJS_HOOKS.map((entry) => installHookFile(entry, assetsDir, hooksDir)));
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
  try {
    registerTelemetryHooksInSettings(hooksDir);
  } catch (err) {
    log.warn('could not register telemetry hooks in settings.json:', err);
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

/** Removes all installed hook scripts (current + legacy) and the version marker. */
export function uninstallHooks(): void {
  const hooksDir = getClaudeHooksDir();

  for (const entry of MJS_HOOKS) {
    const destPath = path.join(hooksDir, entry.dest);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from hooks dir + manifest entry
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { force: true });
    }
  }

  for (const name of LEGACY_HOOKS) {
    const destPath = path.join(hooksDir, name);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from hooks dir + legacy manifest
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
