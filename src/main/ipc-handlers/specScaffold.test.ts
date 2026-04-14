/**
 * specScaffold.test.ts — Unit tests for registerSpecHandlers / slugify.
 *
 * Tests: happy path, collision, invalid slug, outside-root path rejection.
 * Uses a tmpdir() project root so no real workspace configuration is needed.
 *
 * Run with: npx vitest run src/main/ipc-handlers/specScaffold.test.ts
 */

import * as electron from 'electron';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock electron ─────────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => '/mock/userData', getAppPath: () => '/mock/app' },
}));

// ── Mock logger ───────────────────────────────────────────────────────────────
vi.mock('../logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ── Mock windowManager ────────────────────────────────────────────────────────
const { mockGetWindowProjectRoots } = vi.hoisted(() => ({
  mockGetWindowProjectRoots: vi.fn().mockReturnValue([]),
}));
vi.mock('../windowManager', () => ({
  getWindowProjectRoots: mockGetWindowProjectRoots,
}));

// ── Mock config ───────────────────────────────────────────────────────────────
const { mockGetConfigValue } = vi.hoisted(() => ({ mockGetConfigValue: vi.fn() }));
vi.mock('../config', () => ({ getConfigValue: mockGetConfigValue }));

// ── Import after mocks ────────────────────────────────────────────────────────
// ─── Helpers ──────────────────────────────────────────────────────────────────
import type { IpcMainInvokeEvent } from 'electron';

import { registerSpecHandlers, slugify } from './specScaffold';

type HandlerFn = (event: IpcMainInvokeEvent, request: unknown) => Promise<unknown>;

function captureHandler(): HandlerFn {
  let captured: HandlerFn | null = null;
  vi.mocked(electron.ipcMain.handle).mockImplementation(
    (_channel: string, fn: HandlerFn) => { captured = fn; },
  );
  registerSpecHandlers();
  if (!captured) throw new Error('handler not registered');
  return captured;
}

function makeEvent(): IpcMainInvokeEvent {
  return {
    sender: {
      getOwnerBrowserWindow: () => ({ id: 1 }),
    },
  } as unknown as IpcMainInvokeEvent;
}

// ─── slugify ──────────────────────────────────────────────────────────────────

describe('slugify()', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('User Auth')).toBe('user-auth');
  });

  it('strips non-alphanumeric characters', () => {
    expect(slugify('my feature! v2')).toBe('my-feature-v2');
  });

  it('trims leading/trailing whitespace', () => {
    expect(slugify('  hello  ')).toBe('hello');
  });

  it('returns empty string for all-special-char input', () => {
    expect(slugify('!!!###')).toBe('');
  });

  it('preserves existing hyphens', () => {
    expect(slugify('user-auth')).toBe('user-auth');
  });
});

// ─── scaffoldSpec (via handler) ───────────────────────────────────────────────

describe('spec:scaffold handler', () => {
  let projectRoot: string;
  let handler: HandlerFn;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-test-'));  
    mockGetWindowProjectRoots.mockReturnValue([projectRoot]);
    mockGetConfigValue.mockImplementation((key: string) => {
      if (key === 'defaultProjectRoot') return projectRoot;
      return undefined;
    });
    handler = captureHandler();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(projectRoot, { recursive: true, force: true });  
  });

  describe('happy path', () => {
    it('creates three spec files under .ouroboros/specs/<slug>/', async () => {
      const result = await handler(makeEvent(), {
        projectRoot,
        featureName: 'user auth',
      }) as { success: boolean; specDir: string; files: string[]; slug: string };

      expect(result.success).toBe(true);
      expect(result.slug).toBe('user-auth');

      const expectedDir = path.join(projectRoot, '.ouroboros', 'specs', 'user-auth');
      expect(result.specDir).toBe(expectedDir);
      expect(result.files).toHaveLength(3);

      for (const filePath of result.files) {
        const stat = await fs.stat(filePath); // eslint-disable-line security/detect-non-literal-fs-filename
        expect(stat.isFile()).toBe(true);
      }
    });

    it('files contain the feature name from the template placeholder', async () => {
      await handler(makeEvent(), {
        projectRoot,
        featureName: 'payment-flow',
      });

      const reqPath = path.join(
        projectRoot, '.ouroboros', 'specs', 'payment-flow', 'requirements.md',
      );
      const content = await fs.readFile(reqPath, 'utf8'); // eslint-disable-line security/detect-non-literal-fs-filename
      expect(content).toContain('payment-flow');
    });

    it('returns files in display order: requirements, design, tasks', async () => {
      const result = await handler(makeEvent(), {
        projectRoot,
        featureName: 'search',
      }) as { success: boolean; files: string[] };

      expect(result.files[0]).toMatch(/requirements\.md$/);
      expect(result.files[1]).toMatch(/design\.md$/);
      expect(result.files[2]).toMatch(/tasks\.md$/);
    });
  });

  describe('collision handling', () => {
    it('returns collision:true when the spec directory already exists', async () => {
      const specDir = path.join(projectRoot, '.ouroboros', 'specs', 'existing-feature');
      await fs.mkdir(specDir, { recursive: true }); // eslint-disable-line security/detect-non-literal-fs-filename

      const result = await handler(makeEvent(), {
        projectRoot,
        featureName: 'existing-feature',
      }) as { success: boolean; collision: boolean; specDir: string };

      expect(result.success).toBe(false);
      expect(result.collision).toBe(true);
      expect(result.specDir).toBe(specDir);
    });

    it('does not overwrite existing files on collision', async () => {
      const specDir = path.join(projectRoot, '.ouroboros', 'specs', 'guarded');
      await fs.mkdir(specDir, { recursive: true }); // eslint-disable-line security/detect-non-literal-fs-filename
      const sentinelPath = path.join(specDir, 'requirements.md');
      await fs.writeFile(sentinelPath, 'ORIGINAL', 'utf8'); // eslint-disable-line security/detect-non-literal-fs-filename

      await handler(makeEvent(), { projectRoot, featureName: 'guarded' });

      const content = await fs.readFile(sentinelPath, 'utf8'); // eslint-disable-line security/detect-non-literal-fs-filename
      expect(content).toBe('ORIGINAL');
    });
  });

  describe('invalid slug rejection', () => {
    it('returns invalid-feature-name for all-special-char input', async () => {
      const result = await handler(makeEvent(), {
        projectRoot,
        featureName: '!!!###',
      }) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid-feature-name');
    });

    it('returns invalid-feature-name for empty string', async () => {
      const result = await handler(makeEvent(), {
        projectRoot,
        featureName: '   ',
      }) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid-feature-name');
    });
  });

  describe('path security', () => {
    it('rejects a projectRoot outside the allowed workspace', async () => {
      // The allowed root is projectRoot; pass a different tmp dir
      const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'));  
      try {
        const result = await handler(makeEvent(), {
          projectRoot: outsideRoot,
          featureName: 'attack',
        }) as { success: boolean; error: string };

        // mockGetWindowProjectRoots returns projectRoot, not outsideRoot
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
      } finally {
        await fs.rm(outsideRoot, { recursive: true, force: true });  
      }
    });
  });
});
