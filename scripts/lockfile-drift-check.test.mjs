/**
 * lockfile-drift-check.test.mjs
 *
 * Tests for scripts/lockfile-drift-check.mjs — spawns the script as a child
 * process with temp-file fixtures, asserts on exit status and stdout.
 *
 * Vitest includes scripts/**\/\*.test.mjs per vitest.config.ts.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(fileURLToPath(import.meta.url), '..', 'lockfile-drift-check.mjs');

// ---- Helpers -----------------------------------------------------------------

function makeLockfile(packages) {
  return {
    name: 'test',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { name: 'test', version: '1.0.0' },
      ...Object.fromEntries(
        Object.entries(packages).map(([name, version]) => [
          `node_modules/${name}`,
          { version, resolved: `https://r.npmjs.com/${name}/-/${name}-${version}.tgz` },
        ]),
      ),
    },
  };
}

let tmpDir;
let oldPath, newPath;

function writePair(oldPkgs, newPkgs) {
  oldPath = join(tmpDir, 'old.json');
  newPath = join(tmpDir, 'new.json');
  writeFileSync(oldPath, JSON.stringify(makeLockfile(oldPkgs)));
  writeFileSync(newPath, JSON.stringify(makeLockfile(newPkgs)));
}

function run(...extraArgs) {
  return spawnSync(process.execPath, [SCRIPT, oldPath, newPath, ...extraArgs], {
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
}

// ---- Setup / teardown --------------------------------------------------------

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'drift-check-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---- Tests -------------------------------------------------------------------

describe('lockfile-drift-check — no-drift: identical lockfiles', () => {
  it('exits 0 and reports no drift when lockfiles are identical', () => {
    writePair({ lodash: '4.17.21', chalk: '5.3.0' }, { lodash: '4.17.21', chalk: '5.3.0' });
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No drift detected');
  });
});

describe('lockfile-drift-check — patch-only drift', () => {
  it('exits 0 and labels the change as PATCH when only a patch bump exists', () => {
    writePair({ lodash: '4.17.20' }, { lodash: '4.17.21' });
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[PATCH]');
    expect(result.stdout).toContain('lodash');
    expect(result.stdout).toContain('4.17.20');
    expect(result.stdout).toContain('4.17.21');
  });
});

describe('lockfile-drift-check — minor drift', () => {
  it('exits 2 and labels the change as MINOR when a minor bump exists', () => {
    writePair({ chalk: '5.2.0' }, { chalk: '5.3.0' });
    const result = run();
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('[MINOR]');
    expect(result.stdout).toContain('chalk');
    expect(result.stdout).toContain('5.2.0');
    expect(result.stdout).toContain('5.3.0');
  });
});

describe('lockfile-drift-check — major drift', () => {
  it('exits 2 and labels the change as MAJOR when a major bump exists', () => {
    writePair({ 'some-lib': '1.9.0' }, { 'some-lib': '2.0.0' });
    const result = run();
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('[MAJOR]');
    expect(result.stdout).toContain('some-lib');
    expect(result.stdout).toContain('1.9.0');
    expect(result.stdout).toContain('2.0.0');
  });
});

describe('lockfile-drift-check — added and removed packages', () => {
  it('exits 0 and shows ADDED and REMOVED entries when packages appear or disappear', () => {
    writePair(
      { lodash: '4.17.21', 'old-dep': '1.0.0' },
      { lodash: '4.17.21', 'new-dep': '2.0.0' },
    );
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[ADDED]');
    expect(result.stdout).toContain('new-dep');
    expect(result.stdout).toContain('[REMOVED]');
    expect(result.stdout).toContain('old-dep');
  });
});

describe('lockfile-drift-check — --accept-drift override', () => {
  it('exits 0 even when minor drift exists if --accept-drift is passed', () => {
    writePair({ vite: '7.3.1' }, { vite: '7.4.0' });
    const result = run('--accept-drift');
    expect(result.status).toBe(0);
    // Still reports the drift — just doesn't fail.
    expect(result.stdout).toContain('[MINOR]');
    expect(result.stdout).toContain('vite');
  });
});
