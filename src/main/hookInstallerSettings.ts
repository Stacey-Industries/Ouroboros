/**
 * hookInstallerSettings.ts — Registers telemetry hook commands into
 * ~/.claude/settings.json on IDE boot.
 *
 * Handles two telemetry hook entries:
 *   1. SessionStart → session_start_spawn_cost.mjs  (spawn-cost + spawn-trace)
 *   2. UserPromptSubmit → user_prompt_submit_router_shadow.mjs  (router-shadow)
 *
 * Properties:
 *   - Idempotent: running N times is identical to running once.
 *   - Append-only: user entries are never deleted or reordered.
 *   - Atomic write: settings.json is never half-written (tmp + rename).
 *   - First-install backup: original settings.json backed up ONCE.
 *   - Failure-tolerant: logs warn and returns, never throws.
 *
 * Split from hookInstaller.ts to stay under the 300-line ESLint limit.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { readClaudeSettings } from './hookInstaller';
import log from './logger';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HookEntry {
  type: 'command';
  command: string;
}

interface HookMatcher {
  hooks: HookEntry[];
  matcher?: string;
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

/** The two event types and their telemetry hook scripts. */
interface TelemetryHookSpec {
  eventType: string;
  scriptName: string;
}

const TELEMETRY_HOOKS: TelemetryHookSpec[] = [
  { eventType: 'SessionStart', scriptName: 'session_start_spawn_cost.mjs' },
  { eventType: 'UserPromptSubmit', scriptName: 'user_prompt_submit_router_shadow.mjs' },
];

// ─── Command builders ─────────────────────────────────────────────────────────

export function buildTelemetryHookCommand(hooksDir: string, scriptName: string): string {
  return `node "${path.join(hooksDir, scriptName)}"`;
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

function isCommandAlreadyPresent(
  matchers: HookMatcher[],
  command: string,
): boolean {
  return matchers.some((m) => m.hooks?.some((h) => h.command === command));
}

function getOrCreateEventMatchers(
  hooks: Record<string, HookMatcher[]>,
  eventType: string,
): HookMatcher[] {
  // eslint-disable-next-line security/detect-object-injection -- eventType from fixed manifest constant
  if (Array.isArray(hooks[eventType])) {
    // eslint-disable-next-line security/detect-object-injection -- same as above
    return hooks[eventType];
  }
  // eslint-disable-next-line security/detect-object-injection -- same as above
  hooks[eventType] = [];
  // eslint-disable-next-line security/detect-object-injection -- same as above
  return hooks[eventType];
}

function getOrCreateHooksMap(settings: Record<string, unknown>): Record<string, HookMatcher[]> {
  if (typeof settings['hooks'] === 'object' && settings['hooks'] !== null) {
    return settings['hooks'] as Record<string, HookMatcher[]>;
  }
  settings['hooks'] = {};
  return settings['hooks'] as Record<string, HookMatcher[]>;
}

// ─── Backup ───────────────────────────────────────────────────────────────────

/** Returns true if any backup file already exists for this settings path. */
function backupExists(settingsPath: string): boolean {
  const dir = path.dirname(settingsPath);
  const base = path.basename(settingsPath);
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir derived from ~/.claude/settings.json path
    const entries = fs.readdirSync(dir);
    return entries.some((e) => e.startsWith(`${base}.`) && e.endsWith('.bak'));
  } catch {
    return false;
  }
}

function writeFirstInstallBackup(settingsPath: string): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/settings.json
  if (!fs.existsSync(settingsPath)) return;
  if (backupExists(settingsPath)) return;

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const bakPath = `${settingsPath}.${ts}.bak`;
  try {
    fs.copyFileSync(settingsPath, bakPath);
    log.info(`[hookInstallerSettings] backup written to ${bakPath}`);
  } catch (err) {
    log.warn('[hookInstallerSettings] could not write backup:', err);
  }
}

// ─── Atomic write ─────────────────────────────────────────────────────────────

function atomicWriteSettings(settingsPath: string, settings: Record<string, unknown>): void {
  const tmpPath = `${settingsPath}.tmp`;
  const json = JSON.stringify(settings, null, 2);

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/settings.json
    fs.writeFileSync(tmpPath, json, 'utf8');
    // Best-effort fsync via fd — available on Node 16+
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/settings.json
      const fd = fs.openSync(tmpPath, 'r+');
      try {
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // fsync is best-effort; continue to rename
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/settings.json
    fs.renameSync(tmpPath, settingsPath);
  } catch (err) {
    // Clean up tmp on write failure
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/settings.json
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup
    }
    throw err;
  }
}

// ─── Merge logic ──────────────────────────────────────────────────────────────

function mergeManifestIntoSettings(
  settings: Record<string, unknown>,
  hooksDir: string,
): { added: number; alreadyPresent: number } {
  const hooks = getOrCreateHooksMap(settings);
  let added = 0;
  let alreadyPresent = 0;

  for (const spec of TELEMETRY_HOOKS) {
    const command = buildTelemetryHookCommand(hooksDir, spec.scriptName);
    const matchers = getOrCreateEventMatchers(hooks, spec.eventType);

    if (isCommandAlreadyPresent(matchers, command)) {
      alreadyPresent++;
      continue;
    }

    matchers.push({ hooks: [{ type: 'command', command }] });
    added++;
  }

  return { added, alreadyPresent };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Idempotently merges telemetry hook entries into ~/.claude/settings.json.
 *
 * Call after registerStatusLineInSettings() in syncHooksIntoSettings().
 * Never throws — logs warn on any fs error.
 */
export function registerTelemetryHooksInSettings(hooksDir: string): void {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  let settings: Record<string, unknown>;
  let isMalformed = false;

  try {
    settings = readClaudeSettings(settingsPath);
    // readClaudeSettings returns {} for malformed JSON; detect by re-reading
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/settings.json
    if (fs.existsSync(settingsPath)) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/settings.json
        JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch {
        isMalformed = true;
      }
    }
  } catch (err) {
    log.warn('[hookInstallerSettings] could not read settings.json:', err);
    return;
  }

  // Backup on first install OR when the file is malformed (preserve corrupted original)
  const needsBackup = isMalformed || !backupExists(settingsPath);
  if (needsBackup) {
    writeFirstInstallBackup(settingsPath);
  }

  const { added, alreadyPresent } = mergeManifestIntoSettings(settings, hooksDir);

  if (added === 0) {
    log.info(
      `[hookInstallerSettings] telemetry hooks already registered (${alreadyPresent} present)`,
    );
    return;
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/settings.json
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    atomicWriteSettings(settingsPath, settings);
    log.info(
      `[hookInstallerSettings] registered telemetry hooks: ${added} added, ${alreadyPresent} already present`,
    );
  } catch (err) {
    log.warn('[hookInstallerSettings] could not write settings.json:', err);
  }
}
