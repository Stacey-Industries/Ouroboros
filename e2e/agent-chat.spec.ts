/**
 * Agent chat UI readiness tests.
 * Does NOT test actual AI interaction — only verifies the UI elements load.
 */

import { test, expect } from './electron.fixture';

test.describe('Agent Chat UI', () => {
  test('chat input area exists', async ({ page }) => {
    // Look for the chat composer textarea or input
    const composer = page.locator('textarea, [contenteditable="true"]').first();
    // May need the agent sidebar to be expanded first
    const agentSidebar = page.locator('[data-layout="agent-sidebar"]');
    const isExpanded = await agentSidebar.isVisible().catch(() => false);

    if (isExpanded) {
      await expect(composer).toBeVisible({ timeout: 10_000 });
    } else {
      // If collapsed, we just verify the collapsed strip exists
      const strip = page.locator('[data-layout="collapsed-agent-strip"]');
      await expect(strip).toBeVisible({ timeout: 5_000 });
    }
  });
});
