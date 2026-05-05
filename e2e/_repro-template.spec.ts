/**
 * _repro-template.spec.ts — Copy-target template for agent-authored bug repros.
 *
 * USAGE:
 *   cp e2e/_repro-template.spec.ts e2e/_repro-<slug>.spec.ts
 *   # Edit the "AGENT EDIT" section below, then:
 *   npm run repro -- <slug>          # Phase-2 driver (builds if needed, runs spec)
 *   # OR run directly:
 *   npx playwright test --project=repro-electron e2e/_repro-<slug>.spec.ts
 *
 * GESTURE EXAMPLES (see these specs for copy-paste patterns):
 *   e2e/basic-navigation.spec.ts  — sidebar/title-bar/status-bar locators, isVisible guards
 *   e2e/agent-chat.spec.ts        — composer fill + send, agent-sidebar collapse detection
 *   e2e/diff-gutter.spec.ts       — page.evaluate IPC calls, CustomEvent dispatch, seedFile fixture
 *
 * OUTPUT (all written to the repro output dir):
 *   screenshot-<N>-<label>.png  — per-step screenshots taken in the test
 *   console.jsonl               — all renderer console + pageerror lines (JSONL, one per line)
 *   summary.json                — ReproSummary shape (name, passed, timings, paths)
 *   trace.zip                   — Playwright trace (drag into https://trace.playwright.dev/)
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  type ConsoleEntry,
  REPRO_OUTPUT_DIR_ENV,
  appendConsoleEntry,
  writeReproSummary,
} from './reproArtifacts';
import { expect, test } from './electron.fixture';

// Module-scoped accumulators — reset at top of each test so multiple tests stay isolated.
// afterEach reads these to build summary.json.
const screenshots: string[] = [];
// Track start time here because testInfo.startTime is not available in Playwright 1.x.
let testStartedAt = '';
// Track the resolved output dir so afterEach uses the same path as the test body.
let reproOutputDir = '';

test.afterEach(async ({}, testInfo) => {
  if (!reproOutputDir) return; // test body never set it (e.g. beforeEach failed)

  const dir = reproOutputDir;
  const finishedAt = new Date().toISOString();
  const startMs = testStartedAt ? new Date(testStartedAt).getTime() : Date.now();
  const durationMs = Date.now() - startMs;

  // trace.zip lands in Playwright's own output dir (testInfo.outputDir), NOT the
  // env-var dir. The Phase-2 driver reconciles paths; here we probe both locations.
  const traceCandidates = [path.join(testInfo.outputDir, 'trace.zip'), path.join(dir, 'trace.zip')];
  const tracePath = traceCandidates.find((p) => fs.existsSync(p)) ?? null;

  writeReproSummary(dir, {
    name: path.basename(testInfo.file, '.spec.ts').replace(/^_repro-/, ''),
    startedAt: testStartedAt || finishedAt,
    finishedAt,
    durationMs,
    passed: testInfo.status === 'passed',
    screenshots: [...screenshots],
    consoleTranscriptPath: path.join(dir, 'console.jsonl'),
    tracePath,
    testFile: path.relative(process.cwd(), testInfo.file),
  });
});

test('repro smoke', async ({ electronApp }, testInfo) => {
  // Reset module-scoped accumulators for this test run.
  screenshots.length = 0;
  testStartedAt = new Date().toISOString();

  // Resolve the repro output directory.
  // The Phase-2 driver sets REPRO_OUTPUT_DIR_ENV; direct npx invocations fall
  // back to Playwright's own test output dir so the spec still works standalone.
  const dir = process.env[REPRO_OUTPUT_DIR_ENV] ?? testInfo.outputDir;
  reproOutputDir = dir;
  fs.mkdirSync(dir, { recursive: true });

  // ── Console listener — MUST stay here, before firstWindow() ─────────────
  // Bootstrap-era logs (the most diagnostic-relevant slice for UI bugs) fire
  // BEFORE electronApp.firstWindow() resolves. Registering listeners via
  // electronApp.on('window', ...) ensures every window the app opens is hooked
  // immediately, capturing pre-firstWindow logs in console.jsonl.
  // DO NOT move these registrations below the firstWindow() await.
  electronApp.on('window', (win) => {
    win.on('console', (msg) => {
      const entry: ConsoleEntry = {
        ts: new Date().toISOString(),
        type: msg.type() as ConsoleEntry['type'],
        text: msg.text(),
        location: msg.location(),
      };
      appendConsoleEntry(dir, entry);
    });
    win.on('pageerror', (err) => {
      appendConsoleEntry(dir, {
        ts: new Date().toISOString(),
        type: 'pageerror',
        text: err.message,
      });
    });
  });
  // ── End console listener ─────────────────────────────────────────────────

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // ── AGENT EDIT: insert your bug-repro steps here ─────────────────────────
  // Gesture examples:
  //   basic-navigation.spec.ts  → tree clicks, title-bar/sidebar locators
  //     e.g. page.locator('[data-layout="sidebar"]').isVisible()
  //   agent-chat.spec.ts        → composer fill + send, collapsed-strip detection
  //     e.g. page.locator('textarea, [contenteditable="true"]').first().fill('...')
  //   diff-gutter.spec.ts       → page.evaluate IPC, CustomEvent dispatch
  //     e.g. page.evaluate(() => window.dispatchEvent(new CustomEvent('agent-ide:...')))
  //
  // Take a screenshot per meaningful step (viewport only — omit fullPage for speed):
  //   const shot = path.join(dir, 'screenshot-02-after-click.png');
  //   await page.screenshot({ path: shot });
  //   screenshots.push(shot);
  const shot01 = path.join(dir, 'screenshot-01-loaded.png');
  await page.screenshot({ path: shot01 });
  screenshots.push(shot01);

  // Minimal smoke assertion — verify the app rendered something useful.
  // Replace or extend with assertions specific to the bug being reproduced.
  const titleBar = page.locator('[data-layout="title-bar"]');
  await expect(titleBar).toBeVisible({ timeout: 10_000 });
  // ── END AGENT EDIT ────────────────────────────────────────────────────────

  // IMPORTANT: Close the page before fixture teardown. On Windows, Playwright's
  // app.close() hangs indefinitely if a screenshot was taken and the page is still
  // open. This is a platform-specific Playwright-Electron teardown issue.
  // Keep this call at the END of the test body, after all assertions and screenshots.
  await page.close();
});
