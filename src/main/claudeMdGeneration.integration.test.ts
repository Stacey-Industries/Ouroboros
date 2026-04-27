/**
 * Integration test for the lean CLAUDE.md generation pipeline.
 *
 * Spins a temporary fixture directory with synthetic .ts files containing
 * inline warning comments, mocks spawnClaude so no real `claude` CLI is
 * invoked, drives generateForDirectory, and asserts on the prompt shape.
 *
 * What is NOT tested here: the actual Claude output quality (that is tested
 * in claudeMdGeneratorLeanPrompt.test.ts and claudeMdGeneratorInlineWarnings.test.ts).
 * This test covers the wiring between the orchestrator, prompt builder, and
 * inline-warnings extractor.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaudeMdSettings } from './configTypes';

// ---------------------------------------------------------------------------
// Module-level mock for spawnClaude.
// We mock the entire support module and replace only spawnClaude.
// ---------------------------------------------------------------------------

const capturedPrompts: string[] = [];

vi.mock('./claudeMdGeneratorSupport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./claudeMdGeneratorSupport')>();
  return {
    ...actual,
    spawnClaude: vi.fn(async (prompt: string) => {
      capturedPrompts.push(prompt);
      // Return minimal valid CLAUDE.md content so writeClaudeMd does not skip.
      return `# Test Directory\n\n## Gotchas\n\n- **Test**: synthetic result from mock.`;
    }),
  };
});

// Mock config module so generateForDirectory can call getConfigValue.
vi.mock('./config', () => ({
  getConfigValue: vi.fn((key: string) => {
    if (key === 'claudeMdSettings') {
      return {
        enabled: true,
        leanMode: true,
        maxLines: 200,
        model: 'sonnet',
        excludeDirs: [],
        generateRoot: true,
        generateSubdirs: false,
        triggerMode: 'manual',
        autoCommit: false,
      } satisfies ClaudeMdSettings;
    }
    return undefined;
  }),
  setConfigValue: vi.fn(),
}));

// Mock logger so tests don't spew output.
vi.mock('./logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock windowManager and webServer — not needed for this test.
vi.mock('./windowManager', () => ({ getAllActiveWindows: vi.fn(() => []) }));
vi.mock('./web/webServer', () => ({ broadcastToWebClients: vi.fn() }));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function writeFixtureFile(dir: string, name: string, content: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path
  await fs.writeFile(path.join(dir, name), content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLAUDE.md generation pipeline integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    capturedPrompts.length = 0;
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-md-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup — don't fail the test.
    }
  });

  it('calls spawnClaude with a prompt containing "OMIT rather than speculate"', async () => {
    await writeFixtureFile(
      tmpDir,
      'example.ts',
      `export function doSomething(): void {
  // NOTE: this runs before hydration — do not add async calls here
  const x = 1;
  return;
}`,
    );

    const { generateForDirectory } = await import('./claudeMdGenerator');
    await generateForDirectory(tmpDir, tmpDir);

    expect(capturedPrompts.length).toBeGreaterThan(0);
    const prompt = capturedPrompts[0];
    expect(prompt).toContain('OMIT rather than speculate');
  });

  it('prompt contains the EXCLUDE list keywords', async () => {
    await writeFixtureFile(tmpDir, 'service.ts', `export const SERVICE_ID = 'test';`);

    const { generateForDirectory } = await import('./claudeMdGenerator');
    await generateForDirectory(tmpDir, tmpDir);

    const prompt = capturedPrompts[0] ?? '';
    // Lean prompt uses title-cased list items — match the actual prompt text.
    expect(prompt).toContain('File-role tables');
    expect(prompt).toContain('Subdirectory indexes');
    expect(prompt).toContain('Import/export dependency lists');
  });

  it('prompt embeds inline warnings extracted from fixture files', async () => {
    await writeFixtureFile(
      tmpDir,
      'widget.ts',
      `// NOTE: layout depends on explicit pixel height here — do not switch to flex
function renderWidget(): void {
  // WARNING: calling this before domReady crashes the process
  const el = document.createElement('div');
  el.style.height = '42px';
}`,
    );

    const { generateForDirectory } = await import('./claudeMdGenerator');
    await generateForDirectory(tmpDir, tmpDir);

    const prompt = capturedPrompts[0] ?? '';
    expect(prompt).toContain('layout depends on explicit pixel height');
    expect(prompt).toContain('calling this before domReady crashes');
  });

  it('prompt embeds eslint-disable reason comments', async () => {
    await writeFixtureFile(
      tmpDir,
      'loader.ts',
      `import fs from 'fs';
// eslint-disable-next-line security/detect-non-literal-fs-filename -- reason: path comes from validated project root
const content = fs.readFileSync(configPath, 'utf-8');`,
    );

    const { generateForDirectory } = await import('./claudeMdGenerator');
    await generateForDirectory(tmpDir, tmpDir);

    const prompt = capturedPrompts[0] ?? '';
    expect(prompt).toContain('path comes from validated project root');
  });

  it('uses lean prompt when leanMode is true (default)', async () => {
    await writeFixtureFile(tmpDir, 'index.ts', `export const version = '1.0.0';`);

    const { generateForDirectory } = await import('./claudeMdGenerator');
    await generateForDirectory(tmpDir, tmpDir);

    const prompt = capturedPrompts[0] ?? '';
    // Lean prompt has an EXCLUDE section; legacy prompt has "Files in this directory"
    expect(prompt).toContain('EXCLUDE');
    expect(prompt).toContain('INCLUDE');
    expect(prompt).not.toContain('Files in this directory');
  });

  it('uses legacy prompt and omits lean directives when leanMode is false', async () => {
    const { getConfigValue } = await import('./config');
    vi.mocked(getConfigValue).mockImplementation((key: string) => {
      if (key === 'claudeMdSettings') {
        return {
          enabled: true,
          leanMode: false,
          maxLines: 200,
          model: 'sonnet',
          excludeDirs: [],
          generateRoot: true,
          generateSubdirs: false,
          triggerMode: 'manual',
          autoCommit: false,
        } satisfies ClaudeMdSettings;
      }
      return undefined;
    });

    await writeFixtureFile(
      tmpDir,
      'legacy.ts',
      `// NOTE: this is a legacy test file
export const LEGACY = true;`,
    );

    const { generateForDirectory } = await import('./claudeMdGenerator');
    await generateForDirectory(tmpDir, tmpDir);

    const prompt = capturedPrompts[0] ?? '';
    // Legacy prompt should NOT contain lean-specific sections.
    expect(prompt).not.toContain('OMIT rather than speculate');
    expect(prompt).not.toContain('EXCLUDE');
    // Legacy prompt should contain the legacy header.
    expect(prompt).toContain('Files in this directory');
  });

  it('writes generated content to CLAUDE.md in the fixture dir', async () => {
    await writeFixtureFile(tmpDir, 'output.ts', `export const OUTPUT = 'check';`);

    const { generateForDirectory } = await import('./claudeMdGenerator');
    const result = await generateForDirectory(tmpDir, tmpDir);

    expect(result.status).not.toBe('error');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- test fixture path
    const written = await fs.readFile(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(written).toContain('## Gotchas');
    expect(written).toContain('<!-- claude-md-auto:start -->');
  });

  it('returns skipped when enabled is false', async () => {
    const { getConfigValue } = await import('./config');
    vi.mocked(getConfigValue).mockImplementation((key: string) => {
      if (key === 'claudeMdSettings') {
        return { enabled: false } as ClaudeMdSettings;
      }
      return undefined;
    });

    const { generateForDirectory } = await import('./claudeMdGenerator');
    const result = await generateForDirectory(tmpDir, tmpDir);

    expect(result.status).toBe('skipped');
    expect(capturedPrompts.length).toBe(0);
  });
});
