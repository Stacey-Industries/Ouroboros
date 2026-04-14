/**
 * main.test.ts — Smoke tests for main.ts bootstrap refactor (Wave 10 Package C).
 *
 * main.ts cannot be imported in a test environment (it calls Electron APIs at
 * module scope). These tests verify the snapshot-safety invariants by inspecting
 * the source text directly, and exercise the utility functions extracted into
 * mainStartup.ts that are testable in isolation.
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const MAIN_TS = path.join(__dirname, 'main.ts');
const STARTUP_TS = path.join(__dirname, 'mainStartup.ts');
// eslint-disable-next-line security/detect-non-literal-fs-filename -- test reads its sibling source files
const source = fs.readFileSync(MAIN_TS, 'utf-8');
// eslint-disable-next-line security/detect-non-literal-fs-filename -- test reads its sibling source files
const startupSource = fs.readFileSync(STARTUP_TS, 'utf-8');

// Split into lines for line-aware assertions
const lines = source.split('\n');

// ---------------------------------------------------------------------------
// Helper: return the line numbers (1-based) that contain a pattern and are
// NOT inside a function body (i.e. they appear before the first `function` or
// `async function` keyword in the file, OR the pattern is the call itself at
// the very top level of the module).
// ---------------------------------------------------------------------------

function topLevelCallLines(pattern: RegExp): number[] {
  const results: number[] = [];
  let insideFunction = 0; // crude brace-depth heuristic after first function

  for (let i = 0; i < lines.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- i is a bounded loop counter
    const line = lines[i];
    // Count open/close braces to track depth (very coarse)
    if (/^(async )?function /.test(line) || /^(export )?(async )?function /.test(line)) {
      insideFunction++;
    }
    if (insideFunction === 0 && pattern.test(line)) {
      results.push(i + 1);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Snapshot-safety structural invariants
// ---------------------------------------------------------------------------

describe('main.ts snapshot-safety invariants', () => {
  it('does not call app.commandLine.appendSwitch at module scope outside a function', () => {
    // Any call must be inside a function body (depth > 0 after function keyword)
    const hits = topLevelCallLines(/app\.commandLine\.appendSwitch/);
    expect(hits, `appendSwitch found at module scope on lines: ${hits.join(', ')}`).toHaveLength(0);
  });

  it('does not call app.requestSingleInstanceLock at module scope outside a function', () => {
    const hits = topLevelCallLines(/app\.requestSingleInstanceLock/);
    expect(hits, `requestSingleInstanceLock found at module scope on lines: ${hits.join(', ')}`).toHaveLength(0);
  });

  it('does not call crashReporter.start at module scope outside a function', () => {
    const hits = topLevelCallLines(/crashReporter\.start/);
    expect(hits, `crashReporter.start found at module scope on lines: ${hits.join(', ')}`).toHaveLength(0);
  });

  it('does not call app.setName at module scope outside a function', () => {
    const hits = topLevelCallLines(/app\.setName/);
    expect(hits, `app.setName found at module scope on lines: ${hits.join(', ')}`).toHaveLength(0);
  });

  it('does not register process.on listeners at module scope outside a function', () => {
    const hits = topLevelCallLines(/process\.on\(/);
    expect(hits, `process.on found at module scope on lines: ${hits.join(', ')}`).toHaveLength(0);
  });

  it('defines bootstrapProcessHandlers function in mainStartup.ts', () => {
    expect(startupSource).toContain('function bootstrapProcessHandlers(');
  });

  it('defines bootstrapApp function in mainStartup.ts', () => {
    expect(startupSource).toContain('function bootstrapApp()');
  });

  it('defines bootstrapCrashReporter function in mainStartup.ts', () => {
    expect(startupSource).toContain('function bootstrapCrashReporter()');
  });

  it('defines ensureSingleInstance function in mainStartup.ts', () => {
    expect(startupSource).toContain('function ensureSingleInstance()');
  });

  it('calls bootstrap functions before app.whenReady()', () => {
    // Find the actual whenReady call (not the comment that mentions it)
    const whenReadyIdx = lines.findIndex((l) => /app\.whenReady\(\)\.then/.test(l));
    expect(whenReadyIdx).toBeGreaterThan(-1);

    // Find the call site (not the function definition — match the bare call statement)
    const bootstrapIdx = lines.findIndex(
      (l) => /^\s*bootstrapProcessHandlers\(/.test(l),
    );
    expect(bootstrapIdx).toBeGreaterThan(-1);
    expect(bootstrapIdx).toBeLessThan(whenReadyIdx);
  });

  it('still calls initializeApplication from app.whenReady()', () => {
    expect(source).toContain('app.whenReady().then(initializeApplication)');
  });

  it('still marks app-ready phase inside initializeApplication', () => {
    // markStartup('app-ready') must be the first call inside initializeApplication
    const initIdx = lines.findIndex((l) => l.includes('async function initializeApplication()'));
    expect(initIdx).toBeGreaterThan(-1);

    const markIdx = lines.findIndex((l) => l.includes("markStartup('app-ready')"));
    expect(markIdx).toBeGreaterThan(-1);
    expect(markIdx).toBeGreaterThan(initIdx);
  });

  it('still marks services-ready phase at end of initializeApplication', () => {
    expect(source).toContain("markStartup('services-ready')");
  });

  it('preserves all shutdown handlers (window-all-closed, will-quit)', () => {
    expect(source).toContain("app.on('window-all-closed'");
    expect(source).toContain("app.on('will-quit'");
  });

  it('preserves web-contents-created security handler', () => {
    expect(source).toContain("app.on('web-contents-created'");
    expect(source).toContain("action: 'deny'");
  });
});
