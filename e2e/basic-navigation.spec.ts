/**
 * Basic navigation tests — verify core UI elements render and respond.
 */

import { test, expect } from './electron.fixture';

test.describe('Basic Navigation', () => {
  test('file tree panel is visible', async ({ page }) => {
    // The file tree is rendered in the left sidebar
    const sidebar = page.locator('[data-layout="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10_000 });
  });

  test('agent chat panel is accessible', async ({ page }) => {
    // The agent sidebar should be present in the layout
    const agentSidebar = page.locator('[data-layout="agent-sidebar"]');
    const collapsedStrip = page.locator('[data-layout="collapsed-agent-strip"]');

    // Either the full sidebar or collapsed strip should be visible
    const isExpanded = await agentSidebar.isVisible().catch(() => false);
    const isCollapsed = await collapsedStrip.isVisible().catch(() => false);
    expect(isExpanded || isCollapsed).toBe(true);
  });

  test('title bar renders', async ({ page }) => {
    const titleBar = page.locator('[data-layout="title-bar"]');
    await expect(titleBar).toBeVisible({ timeout: 5_000 });
  });

  test('status bar renders', async ({ page }) => {
    const statusBar = page.locator('[data-layout="status-bar"]');
    await expect(statusBar).toBeVisible({ timeout: 5_000 });
  });
});
