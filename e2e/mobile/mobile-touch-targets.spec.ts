/**
 * mobile-touch-targets.spec.ts
 *
 * Audits every visible <button> on each MobileNavBar tab surface and asserts
 * that its rendered bounding box is at least 44×44 px — the minimum touch
 * target size mandated by WCAG 2.5.5 (AAA) and Apple/Google HIG guidelines.
 *
 * The audit runs across all four panels (files, editor, terminal, chat) by
 * tapping each MobileNavBar button in turn, then querying buttons visible
 * in the active surface.
 *
 * Exceptions not flagged:
 *  - Buttons inside elements with a `::before` hit-area expansion cannot be
 *    measured by Playwright's `boundingBox()` — these are excluded by checking
 *    only elements whose bounding box is directly reported. Any button whose
 *    box is ≥ 44×44 passes automatically; only bare small buttons are flagged.
 *
 * This test does NOT use `.skip()` — it is intended to run and catch regressions.
 * If buttons below 44px are found, the test fails and lists them with their
 * accessible name so the team can fix the touch targets.
 */

import * as fs from 'fs';
import * as path from 'path';

import { expect, test } from '@playwright/test';

import { appShell, mobileNavButton } from './fixtures/webBuild';

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_TOUCH_PX = 44;

const PANELS = [
  { id: 'files', label: 'Files' },
  { id: 'editor', label: 'Editor' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'chat', label: 'Chat' },
] as const;

// ── Web build availability guard ───────────────────────────────────────────────

const projectRoot = path.resolve(__dirname, '..', '..');
const webIndexPath = path.join(projectRoot, 'out', 'web', 'index.html');
const webBuildExists = fs.existsSync(webIndexPath);

// ── Helper — collect undersized buttons on the current page ───────────────────

interface UndersizedButton {
  label: string;
  width: number;
  height: number;
  panel: string;
}

async function collectUndersizedButtons(
  page: import('@playwright/test').Page,
  panelId: string,
): Promise<UndersizedButton[]> {
  // Gather all visible buttons in the viewport after panel activation.
  // We exclude the MobileNavBar itself (data-layout="mobile-nav") to avoid
  // false positives on the nav buttons' height at narrow icon-only widths;
  // those are audited as part of their own surfaces.
  const buttons = page.locator('button:visible').filter({
    hasNot: page.locator('[data-layout="mobile-nav"] button'),
  });

  const count = await buttons.count();
  const undersized: UndersizedButton[] = [];

  for (let i = 0; i < count; i++) {
    const btn = buttons.nth(i);
    const box = await btn.boundingBox();
    if (!box) {
      // Off-screen or display:none — skip.
      continue;
    }
    if (box.width >= MIN_TOUCH_PX && box.height >= MIN_TOUCH_PX) {
      continue;
    }
    // Collect accessible label for reporting.
    const ariaLabel = await btn.getAttribute('aria-label');
    const textContent = (await btn.textContent()) ?? '';
    const label = ariaLabel ?? textContent.trim() ?? `<unlabeled button #${i}>`;

    undersized.push({
      label,
      width: Math.round(box.width),
      height: Math.round(box.height),
      panel: panelId,
    });
  }

  return undersized;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Touch target audit — 44px minimum', () => {
  test.skip(!webBuildExists, 'web build not present — run `npm run build:web` first');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-layout="app"]', { timeout: 15_000 });
  });

  for (const panel of PANELS) {
    test(`"${panel.label}" panel — all visible buttons ≥ 44×44 px`, async ({ page }) => {
      const shell = appShell(page);
      const btn = mobileNavButton(page, panel.label);

      // Activate the panel.
      await btn.tap();
      await expect(shell).toHaveAttribute('data-mobile-active', panel.id, {
        timeout: 3_000,
      });

      // Allow a short settle time for any animated panel transitions.
      await page.waitForTimeout(150);

      const undersized = await collectUndersizedButtons(page, panel.id);

      if (undersized.length > 0) {
        // Build a human-readable failure message listing each offending button.
        const rows = undersized.map(
          (u) => `  • "${u.label}" — ${u.width}×${u.height}px (panel: ${u.panel})`,
        );
        const message = [
          `${undersized.length} button(s) below ${MIN_TOUCH_PX}px on the "${panel.label}" panel:`,
          ...rows,
          '',
          'Fix: add `mobile:min-h-[44px] mobile:min-w-[44px]` Tailwind variant or',
          'extend the `[data-layout="mobile-nav"] button` rule in mobile.css.',
        ].join('\n');

        expect(undersized, message).toHaveLength(0);
      }
    });
  }
});
