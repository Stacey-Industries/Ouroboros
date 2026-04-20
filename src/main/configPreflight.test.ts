/* eslint-disable security/detect-non-literal-fs-filename -- test paths are os.tmpdir-derived, not user input */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tmpDirs: string[] = [];

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(),
  },
}));

async function loadModule(userDataDir: string) {
  const electron = (await import('electron')) as unknown as {
    app: { getPath: ReturnType<typeof vi.fn> };
  };
  electron.app.getPath.mockReturnValue(userDataDir);
  vi.resetModules();
  electron.app.getPath.mockReturnValue(userDataDir);
  return import('./configPreflight');
}

function makeTmpUserData(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-preflight-'));
  tmpDirs.push(dir);
  return dir;
}

function writeConfig(dir: string, value: unknown): string {
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, JSON.stringify(value, null, '\t'), 'utf8');
  return file;
}

function readConfig(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

describe('runConfigPreflight', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    while (tmpDirs.length > 0) {
      const dir = tmpDirs.pop()!;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it('resets non-array profiles to []', async () => {
    const dir = makeTmpUserData();
    const file = writeConfig(dir, {
      profiles: { 'Cole Stacey': { activeTheme: 'warp' } },
      activeTheme: 'warp',
    });
    const { runConfigPreflight } = await loadModule(dir);
    runConfigPreflight();
    const after = readConfig(file);
    expect(Array.isArray(after.profiles)).toBe(true);
    expect(after.profiles).toEqual([]);
    expect(after.activeTheme).toBe('warp');
  });

  it('leaves a valid array profiles untouched', async () => {
    const dir = makeTmpUserData();
    const profiles = [{ id: 'p1', name: 'Default' }];
    const file = writeConfig(dir, { profiles });
    const before = fs.statSync(file).mtimeMs;
    const { runConfigPreflight } = await loadModule(dir);
    runConfigPreflight();
    const after = readConfig(file);
    expect(after.profiles).toEqual(profiles);
    expect(fs.statSync(file).mtimeMs).toBe(before);
  });

  it('is a no-op when config.json does not exist', async () => {
    const dir = makeTmpUserData();
    const file = path.join(dir, 'config.json');
    const { runConfigPreflight } = await loadModule(dir);
    expect(() => runConfigPreflight()).not.toThrow();
    expect(fs.existsSync(file)).toBe(false);
  });

  it('does not throw on malformed JSON', async () => {
    const dir = makeTmpUserData();
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, '{ not json', 'utf8');
    const { runConfigPreflight } = await loadModule(dir);
    expect(() => runConfigPreflight()).not.toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe('{ not json');
  });

  it('does not add a profiles key when one was absent', async () => {
    const dir = makeTmpUserData();
    const file = writeConfig(dir, { activeTheme: 'modern' });
    const { runConfigPreflight } = await loadModule(dir);
    runConfigPreflight();
    const after = readConfig(file);
    expect('profiles' in after).toBe(false);
  });
});
