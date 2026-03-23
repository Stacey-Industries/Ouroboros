/**
 * gitPatch.ts — Git patch application helpers (apply/stage hunks).
 *
 * Split from git.ts to keep that file under the 300-line limit.
 */

import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import type { GitExecFn } from './gitBlameSnapshot';

type GitResponse<T extends object> = ({ success: true } & T) | { success: false; error: string };

function gitErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return (err as Error & { stderr?: string }).stderr?.trim() || err.message;
}

async function writeTempPatch(tmpFile: string, patchContent: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- tmpFile derived from app.getPath('temp') + timestamp, not user input
  await fs.writeFile(tmpFile, patchContent, 'utf-8');
}

function cleanupTempFile(tmpFile: string): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- tmpFile derived from app.getPath('temp') + timestamp, not user input
  void fs.unlink(tmpFile).catch((error) => {
    console.error('[git] Failed to clean up temp patch file:', error);
  });
}

export async function applyPatch(
  gitExec: GitExecFn,
  root: string,
  patchContent: string,
  reverse: boolean = false,
): Promise<GitResponse<Record<string, never>>> {
  const tmpFile = path.join(app.getPath('temp'), `ouroboros-hunk-${Date.now()}.patch`);
  try {
    await writeTempPatch(tmpFile, patchContent);
    const applyArgs = reverse
      ? ['apply', '-R', '--whitespace=nowarn', tmpFile]
      : ['apply', '--whitespace=nowarn', tmpFile];
    await gitExec(applyArgs, { cwd: root });
    return { success: true };
  } catch (err: unknown) {
    // Check if already applied/reverted
    try {
      const checkArgs = reverse
        ? ['apply', '--check', '--whitespace=nowarn', tmpFile]
        : ['apply', '-R', '--check', '--whitespace=nowarn', tmpFile];
      await gitExec(checkArgs, { cwd: root });
      return { success: true };
    } catch {
      return { success: false, error: gitErrorMessage(err) };
    }
  } finally {
    cleanupTempFile(tmpFile);
  }
}

export async function stagePatch(
  gitExec: GitExecFn,
  root: string,
  patchContent: string,
): Promise<GitResponse<Record<string, never>>> {
  const tmpFile = path.join(app.getPath('temp'), `ouroboros-stage-${Date.now()}.patch`);
  try {
    await writeTempPatch(tmpFile, patchContent);
    await gitExec(['apply', '--cached', '--whitespace=nowarn', tmpFile], { cwd: root });
    return { success: true };
  } catch (err: unknown) {
    // Check if already staged
    try {
      await gitExec(['apply', '--cached', '--reverse', '--check', '--whitespace=nowarn', tmpFile], {
        cwd: root,
      });
      return { success: true };
    } catch {
      return { success: false, error: gitErrorMessage(err) };
    }
  } finally {
    cleanupTempFile(tmpFile);
  }
}
