/**
 * project.fixture.ts — Extends the Electron test fixture with a throwaway
 * git-initialised project in a temp directory.
 *
 * Provides:
 *   projectDir  — absolute path to the temp project root (git initialised)
 *   seedFile(relative, content) — write additional files before a test
 *
 * Seeded content on creation:
 *   README.md          — minimal project readme
 *   src/index.ts       — a small TypeScript source file
 *   src/utils.ts       — a utility module so diff/spec tests have targets
 *
 * Teardown removes the temp directory automatically.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { expect, test as electronTest } from '../electron.fixture';

// ── Types ────────────────────────────────────────────────────────────────────

export type SeedFile = (relative: string, content: string) => void;

export interface ProjectFixtures {
  projectDir: string;
  seedFile: SeedFile;
}

// ── Seed content ──────────────────────────────────────────────────────────────

const SEED_FILES: Record<string, string> = {
  'README.md': '# Test Project\n\nA throwaway project for E2E tests.\n',
  // Exclude .ouroboros/ from git so git stash --include-untracked does not try
  // to stash graph.db-wal (locked by the running Electron process on Windows).
  '.gitignore': '.ouroboros/\n',
  'src/index.ts': [
    '/** Entry point */',
    'export function greet(name: string): string {',
    '  return `Hello, ${name}!`;',
    '}',
    '',
  ].join('\n'),
  'src/utils.ts': [
    '/** Utility helpers */',
    'export function clamp(n: number, min: number, max: number): number {',
    '  return Math.min(Math.max(n, min), max);',
    '}',
    '',
    'export function capitalize(s: string): string {',
    '  return s.charAt(0).toUpperCase() + s.slice(1);',
    '}',
    '',
  ].join('\n'),
};

// ── Git initialisation helpers ────────────────────────────────────────────────

function initGitRepo(dir: string): void {
  const opts = { cwd: dir, stdio: 'pipe' as const };
  execSync('git init -b main', opts);
  execSync('git config user.email "test@ouroboros.test"', opts);
  execSync('git config user.name "Ouroboros Test"', opts);
}

function makeInitialCommit(dir: string): void {
  const opts = { cwd: dir, stdio: 'pipe' as const };
  execSync('git add -A', opts);
  execSync('git commit -m "Initial seed"', opts);
}

// ── Fixture definition ────────────────────────────────────────────────────────

export const test = electronTest.extend<ProjectFixtures>({
  projectDir: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ouroboros-e2e-'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });

    for (const [rel, content] of Object.entries(SEED_FILES)) {
      fs.writeFileSync(path.join(dir, rel), content, 'utf8');
    }

    initGitRepo(dir);
    makeInitialCommit(dir);

    await use(dir);

    // Teardown — best-effort removal
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors — temp dir will be reclaimed by OS
    }
  },

  seedFile: async ({ projectDir }, use) => {
    const seed: SeedFile = (relative, content) => {
      const full = path.join(projectDir, relative);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
    };
    await use(seed);
  },
});

export { expect };
