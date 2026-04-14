/**
 * agent-launch.spec.ts — Tests the background job queue:
 *  - Enqueue a job via the `backgroundJobs:enqueue` IPC.
 *  - Verify the job appears in a list call.
 *  - Wait for status to reach 'done' or 'error' (mock claude exits immediately).
 *
 * The mock claude binary installed by globalSetup emits a valid stream-json
 * sequence and exits, so jobs should complete within a few seconds.
 *
 * UI assertion: the BackgroundJobsPanel responds to the
 * `agent-ide:open-background-jobs` DOM event. We dispatch that event and
 * assert the panel contains a job row matching the enqueued job's label.
 */

import { expect, test } from './fixtures/project.fixture';

const JOB_TIMEOUT_MS = 15_000;

test.describe('Background job queue', () => {
  test('enqueues a job and it reaches a terminal status', async ({
    electronApp,
    projectDir,
  }) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Register workspace root.
    await page.evaluate(
      async (root: string) => {
        await window.electronAPI.window.setProjectRoots([root]);
      },
      projectDir,
    );
    await page.waitForTimeout(200);

    // Enqueue a job.
    const enqueueResult = await page.evaluate(
      async (req: { projectRoot: string; prompt: string; label: string }) => {
        return window.electronAPI.backgroundJobs.enqueue(req);
      },
      {
        projectRoot: projectDir,
        prompt: 'Echo hello from mock',
        label: 'E2E test job',
      },
    );

    expect(enqueueResult.success).toBe(true);
    expect(enqueueResult.jobId).toBeTruthy();

    const jobId = enqueueResult.jobId!;

    // Poll until the job reaches a terminal status.
    const terminalStatuses = new Set(['done', 'error', 'cancelled']);
    let finalStatus: string | undefined;

    const deadline = Date.now() + JOB_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const listResult = await page.evaluate(
        async (root: string) => window.electronAPI.backgroundJobs.list(root),
        projectDir,
      );

      if (listResult.success && listResult.snapshot) {
        const job = listResult.snapshot.jobs.find((j) => j.id === jobId);
        if (job && terminalStatuses.has(job.status)) {
          finalStatus = job.status;
          break;
        }
      }
      await page.waitForTimeout(500);
    }

    expect(finalStatus).toBeTruthy();
    expect(terminalStatuses.has(finalStatus!)).toBe(true);
  });

  test('BackgroundJobsPanel renders job row after toggle event', async ({
    electronApp,
    projectDir,
  }) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(
      async (root: string) => {
        await window.electronAPI.window.setProjectRoots([root]);
      },
      projectDir,
    );
    await page.waitForTimeout(200);

    // Enqueue a job so there's something to show in the panel.
    const enqueueResult = await page.evaluate(
      async (req: { projectRoot: string; prompt: string; label: string }) => {
        return window.electronAPI.backgroundJobs.enqueue(req);
      },
      {
        projectRoot: projectDir,
        prompt: 'Panel visibility test',
        label: 'Panel E2E job',
      },
    );
    expect(enqueueResult.success).toBe(true);

    // Open the BackgroundJobsPanel via DOM event.
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('agent-ide:open-background-jobs'));
    });

    // The panel should become visible with a job row.
    // BackgroundJobRow renders a data-testid or text.  We look for the label.
    await expect(
      page.locator('text=Panel E2E job'),
    ).toBeVisible({ timeout: 8_000 });
  });
});
