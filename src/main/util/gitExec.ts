/**
 * gitExec.ts — portable `git` subprocess wrapper.
 *
 * Extracted from `ipc-handlers/gitOperations.ts` so it's importable from
 * subsystems that don't run inside Electron (the standalone MCP server,
 * Wave 60). The original location pulled in a chain of IDE-only modules
 * (extensions, contextLayer, agentChat) at import time, which crashed
 * the standalone bundle.
 *
 * Pure: only uses `child_process.execFile` and module-level constants.
 * No Electron, no IDE state, no transitive IDE deps.
 *
 * `gitOperations.ts` re-exports these symbols so existing IDE callers
 * keep their `import ... from '../ipc-handlers/gitOperations'` paths.
 */

import { execFile } from 'child_process';

export const GIT_TIMEOUT_MS = 30_000;
export const MB = 1024 * 1024;

export function gitExec(
  args: string[],
  opts: { cwd: string; maxBuffer?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { ...opts, timeout: GIT_TIMEOUT_MS, maxBuffer: opts.maxBuffer ?? MB },
      (err, stdout, stderr) => (err ? reject(err) : resolve({ stdout, stderr })),
    );
  });
}

export async function gitStdout(
  root: string,
  args: string[],
  maxBuffer: number = MB,
): Promise<string> {
  return (await gitExec(args, { cwd: root, maxBuffer })).stdout;
}
