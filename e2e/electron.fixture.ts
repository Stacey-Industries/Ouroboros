/**
 * Shared Electron fixture for Playwright e2e tests.
 *
 * Launches the built Electron app and provides the main window page.
 * Tests should run `npm run build` before executing.
 *
 * Each test run uses a fresh --user-data-dir in %TEMP% so the test instance
 * bypasses the app's requestSingleInstanceLock() and runs independently of
 * any already-running IDE instance.
 */

import { test as base, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  page: Page;
};

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    // Unique user-data-dir per worker so multiple test workers don't collide,
    // and so the test instance bypasses the single-instance lock held by the
    // running IDE window.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ouroboros-e2e-userdata-'));

    const app = await electron.launch({
      args: [
        path.join(__dirname, '..', 'out', 'main', 'index.js'),
        `--user-data-dir=${userDataDir}`,
      ],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        // Suppress hook installer and LSP in test mode to speed up launch.
        OUROBOROS_SKIP_HOOK_INSTALL: '1',
        OUROBOROS_NO_UPDATE: '1',
      },
    });

    await use(app);
    await app.close();

    // Best-effort cleanup of the temp user data dir.
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  },

  page: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    // Wait for the renderer to finish bootstrapping
    await window.waitForLoadState('domcontentloaded');
    await use(window);
    // Pipeline Hardening M-4: explicit page close before electronApp teardown.
    // Required on Windows to prevent app.close() from hanging — see e2e/CLAUDE.md
    // "The template ends with `await page.close()` before fixture teardown."
    // Without this, the electronApp teardown exceeds the 30s test timeout and
    // every spec that uses the `page` fixture fails on teardown alone.
    try {
      await window.close();
    } catch {
      // Best-effort — page may already be closed by the test or by app.close()
    }
  },
});

export { expect } from '@playwright/test';
