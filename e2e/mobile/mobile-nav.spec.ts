/**
 * mobile-nav.spec.ts
 *
 * Walks through all four MobileNavBar panels and asserts that tapping each
 * button updates `data-mobile-active` on the app root element.
 *
 * Prerequisites:
 *  - The web build must exist at `out/web/` (`npm run build:web`).
 *  - `vite preview` must be running on port 4173 (handled by playwright.config.ts
 *    `webServer` option — no manual step needed for CI or `npx playwright test`).
 *
 * NOTE: These tests are marked `.skip()` when the web build is unavailable
 * (i.e. `out/web/index.html` does not exist). The web build is not produced
 * as part of the standard `npm run build` (Electron only) — it requires
 * `npm run build:web`. In CI, `build:web` should run before `test:mobile`.
 *
 * The skip guard is intentional per Wave 32 Phase J requirements: the parent
 * is responsible for ensuring the build exists before executing mobile tests.
 */

import * as fs from 'fs';
import * as path from 'path';

import { expect, test } from '@playwright/test';

import { appShell, mobileNavButton } from './fixtures/webBuild';

// ── Panel IDs that map to MOBILE_NAV_ITEMS in AppLayout.mobile.tsx ────────────
const PANELS = [
  { id: 'files', label: 'Files' },
  { id: 'editor', label: 'Editor' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'chat', label: 'Chat' },
] as const;

// ── Web build availability guard ───────────────────────────────────────────────
// Resolve relative to the project root (this file lives two levels below it).
const projectRoot = path.resolve(__dirname, '..', '..');
const webIndexPath = path.join(projectRoot, 'out', 'web', 'index.html');
const webBuildExists = fs.existsSync(webIndexPath);

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('MobileNavBar — panel switching', () => {
  // Skip the entire describe block if the web build has not been produced.
  // Rationale: vite preview will fail to serve without the build, making every
  // assertion meaningless. The parent CI job is responsible for running
  // `npm run build:web` before `npm run test:mobile`.
  test.skip(!webBuildExists, 'web build not present — run `npm run build:web` first');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the React root to finish bootstrapping and stamp data-layout="app".
    await page.waitForSelector('[data-layout="app"]', { timeout: 15_000 });
  });

  for (const panel of PANELS) {
    test(`tapping "${panel.label}" sets data-mobile-active="${panel.id}"`, async ({ page }) => {
      const shell = appShell(page);
      const btn = mobileNavButton(page, panel.label);

      // Tap the nav button (mobile devices use tap, not click).
      await btn.tap();

      // The data-mobile-active attribute is set synchronously in
      // AppLayout.tsx's handleMobilePanelSwitch — no network round-trip.
      await expect(shell).toHaveAttribute('data-mobile-active', panel.id, {
        timeout: 3_000,
      });
    });
  }
});
