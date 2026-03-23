/**
 * ptyAgent.ts — Agent PTY spawner (Claude in stream-json mode with dual streaming).
 * Extracted from pty.ts to keep each file under the 300-line limit.
 */

import { BrowserWindow } from 'electron';
import * as pty from 'node-pty';

import log from './logger';
import type {
  StreamJsonEvent,
  StreamJsonResultEvent,
} from './orchestration/providers/streamJsonTypes';
import {
  cleanupSession,
  escapePowerShellArg,
  notifyTerminalCreated,
  registerSession,
  sessions,
} from './pty';
import type { AgentBridgeHandle } from './ptyAgentBridge';
import { createAgentBridge } from './ptyAgentBridge';
import { buildBaseEnv, buildProviderEnv, resolveSpawnOptions } from './ptyEnv';

export interface AgentPtyOptions {
  prompt: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  model?: string;
  permissionMode?: string;
  dangerouslySkipPermissions?: boolean;
  resumeSessionId?: string;
  continueSession?: boolean;
  /** 'low' | 'medium' | 'high' | 'max', or a numeric string for explicit --max-turns */
  effort?: string;
  onEvent?: (event: StreamJsonEvent) => void;
}

export interface AgentPtyResult {
  success: boolean;
  error?: string;
  sessionId?: string;
  bridge?: AgentBridgeHandle;
  result?: Promise<StreamJsonResultEvent | null>;
}

function buildAgentPtyClaudeArgs(options: AgentPtyOptions): { shell: string; args: string[] } {
  const cliArgs: string[] = ['-p', '--verbose', '--output-format', 'stream-json'];
  if (options.model) cliArgs.push('--model', options.model);
  if (options.permissionMode) cliArgs.push('--permission-mode', options.permissionMode);
  if (options.dangerouslySkipPermissions) cliArgs.push('--dangerously-skip-permissions');
  if (options.continueSession) cliArgs.push('--continue');
  if (options.resumeSessionId) cliArgs.push('--resume', options.resumeSessionId);
  if (options.effort) {
    const effortMap: Record<string, number> = { low: 3, medium: 10, high: 25 };

    const mapped = effortMap[options.effort];
    if (mapped !== undefined) {
      cliArgs.push('--max-turns', String(mapped));
    } else if (options.effort !== 'max') {
      cliArgs.push('--max-turns', options.effort);
    }
  }
  if (process.platform === 'win32') {
    // Security: single-quote escaping prevents command injection via PowerShell metacharacters
    const escaped = ['claude', ...cliArgs].map(escapePowerShellArg).join(' ');
    return { shell: 'powershell.exe', args: ['-NoLogo', '-Command', `& ${escaped}`] };
  }
  return { shell: 'claude', args: cliArgs };
}

interface AgentBridgeSetup {
  bridge: ReturnType<typeof createAgentBridge>;
  result: Promise<StreamJsonResultEvent | null>;
}

function createAgentBridgeWithResult(id: string, options: AgentPtyOptions): AgentBridgeSetup {
  let resolveResult!: (value: StreamJsonResultEvent | null) => void;
  let rejectResult!: (reason: unknown) => void;
  let settled = false;
  const result = new Promise<StreamJsonResultEvent | null>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const bridge = createAgentBridge({
    sessionId: id,
    onEvent: (event) => {
      options.onEvent?.(event);
    },
    onComplete: (res, exitCode) => {
      if (settled) return;
      settled = true;
      if (res) {
        resolveResult(res);
      } else if (exitCode && exitCode !== 0) {
        rejectResult(new Error(`Claude Code exited with code ${exitCode}`));
      } else {
        resolveResult(null);
      }
    },
  });
  const originalDispose = bridge.dispose.bind(bridge);
  bridge.dispose = () => {
    if (!settled) {
      settled = true;
      resolveResult(null);
    }
    originalDispose();
  };
  return { bridge, result };
}

function wireBridgeToProc(
  id: string,
  proc: pty.IPty,
  bridge: ReturnType<typeof createAgentBridge>,
): void {
  let earlyOutput = '';
  const captureLimit = 2000;
  proc.onData((data: string) => {
    if (earlyOutput.length < captureLimit) earlyOutput += data;
    bridge.feed(data);
  });
  proc.onExit(({ exitCode }) => {
    if (exitCode && exitCode !== 0) {
      log.error(
        `session ${id} exited with code ${exitCode}. Early output:\n${earlyOutput.slice(0, captureLimit)}`,
      );
    }
    bridge.handleExit(exitCode);
  });
}

/** Spawn a PTY session running Claude in stream-json mode with dual streaming (xterm + AgentBridge). */
export function spawnAgentPty(
  id: string,
  win: BrowserWindow,
  options: AgentPtyOptions,
): AgentPtyResult {
  if (sessions.has(id)) return { success: false, error: `Session ${id} already exists` };

  const { cwd, cols, rows } = resolveSpawnOptions({
    cwd: options.cwd,
    cols: options.cols,
    rows: options.rows,
  });
  const launch = buildAgentPtyClaudeArgs(options);
  try {
    const proc = pty.spawn(launch.shell, launch.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: buildBaseEnv({ ...buildProviderEnv('agentChat'), ...options.env }),
    });
    registerSession({ id, proc, cwd, shell: launch.shell, win });
    const { bridge, result } = createAgentBridgeWithResult(id, options);
    wireBridgeToProc(id, proc, bridge);
    const eofChar = process.platform === 'win32' ? '\x1a' : '\x04';
    setTimeout(() => {
      if (sessions.has(id)) {
        proc.write(options.prompt);
        proc.write(eofChar);
      }
    }, 150);
    notifyTerminalCreated(id, cwd);
    return { success: true, sessionId: id, bridge, result };
  } catch (error) {
    cleanupSession(id);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
