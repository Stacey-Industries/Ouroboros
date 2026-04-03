/**
 * hookInstallerStatusLine.ts — Registers the Ouroboros status-line capture
 * command into ~/.claude/settings.json.
 *
 * Split from hookInstaller.ts to keep each file under the 300-line ESLint limit.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { readClaudeSettings } from './hookInstaller';
import log from './logger';

// ─── Status-line helpers ──────────────────────────────────────────────────────

export function buildStatusLineCommand(hooksDir: string): string {
  const scriptPath = path.join(hooksDir, 'statusline_capture.ps1');
  if (process.platform === 'win32') {
    return `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;
  }
  return path.join(hooksDir, 'statusline_capture.sh');
}

export function isOuroborosStatusLine(
  settings: Record<string, unknown>,
  hooksDir: string,
): boolean {
  const sl = settings['statusLine'] as Record<string, unknown> | undefined;
  if (!sl || typeof sl.command !== 'string') return false;
  return sl.command.includes(path.join(hooksDir, 'statusline_capture'));
}

export function registerStatusLineInSettings(hooksDir: string): void {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = readClaudeSettings(settingsPath);

  // Don't overwrite a user-configured statusLine (unless it's ours)
  if (settings['statusLine'] && !isOuroborosStatusLine(settings, hooksDir)) {
    log.info('existing statusLine found in settings.json — skipping capture registration');
    return;
  }

  settings['statusLine'] = {
    type: 'command',
    command: buildStatusLineCommand(hooksDir),
  };

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from ~/.claude/settings.json
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  log.info('registered statusLine capture in settings.json');
}
