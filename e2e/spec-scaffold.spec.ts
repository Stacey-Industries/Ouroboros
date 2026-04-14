/**
 * spec-scaffold.spec.ts — Verifies that the `spec:scaffold` IPC handler
 * creates `.ouroboros/specs/<slug>/{requirements,design,tasks}.md` on disk.
 *
 * Uses page.evaluate to call the IPC bridge via the preload API, including
 * the real pathSecurity check. We register the temp project dir as the
 * window's project root first via `window.electronAPI.window.setProjectRoots`.
 *
 * Setup: copies template files from src/main/templates/spec/ to out/main/templates/spec/
 * before the tests run, because electron-vite does not automatically copy
 * static assets to the build output directory.
 */

import * as fs from 'fs';
import * as path from 'path';

import { expect, test } from './fixtures/project.fixture';

// ── Template setup ────────────────────────────────────────────────────────────

const TEMPLATES_SRC = path.join(__dirname, '..', 'src', 'main', 'templates', 'spec');
const TEMPLATES_OUT = path.join(__dirname, '..', 'out', 'main', 'templates', 'spec');

function ensureTemplatesInBuildOutput(): void {
  if (fs.existsSync(path.join(TEMPLATES_OUT, 'requirements.md'))) return;
  fs.mkdirSync(TEMPLATES_OUT, { recursive: true });
  for (const file of ['requirements.md', 'design.md', 'tasks.md']) {
    fs.copyFileSync(path.join(TEMPLATES_SRC, file), path.join(TEMPLATES_OUT, file));
  }
}

test.beforeAll(() => {
  ensureTemplatesInBuildOutput();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('spec:scaffold IPC handler', () => {
  test('creates requirements, design and tasks files under .ouroboros/specs', async ({
    electronApp,
    projectDir,
  }) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // Register the temp project dir as a trusted workspace root.
    await page.evaluate(
      async (root: string) => {
        await window.electronAPI.window.setProjectRoots([root]);
      },
      projectDir,
    );

    // Give main process time to register the root.
    await page.waitForTimeout(300);

    // Invoke spec:scaffold via the real IPC bridge.
    const result = await page.evaluate(
      async (req: { projectRoot: string; featureName: string }) => {
        return window.electronAPI.spec.scaffold(req);
      },
      { projectRoot: projectDir, featureName: 'test-feature' },
    );

    if (!result.success) {
      // eslint-disable-next-line no-console
      console.warn('[spec-scaffold debug] result:', JSON.stringify(result));
    }
    expect(result.success).toBe(true);

    const specDir = path.join(projectDir, '.ouroboros', 'specs', 'test-feature');

    expect(fs.existsSync(path.join(specDir, 'requirements.md'))).toBe(true);
    expect(fs.existsSync(path.join(specDir, 'design.md'))).toBe(true);
    expect(fs.existsSync(path.join(specDir, 'tasks.md'))).toBe(true);
  });

  test('returns success:false with collision flag when spec already exists', async ({
    electronApp,
    projectDir,
  }) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(
      async (root: string) => {
        await window.electronAPI.window.setProjectRoots([root]);
      },
      projectDir,
    );
    await page.waitForTimeout(300);

    const req = { projectRoot: projectDir, featureName: 'duplicate-feature' };

    const first = await page.evaluate(
      async (r: { projectRoot: string; featureName: string }) => {
        return window.electronAPI.spec.scaffold(r);
      },
      req,
    );
    expect(first.success).toBe(true);

    const second = await page.evaluate(
      async (r: { projectRoot: string; featureName: string }) => {
        return window.electronAPI.spec.scaffold(r);
      },
      req,
    );
    expect(second.success).toBe(false);
    expect(second.collision).toBe(true);
  });
});
