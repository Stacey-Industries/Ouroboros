/**
 * ouroborosMcpPath.test.ts — coverage for path resolution + arg parsing.
 */

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultDbPath, parseArgs, resolveUserDataDir } from './ouroborosMcpPath';

describe('resolveUserDataDir', () => {
  it('resolves Windows path under APPDATA', () => {
    const dir = resolveUserDataDir({
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\test\\AppData\\Roaming' },
    });
    expect(dir).toBe(path.join('C:\\Users\\test\\AppData\\Roaming', 'ouroboros'));
  });

  it('resolves macOS path under HOME/Library/Application Support', () => {
    const dir = resolveUserDataDir({ platform: 'darwin', env: { HOME: '/Users/test' } });
    expect(dir).toBe(path.join('/Users/test', 'Library', 'Application Support', 'ouroboros'));
  });

  it('resolves Linux path under HOME/.config', () => {
    const dir = resolveUserDataDir({ platform: 'linux', env: { HOME: '/home/test' } });
    expect(dir).toBe(path.join('/home/test', '.config', 'ouroboros'));
  });

  it('throws on Windows when APPDATA is missing', () => {
    expect(() => resolveUserDataDir({ platform: 'win32', env: {} })).toThrow(/APPDATA/);
  });

  it('throws on darwin when HOME is missing', () => {
    expect(() => resolveUserDataDir({ platform: 'darwin', env: {} })).toThrow(/HOME/);
  });
});

describe('defaultDbPath', () => {
  it('appends codebase-graph.db to the user data dir', () => {
    const p = defaultDbPath({ platform: 'linux', env: { HOME: '/home/test' } });
    expect(p).toBe(path.join('/home/test', '.config', 'ouroboros', 'codebase-graph.db'));
  });
});

describe('parseArgs', () => {
  const env = { platform: 'linux' as const, env: { HOME: '/home/test' } };

  it('returns the default DB path with no args', () => {
    const parsed = parseArgs([], env);
    expect(parsed.dbPath).toBe(defaultDbPath(env));
  });

  it('honors --db with an absolute path', () => {
    const parsed = parseArgs(['--db', '/custom/path/graph.db'], env);
    expect(parsed.dbPath).toBe('/custom/path/graph.db');
  });

  it('throws on --db with a relative path', () => {
    expect(() => parseArgs(['--db', './rel.db'], env)).toThrow(/absolute/);
  });

  it('throws on --db with no following argument', () => {
    expect(() => parseArgs(['--db'], env)).toThrow(/path argument/);
  });

  it('throws on unknown args', () => {
    expect(() => parseArgs(['--bogus'], env)).toThrow(/Unknown argument/);
  });
});
