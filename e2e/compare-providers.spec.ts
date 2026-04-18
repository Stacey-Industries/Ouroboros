/**
 * compare-providers.spec.ts — Smoke test for compare-providers mode.
 *
 * Wave 36 Phase G.
 *
 * Navigation approach: The compare-providers UI (CompareProviders.tsx) relies
 * on a running Claude binary and real PTY sessions, making full UI interaction
 * in CI fragile. Instead this spec exercises the IPC pipeline directly:
 *
 *   1. Call window.electronAPI.compareProviders.start(...)
 *      — same call the UI makes when the user clicks "Compare".
 *   2. Assert the call succeeds and returns a compareId.
 *   3. Register an onEvent listener and wait for at least one event from each
 *      session (or a timeout), confirming the fan-out broadcast fires.
 *   4. Call compareProviders.cancel(compareId) and assert both sessions end.
 *
 * Provider selection: both slots use 'claude' to avoid requiring Codex or
 * Gemini binaries in CI. Two Claude sessions for the same prompt is a valid
 * use of compare mode (the UI allows it).
 *
 * PREREQUISITE: The `claude` CLI must be installed and authenticated for the
 * start/event tests to receive real output events. If the binary is absent,
 * the start() call returns { success: false } and the test is skipped via
 * the runtime guard below. The cancel-mid-stream test uses skip() if start
 * fails for the same reason.
 *
 * Unit coverage: compareProvidersHandlers.test.ts covers the IPC handler
 * logic (start, cancel, event fan-out) without a real binary.
 */

import { expect, test } from './electron.fixture';

// ---------------------------------------------------------------------------
// Helper — collect compareProviders:event payloads for N ms then return them.
// ---------------------------------------------------------------------------
async function collectEvents(
  page: import('@playwright/test').Page,
  compareId: string,
  durationMs: number,
): Promise<unknown[]> {
  // Register a listener inside the renderer, collect into a shared array, then
  // read it back after the wait.
  await page.evaluate((id: string) => {
    (window as Window & { __compareEvents?: unknown[] }).__compareEvents = [];
    window.electronAPI.compareProviders.onEvent((payload) => {
      if (payload.compareId === id) {
        ((window as Window & { __compareEvents?: unknown[] }).__compareEvents ??= []).push(payload);
      }
    });
  }, compareId);

  await page.waitForTimeout(durationMs);

  return page.evaluate(() =>
    (window as Window & { __compareEvents?: unknown[] }).__compareEvents ?? [],
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('compare-providers — IPC smoke', () => {
  /**
   * Verify compareProviders.start returns a well-formed result.
   * Skipped at runtime if the claude binary is not installed.
   */
  test('start returns compareId and two session descriptors', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        return await window.electronAPI.compareProviders.start({
          prompt: 'Say "hello" and nothing else.',
          projectPath: process.cwd?.() ?? '.',
          providerIds: ['claude', 'claude'],
        });
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    // If the binary is missing, the handler returns { success: false }.
    // Guard and skip rather than fail — binary availability is not a test
    // concern on machines without the claude CLI.
    if (!(result as { success: boolean }).success) {
      // eslint-disable-next-line no-console
      console.warn(
        '[compare-providers.spec] claude binary not available — skipping start assertion. ' +
        'Install the claude CLI and authenticate to run this test.',
      );
      test.skip();
      return;
    }

    const typed = result as { success: boolean; compareId?: string; sessions?: unknown[] };
    expect(typed.compareId).toBeTruthy();
    expect(typed.compareId).toMatch(/^cmp-/);
    expect(Array.isArray(typed.sessions)).toBe(true);
    expect(typed.sessions).toHaveLength(2);

    // Clean up — cancel immediately so we don't leave sessions running.
    if (typed.compareId) {
      await page.evaluate(async (id: string) => {
        await window.electronAPI.compareProviders.cancel(id);
      }, typed.compareId);
    }
  });

  /**
   * Verify that compareProviders:event emissions are received by the renderer
   * for at least one of the two sessions within the timeout window.
   *
   * NOTE: This test requires the claude binary. It is skipped at runtime if
   * start() fails.
   */
  test('onEvent receives compareProviders:event from at least one session', async ({ page }) => {
    const startResult = await page.evaluate(async () => {
      try {
        return await window.electronAPI.compareProviders.start({
          prompt: 'Reply with a single word: pong',
          projectPath: process.cwd?.() ?? '.',
          providerIds: ['claude', 'claude'],
        });
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    if (!(startResult as { success: boolean }).success) {
      console.warn(
        '[compare-providers.spec] claude binary not available — skipping event assertion.',
      );
      test.skip();
      return;
    }

    const compareId = (startResult as { compareId: string }).compareId;

    // Wait up to 30 s for event emissions — Claude startup + first token.
    const events = await collectEvents(page, compareId, 30_000);

    // Cancel regardless of how many events arrived.
    await page.evaluate(async (id: string) => {
      await window.electronAPI.compareProviders.cancel(id);
    }, compareId);

    // We expect at least one event from at least one session.
    expect(events.length).toBeGreaterThan(0);

    // Each event payload must carry compareId and providerId.
    for (const ev of events) {
      const typed = ev as { compareId: string; providerId: string; event: { type: string } };
      expect(typed.compareId).toBe(compareId);
      expect(typed.providerId).toBeTruthy();
      expect(typed.event).toBeDefined();
      expect(typeof typed.event.type).toBe('string');
    }
  });

  /**
   * Verify that cancel mid-stream terminates both sessions cleanly.
   *
   * Strategy: start two sessions, immediately cancel, assert cancel returns
   * { success: true }. We do not wait for events — the purpose is to confirm
   * the cancel IPC path works without throwing.
   *
   * NOTE: Skipped at runtime if the claude binary is not available.
   */
  test('cancel mid-stream returns success and clears active sessions', async ({ page }) => {
    const startResult = await page.evaluate(async () => {
      try {
        return await window.electronAPI.compareProviders.start({
          prompt: 'Count to 1000 slowly.',
          projectPath: process.cwd?.() ?? '.',
          providerIds: ['claude', 'claude'],
        });
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    if (!(startResult as { success: boolean }).success) {
      console.warn(
        '[compare-providers.spec] claude binary not available — skipping cancel assertion.',
      );
      test.skip();
      return;
    }

    const compareId = (startResult as { compareId: string }).compareId;

    // Cancel immediately — sessions may be in 'starting' state.
    const cancelResult = await page.evaluate(async (id: string) => {
      try {
        return await window.electronAPI.compareProviders.cancel(id);
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }, compareId);

    expect((cancelResult as { success: boolean }).success).toBe(true);

    // Attempt a second cancel — should fail gracefully (no active session).
    const secondCancel = await page.evaluate(async (id: string) => {
      try {
        return await window.electronAPI.compareProviders.cancel(id);
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }, compareId);

    // The second cancel must not throw — it should return { success: false }
    // with an error message about no active session, not an exception.
    expect((secondCancel as { success: boolean }).success).toBe(false);
    expect((secondCancel as { error: string }).error).toMatch(/no active compare session/i);
  });

  /**
   * Verify cancel with a missing compareId returns a structured error.
   * This test does NOT require the claude binary.
   */
  test('cancel with unknown compareId returns structured error', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        return await window.electronAPI.compareProviders.cancel('cmp-nonexistent-id');
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    expect((result as { success: boolean }).success).toBe(false);
    expect((result as { error: string }).error).toBeTruthy();
  });
});
