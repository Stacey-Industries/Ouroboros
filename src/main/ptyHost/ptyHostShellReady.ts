/**
 * ptyHostShellReady.ts — Shell-ready detection inside PtyHost utility process.
 *
 * Adapted from src/main/ptyShellReady.ts. Uses plain console (electron-log
 * is not available in utility processes).
 */

import type * as pty from 'node-pty';

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
    console.warn(`[ptyHost shell-ready] writing command (${source}) for ${id}`);
    proc.write(command + '\r');
  };

  const timeout = setTimeout(() => {
    console.warn(`[ptyHost shell-ready] timeout for ${id}, writing anyway`);
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
