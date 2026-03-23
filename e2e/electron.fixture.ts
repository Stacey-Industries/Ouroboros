/**
 * Shared Electron fixture for Playwright e2e tests.
 *
 * Launches the built Electron app and provides the main window page.
 * Tests should run `npm run build` before executing.
 */

import { test as base, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  page: Page;
};

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const app = await electron.launch({
      args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });
    await use(app);
    await app.close();
  },

  page: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    // Wait for the renderer to finish bootstrapping
    await window.waitForLoadState('domcontentloaded');
    await use(window);
  },
});

export { expect } from '@playwright/test';
