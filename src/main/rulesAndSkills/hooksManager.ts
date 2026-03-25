/** Read/write hooks in .claude/settings.json. */

import type { ClaudeHookMatcher, HooksConfig } from '@shared/types/rulesAndSkills';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// ─── Path helpers ─────────────────────────────────────────────────────────────

export function getSettingsPath(
  scope: 'global' | 'project',
  projectRoot?: string,
): string {
  if (scope === 'global') {
    return path.join(os.homedir(), '.claude', 'settings.json');
  }
  if (!projectRoot) throw new Error('projectRoot required for project scope');
  return path.join(projectRoot, '.claude', 'settings.json');
}

// ─── Settings I/O ────────────────────────────────────────────────────────────

async function readSettings(settingsPath: string): Promise<Record<string, unknown>> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from getSettingsPath (known safe locations)
    const raw = await fs.readFile(settingsPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function writeSettings(
  settingsPath: string,
  settings: Record<string, unknown>,
): Promise<void> {
  const dir = path.dirname(settingsPath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from getSettingsPath (known safe locations)
  await fs.mkdir(dir, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from getSettingsPath (known safe locations)
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

// ─── Hooks extraction helpers ─────────────────────────────────────────────────

function extractHooksMap(settings: Record<string, unknown>): HooksConfig {
  const hooks = settings['hooks'];
  if (typeof hooks === 'object' && hooks !== null) {
    return hooks as HooksConfig;
  }
  return {};
}

function getMatchersForEvent(
  hooks: HooksConfig,
  eventType: string,
): ClaudeHookMatcher[] {
  // eslint-disable-next-line security/detect-object-injection -- eventType from HookEventType (controlled caller input)
  return Array.isArray(hooks[eventType]) ? hooks[eventType] : [];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function readHooksConfig(
  scope: 'global' | 'project',
  projectRoot?: string,
): Promise<HooksConfig> {
  const settingsPath = getSettingsPath(scope, projectRoot);
  const settings = await readSettings(settingsPath);
  return extractHooksMap(settings);
}

export interface AddHookOptions {
  scope: 'global' | 'project';
  eventType: string;
  command: string;
  matcher?: string;
  projectRoot?: string;
}

export async function addHook(options: AddHookOptions): Promise<void> {
  const { scope, eventType, command, matcher, projectRoot } = options;
  const settingsPath = getSettingsPath(scope, projectRoot);
  const settings = await readSettings(settingsPath);
  const hooks = extractHooksMap(settings);

  const matchers = getMatchersForEvent(hooks, eventType);
  const entry: ClaudeHookMatcher = { hooks: [{ type: 'command', command }] };
  if (matcher) entry.matcher = matcher;
  matchers.push(entry);

  // eslint-disable-next-line security/detect-object-injection -- eventType from controlled caller input
  hooks[eventType] = matchers;
  settings['hooks'] = hooks;
  await writeSettings(settingsPath, settings);
}

export async function removeHook(
  scope: 'global' | 'project',
  eventType: string,
  index: number,
  projectRoot?: string,
): Promise<void> {
  const settingsPath = getSettingsPath(scope, projectRoot);
  const settings = await readSettings(settingsPath);
  const hooks = extractHooksMap(settings);

  const matchers = getMatchersForEvent(hooks, eventType);
  matchers.splice(index, 1);

  // eslint-disable-next-line security/detect-object-injection -- eventType from controlled caller input
  hooks[eventType] = matchers;
  settings['hooks'] = hooks;
  await writeSettings(settingsPath, settings);
}
