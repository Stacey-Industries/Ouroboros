/**
 * webBuild.ts — Shared fixture helpers for mobile web e2e tests.
 *
 * Exposes named locators that both mobile specs use to find stable
 * elements on the web build. All selectors are intentionally broad
 * so they survive minor DOM restructuring inside components.
 *
 * The web build is served by `vite preview` on port 4173 — configured
 * in playwright.config.ts via the `webServer` option. Tests import
 * `test` and `expect` from @playwright/test directly; this file only
 * provides locator helpers, not a custom fixture, to keep the setup
 * surface minimal.
 */

import { type Page } from '@playwright/test';

/** The root element that carries `data-layout="app"` and `data-mobile-active` attrs. */
export function appShell(page: Page) {
  return page.locator('[data-layout="app"]');
}

/**
 * Locates a MobileNavBar button by its visible label text.
 * Labels come from MOBILE_NAV_ITEMS in AppLayout.mobile.tsx:
 *   'Files' | 'Editor' | 'Terminal' | 'Chat'
 */
export function mobileNavButton(page: Page, label: string) {
  return page.locator('[data-layout="mobile-nav"] button').filter({ hasText: label });
}

/** All visible buttons currently in the viewport. */
export function allVisibleButtons(page: Page) {
  return page.locator('button:visible');
}
