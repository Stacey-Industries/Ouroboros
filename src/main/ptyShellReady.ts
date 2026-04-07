/**
 * ptyShellReady.ts — Detects when a PTY shell is ready to accept input.
 *
 * Primary detection: OSC 633;A sequence (shell integration prompt start).
 * Fallback: timeout after FALLBACK_TIMEOUT_MS, writes the command anyway.
 *
 * The project injects OSC 633 shell integration scripts for bash, zsh, and
 * PowerShell via buildShellEnvWithIntegration(). When integration is active,
 * the shell emits `\x1b]633;A\x07` just before rendering its prompt —
 * that's the reliable "shell is ready" signal.
 */

import type * as pty from 'node-pty';

import log from './logger';

const FALLBACK_TIMEOUT_MS = 5_000;

/* eslint-disable no-control-regex */
const OSC_633_A = /\x1b\]633;A/;
/* eslint-enable no-control-regex */

/**
 * Write `command` to the PTY once the shell signals readiness via OSC 633;A.
 * Falls back to a timeout if the shell doesn't emit integration sequences.
 */
export function writeOnShellReady(
  id: string,
  proc: pty.IPty,
  command: string,
  sessions: ReadonlyMap<string, unknown>,
): void {
  let fired = false;

  const fire = (source: string): void => {
    if (fired) return;
    fired = true;
    cleanup();
    if (!sessions.has(id)) return;
    log.info(`[shell-ready] writing command (${source}) for ${id}`);
    proc.write(command + '\r');
  };

  const timeout = setTimeout(() => {
    log.warn(`[shell-ready] timeout for ${id}, writing anyway`);
    fire('timeout');
  }, FALLBACK_TIMEOUT_MS);

  const disposable = proc.onData((data: string) => {
    if (OSC_633_A.test(data)) {
      fire('osc633');
    }
  });

  const cleanup = (): void => {
    clearTimeout(timeout);
    disposable.dispose();
  };
}
