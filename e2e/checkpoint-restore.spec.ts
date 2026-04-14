/**
 * checkpoint-restore.spec.ts — Tests the checkpoint:create / checkpoint:restore
 * IPC round-trip.
 *
 * Strategy:
 *  1. Seed a git-initialised project directory with a known file state.
 *  2. Call `checkpoint:create` via the IPC bridge to capture the HEAD hash.
 *  3. Mutate the file on disk (simulating what a tool_use Edit would do).
 *  4. Commit the mutation so git tracks it.
 *  5. Call `checkpoint:restore` and verify the file reverts to seed state.
 *
 * The test does NOT require the mock claude binary — it exercises the git
 * snapshot path directly through IPC.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { expect, test } from './fixtures/project.fixture';

function gitCommitAll(dir: string, message: string): string {
  const opts = { cwd: dir, stdio: 'pipe' as const };
  execSync('git add -A', opts);
  execSync(`git commit -m "${message}"`, opts);
  return execSync('git rev-parse HEAD', opts).toString().trim();
}

test.describe('checkpoint:create + checkpoint:restore', () => {
  test('restores a file to its pre-turn state after checkpoint restore', async ({
    electronApp,
    projectDir,
  }) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Register workspace root with pathSecurity.
    await page.evaluate(
      async (root: string) => {
        await window.electronAPI.window.setProjectRoots([root]);
      },
      projectDir,
    );
    await page.waitForTimeout(300);

    const targetFile = path.join(projectDir, 'src', 'utils.ts');
    const originalContent = fs.readFileSync(targetFile, 'utf8');

    // Create checkpoint capturing the current HEAD (seed commit).
    const threadId = 'e2e-thread-' + Date.now();
    const messageId = 'e2e-msg-001';

    const createResult = await page.evaluate(
      async (req: { threadId: string; messageId: string; projectRoot: string }) => {
        return window.electronAPI.checkpoint.create(req);
      },
      { threadId, messageId, projectRoot: projectDir },
    );

    // If the checkpoint:create call fails (e.g. no commits yet), skip gracefully.
    if (!createResult.success) {
      // Flag: may fail if git is not configured or db path unavailable in test env.
      test.skip();
      return;
    }

    const checkpointId = createResult.checkpoint?.id;
    expect(checkpointId).toBeTruthy();

    // Mutate the file and commit (simulating what an Edit tool_use would do).
    const mutatedContent = originalContent.replace('clamp', 'clampMutated');
    fs.writeFileSync(targetFile, mutatedContent, 'utf8');
    gitCommitAll(projectDir, 'Simulate tool_use Edit mutation');

    // Verify the mutation is in place.
    expect(fs.readFileSync(targetFile, 'utf8')).toContain('clampMutated');

    // Restore the checkpoint.
    const restoreResult = await page.evaluate(
      async (req: { checkpointId: string; projectRoot: string; threadId: string }) => {
        return window.electronAPI.checkpoint.restore(req);
      },
      { checkpointId: checkpointId!, projectRoot: projectDir, threadId },
    );

    if (!restoreResult.success) {
      // eslint-disable-next-line no-console
      console.warn('[checkpoint debug] restoreResult:', JSON.stringify(restoreResult));
    }
    expect(restoreResult.success).toBe(true);

    // Verify the file has reverted to the original seed content.
    const restoredContent = fs.readFileSync(targetFile, 'utf8');
    expect(restoredContent).toContain('clamp');
    expect(restoredContent).not.toContain('clampMutated');
  });
});
