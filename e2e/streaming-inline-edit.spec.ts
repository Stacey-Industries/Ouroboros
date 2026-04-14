/**
 * streaming-inline-edit.spec.ts — Tests the streaming inline edit feature.
 *
 * PARTIAL DEFERRAL: The full Ctrl+K → token decoration → Escape-to-revert
 * flow is deferred. Reason: the test Electron app starts with a fresh
 * userDataDir and no default project. Without a project set via ProjectContext
 * (which requires an OS file-picker dialog or deep renderer state seeding),
 * `agent-ide:open-file` doesn't cause Monaco to mount. Making Monaco
 * appear in a fresh instance would require either:
 *   (a) a dedicated test-mode IPC to seed the project root into ProjectContext, or
 *   (b) waiting for the ProjectContext to pick up the IPC setProjectRoots value,
 *       which is an async React effect that the current fixture doesn't await.
 *
 * What IS tested here:
 *  1. Config round-trip: setting and reading `streamingInlineEdit` flag via IPC.
 *  2. The `ai:inlineEditStream` preload bridge exists on window.electronAPI.
 *  3. Config.get('streamingInlineEdit') returns false by default (new fresh userDataDir).
 */

import { expect, test } from './fixtures/project.fixture';

test.describe('Streaming inline edit (feature-flagged)', () => {
  test('streamingInlineEdit config flag defaults to false in a fresh session', async ({
    electronApp,
  }) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // In a fresh userDataDir, the config key is absent (falsy).
    const rawValue = await page.evaluate(async () => {
      return window.electronAPI.config.get('streamingInlineEdit');
    });

    // Either undefined/null (unset) or false — both are acceptable defaults.
    expect(rawValue === false || rawValue === undefined || rawValue === null).toBe(true);
  });

  test('setting streamingInlineEdit config flag to true succeeds', async ({
    electronApp,
  }) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Enable the feature flag via config IPC.
    await page.evaluate(async () => {
      return window.electronAPI.config.set('streamingInlineEdit', true);
    });

    // Verify the flag is readable back.
    const value = await page.evaluate(async () => {
      return window.electronAPI.config.get('streamingInlineEdit');
    });
    expect(value).toBe(true);
  });

  test('ai stream API is available on window.electronAPI', async ({
    electronApp,
  }) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    const hasAiStream = await page.evaluate(() => {
      // The aiStream bridge is exposed by the preload for streaming inline edits.
      return typeof window.electronAPI?.aiStream !== 'undefined';
    });

    expect(hasAiStream).toBe(true);
  });
});
