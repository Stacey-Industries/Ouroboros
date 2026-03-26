/**
 * settingsManager.ts — Generic read/write for Claude Code settings files.
 *
 * Global:  ~/.claude/settings.json
 * Project: {projectRoot}/.claude/settings.local.json
 */

import type { ClaudeConfigScope } from '@shared/types/claudeConfig';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const CLAUDE_DIR = '.claude';
const GLOBAL_SETTINGS = 'settings.json';
const PROJECT_SETTINGS = 'settings.local.json';

// ─── Path resolution ─────────────────────────────────────────────────────────

export function getClaudeSettingsPath(
  scope: ClaudeConfigScope,
  projectRoot?: string,
): string {
  if (scope === 'global') {
    return path.join(os.homedir(), CLAUDE_DIR, GLOBAL_SETTINGS);
  }
  if (!projectRoot) {
    throw new Error('projectRoot is required for project scope');
  }
  return path.join(projectRoot, CLAUDE_DIR, PROJECT_SETTINGS);
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function readClaudeSettings(
  scope: ClaudeConfigScope,
  projectRoot?: string,
): Promise<Record<string, unknown>> {
  const settingsPath = getClaudeSettingsPath(scope, projectRoot);
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from getClaudeSettingsPath (known safe: homedir or projectRoot)
    const raw = await fs.readFile(settingsPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function readClaudeSettingsKey(
  scope: ClaudeConfigScope,
  key: string,
  projectRoot?: string,
): Promise<unknown> {
  const settings = await readClaudeSettings(scope, projectRoot);
  // eslint-disable-next-line security/detect-object-injection -- key from controlled caller input (IPC handler validates)
  return settings[key];
}

// ─── Write ───────────────────────────────────────────────────────────────────

export async function writeClaudeSettingsKey(
  scope: ClaudeConfigScope,
  key: string,
  value: unknown,
  projectRoot?: string,
): Promise<void> {
  const settingsPath = getClaudeSettingsPath(scope, projectRoot);
  const dir = path.dirname(settingsPath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from getClaudeSettingsPath (known safe: homedir or projectRoot)
  await fs.mkdir(dir, { recursive: true });

  const settings = await readClaudeSettings(scope, projectRoot);
  // eslint-disable-next-line security/detect-object-injection -- key from controlled caller input (IPC handler validates)
  settings[key] = value;

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from getClaudeSettingsPath (known safe: homedir or projectRoot)
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}
