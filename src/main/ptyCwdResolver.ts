/**
 * ptyCwdResolver.ts — OS-aware PTY current working directory resolver.
 *
 * Provides a single `resolvePtyCwd` function used by both `pty.ts` and
 * `ptyHost/ptyHostMain.ts`. Each platform uses the best available mechanism;
 * all branches fall back to `fallbackCwd` on any error.
 *
 * Known limitation (win32): Windows does not expose a foreign process's cwd
 * without elevated privileges or NtQueryInformationProcess. See issue #25.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

import log from './logger';

const execFileAsync = promisify(execFile);

// Module-local flag so we only log the Windows limitation once per process.
let warnedWindows = false;

async function resolveLinux(pid: number, fallbackCwd: string): Promise<string> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path uses process PID, not user input
    return await fs.readlink('/proc/' + pid + '/cwd');
  } catch {
    return fallbackCwd;
  }
}

async function resolveDarwin(pid: number, fallbackCwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
    const line = stdout.split('\n').find((l) => l.startsWith('n'));
    return line ? line.slice(1) : fallbackCwd;
  } catch {
    return fallbackCwd;
  }
}

/**
 * Resolves the current working directory of a running process identified by
 * `pid`. Falls back to `fallbackCwd` when the platform lacks support or the
 * resolution fails (process gone, permissions, missing tools, etc.).
 */
export async function resolvePtyCwd(pid: number, fallbackCwd: string): Promise<string> {
  try {
    if (process.platform === 'linux') return resolveLinux(pid, fallbackCwd);
    if (process.platform === 'darwin') return resolveDarwin(pid, fallbackCwd);
    if (process.platform === 'win32') {
      // Known limitation: Windows does not expose foreign process cwd without
      // elevated privileges or NtQueryInformationProcess. See issue #25.
      if (!warnedWindows) {
        log.debug('[ptyCwdResolver] Windows cwd resolution unsupported; returning spawn-time cwd');
        warnedWindows = true;
      }
      return fallbackCwd;
    }
    return fallbackCwd;
  } catch {
    return fallbackCwd;
  }
}
