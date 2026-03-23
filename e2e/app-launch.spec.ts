/**
 * Smoke tests — verify the app launches without crashing.
 */

import { test, expect } from './electron.fixture';

test.describe('App Launch', () => {
  test('main window is visible', async ({ page }) => {
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('window has expected dimensions', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    const { width, height } = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(width).toBeGreaterThan(400);
    expect(height).toBeGreaterThan(300);
  });

  test('no uncaught exceptions within 3 seconds', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.waitForTimeout(3000);
    expect(errors).toEqual([]);
  });

  test('electronAPI is exposed on window', async ({ page }) => {
    const hasApi = await page.evaluate(() => typeof window.electronAPI !== 'undefined');
    expect(hasApi).toBe(true);
  });
});
