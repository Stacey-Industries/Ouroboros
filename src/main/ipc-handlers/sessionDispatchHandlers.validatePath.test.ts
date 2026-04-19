/**
 * sessionDispatchHandlers.validatePath.test.ts — Phase L Wave 41.
 *
 * Tests that validateProjectPath correctly rejects symlinks pointing outside
 * the configured project root via fs.realpathSync resolution.
 *
 * The symlink tests are skipped on Windows because creating symlinks requires
 * elevated privileges (or Developer Mode) which is not guaranteed in CI.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Stub Electron ──────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}));

// ── Stub windowManager ────────────────────────────────────────────────────────

const { mockGetWindowProjectRoots } = vi.hoisted(() => ({
  mockGetWindowProjectRoots: vi.fn<(id: number) => string[]>(() => []),
}));
vi.mock('../windowManager', () => ({
  getWindowProjectRoots: mockGetWindowProjectRoots,
}));

// ── Stub config ───────────────────────────────────────────────────────────────

const { mockGetConfigValue } = vi.hoisted(() => ({
  mockGetConfigValue: vi.fn<(key: string) => unknown>(() => undefined),
}));
vi.mock('../config', () => ({
  getConfigValue: mockGetConfigValue,
}));

// ── Stub logger ───────────────────────────────────────────────────────────────

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Stub sessionDispatchQueue ─────────────────────────────────────────────────

vi.mock('../session/sessionDispatchQueue', () => ({
  enqueue: vi.fn(),
  listJobs: vi.fn(() => []),
  cancelJob: vi.fn(() => ({ ok: true })),
}));

// ── Import after all mocks ────────────────────────────────────────────────────

import { validateProjectPath } from './sessionDispatchHandlers';

// ── Helpers ───────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-l-symlink-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors in tests
  }
});

// ── Symlink rejection tests ───────────────────────────────────────────────────

/* eslint-disable security/detect-non-literal-fs-filename -- test-only: paths come from
   os.tmpdir() controlled fixtures, not user input */
describe('validateProjectPath — symlink resolution', () => {
  it.skipIf(process.platform === 'win32')(
    'rejects a symlink that resolves to a directory outside the configured root',
    () => {
      // Create a project root directory
      const projectRoot = path.join(tmpDir, 'project');
      fs.mkdirSync(projectRoot);

      // Create a sibling directory that is OUTSIDE the project root
      const outsideDir = path.join(tmpDir, 'outside');
      fs.mkdirSync(outsideDir);

      // Create a symlink inside the project root that points to the outside dir
      const symlinkPath = path.join(projectRoot, 'link-to-outside');
      fs.symlinkSync(outsideDir, symlinkPath);

      // Configure the window to have projectRoot as its root
      mockGetWindowProjectRoots.mockReturnValue([projectRoot]);
      mockGetConfigValue.mockReturnValue(undefined);

      // The symlink is "inside" projectRoot by path string, but resolves outside
      expect(validateProjectPath(symlinkPath, 1)).toBe(false);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'allows a symlink that resolves to a directory inside the configured root',
    () => {
      const projectRoot = path.join(tmpDir, 'project');
      fs.mkdirSync(projectRoot);

      // Create a real subdirectory inside the root
      const realDir = path.join(projectRoot, 'real-subdir');
      fs.mkdirSync(realDir);

      // Create a symlink inside the project that points to another inside dir
      const symlinkPath = path.join(projectRoot, 'link-to-inside');
      fs.symlinkSync(realDir, symlinkPath);

      mockGetWindowProjectRoots.mockReturnValue([projectRoot]);
      mockGetConfigValue.mockReturnValue(undefined);

      // The symlink resolves within the root — should be allowed
      expect(validateProjectPath(symlinkPath, 1)).toBe(true);
    },
  );

  it('allows a path that does not exist yet (creation scenario — ENOENT fallback)', () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpDir, 'root-'));
    const newPath = path.join(projectRoot, 'new-subdir-not-yet-created');

    mockGetWindowProjectRoots.mockReturnValue([projectRoot]);
    mockGetConfigValue.mockReturnValue(undefined);

    // realpathSync will throw ENOENT; fallback to path.resolve should still allow it
    expect(validateProjectPath(newPath, 1)).toBe(true);
  });

  it('rejects a non-existent path outside the root (ENOENT fallback still checks bounds)', () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpDir, 'root-'));
    // A non-existent path in a completely different directory
    const outsidePath = path.join(tmpDir, 'other-dir', 'nonexistent');

    mockGetWindowProjectRoots.mockReturnValue([projectRoot]);
    mockGetConfigValue.mockReturnValue(undefined);

    expect(validateProjectPath(outsidePath, 1)).toBe(false);
  });
});
/* eslint-enable security/detect-non-literal-fs-filename */
