/**
 * ptySpawn.ts — Claude Code and Codex PTY session spawners.
 * Extracted from pty.ts to keep each file under the 300-line limit.
 */

import { BrowserWindow } from 'electron';
import * as pty from 'node-pty';

import { type ClaudeCliSettings, type CodexCliSettings } from './config';
import log from './logger';
import {
  cleanupSession,
  escapePowerShellArg,
  notifyTerminalCreated,
  registerSession,
  scheduleStartupCommand,
  sessions,
  type SpawnOptions,
} from './pty';
import { buildClaudeArgs } from './ptyClaude';
import { buildCodexArgs, buildCodexLaunchArgs } from './ptyCodex';
import { buildBaseEnv, buildProviderEnv, resolveSpawnOptions } from './ptyEnv';

function buildClaudeLaunchArgs(
  baseArgs: string[],
  resumeMode?: 'continue' | string,
): { shell: string; args: string[] } {
  const claudeArgs = [...baseArgs];
  if (resumeMode === 'continue') {
    claudeArgs.push('--continue');
  } else if (resumeMode) {
    claudeArgs.push('--resume', resumeMode);
  }

  if (process.platform === 'win32') {
    // Security: single-quote escaping prevents command injection via PowerShell metacharacters
    const escaped = ['claude', ...claudeArgs].map(escapePowerShellArg).join(' ');
    return { shell: 'powershell.exe', args: ['-NoLogo', '-NoExit', '-Command', `& ${escaped}`] };
  }
  return { shell: 'claude', args: claudeArgs };
}

export function spawnClaudePty(
  id: string,
  win: BrowserWindow,
  settings: ClaudeCliSettings,
  options: SpawnOptions & { initialPrompt?: string } = {},
): { success: boolean; error?: string } {
  if (sessions.has(id)) return { success: false, error: `Session ${id} already exists` };

  const { cwd, cols, rows } = resolveSpawnOptions(options);
  const launch = buildClaudeLaunchArgs(buildClaudeArgs(settings), options.resumeMode);
  log.debug(
    `[pty] spawnClaude id=${id} shell=${launch.shell} args=${JSON.stringify(launch.args)} cwd=${cwd}`,
  );
  try {
    const proc = pty.spawn(launch.shell, launch.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: buildBaseEnv({ ...buildProviderEnv('terminal'), ...options.env }),
    });
    registerSession({ id, proc, cwd, shell: launch.shell, win });
    if (options.initialPrompt) scheduleStartupCommand(id, proc, options.initialPrompt);
    notifyTerminalCreated(id, cwd);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error(`[pty] spawnClaude failed id=${id}: ${msg}`);
    cleanupSession(id);
    return { success: false, error: msg };
  }
}

export function spawnCodexPty(
  id: string,
  win: BrowserWindow,
  settings: CodexCliSettings,
  options: SpawnOptions & { initialPrompt?: string; resumeThreadId?: string } = {},
): { success: boolean; error?: string } {
  if (sessions.has(id)) return { success: false, error: `Session ${id} already exists` };

  const { cwd, cols, rows } = resolveSpawnOptions(options);
  const launch = buildCodexLaunchArgs(buildCodexArgs(settings), options.resumeThreadId);
  try {
    const proc = pty.spawn(launch.shell, launch.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: buildBaseEnv(options.env),
    });
    registerSession({ id, proc, cwd, shell: launch.shell, win });
    if (options.initialPrompt) scheduleStartupCommand(id, proc, options.initialPrompt);
    notifyTerminalCreated(id, cwd);
    return { success: true };
  } catch (error) {
    cleanupSession(id);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
