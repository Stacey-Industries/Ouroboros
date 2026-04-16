/**
 * FileRefResolver.test.ts — corpus tests for Wave 22 Phase A file-ref extraction.
 *
 * Tests against ≥20 real agent-output snippets with zero false positives required.
 */

import { describe, expect, it } from 'vitest';

import { extractFileRefs } from './FileRefResolver';

// ── Helper ───────────────────────────────────────────────────────────────────

function paths(text: string): string[] {
  return extractFileRefs(text).map((r) => r.path);
}

// ── Should-match corpus ──────────────────────────────────────────────────────

describe('extractFileRefs — should match', () => {
  it('matches foo/bar.ts:42:3 with line and col', () => {
    const refs = extractFileRefs('edited foo/bar.ts:42:3 successfully');
    expect(refs).toHaveLength(1);
    expect(refs[0].path).toBe('foo/bar.ts');
    expect(refs[0].line).toBe(42);
    expect(refs[0].col).toBe(3);
    expect(refs[0].raw).toBe('foo/bar.ts:42:3');
  });

  it('matches tsx path with line:col mid-sentence', () => {
    const refs = extractFileRefs('In src/renderer/App.tsx:100:5 there is a bug');
    expect(refs[0].path).toBe('src/renderer/App.tsx');
    expect(refs[0].line).toBe(100);
    expect(refs[0].col).toBe(5);
  });

  it('matches ./src/file.py:10 with line only', () => {
    const refs = extractFileRefs('See ./src/file.py:10 for details');
    expect(refs[0].path).toBe('./src/file.py');
    expect(refs[0].line).toBe(10);
    expect(refs[0].col).toBeUndefined();
  });

  it('matches src/main/hooks.ts:55 line-only', () => {
    const refs = extractFileRefs('Look at src/main/hooks.ts:55 now');
    expect(refs[0].path).toBe('src/main/hooks.ts');
    expect(refs[0].line).toBe(55);
  });

  it('matches absolute /absolute/path/to/config.json', () => {
    const refs = extractFileRefs('Wrote /absolute/path/to/config.json');
    expect(refs[0].path).toBe('/absolute/path/to/config.json');
    expect(refs[0].line).toBeUndefined();
  });

  it('matches ./components/Button.tsx relative path', () => {
    expect(paths('Opening ./components/Button.tsx')).toContain('./components/Button.tsx');
  });

  it('matches bare relative src/main/main.ts', () => {
    expect(paths('Updated src/main/main.ts as requested')).toContain('src/main/main.ts');
  });

  it('matches docs/architecture.md', () => {
    expect(paths('Modified docs/architecture.md for clarity')).toContain('docs/architecture.md');
  });

  it('matches deeply nested renderer component path', () => {
    const text = 'See src/renderer/components/Terminal/TerminalInstance.tsx for details';
    expect(paths(text)).toContain('src/renderer/components/Terminal/TerminalInstance.tsx');
  });

  it('matches bare filename package.json', () => {
    expect(paths('Edited package.json to add dependency')).toContain('package.json');
  });

  it('matches bare filename tsconfig.json', () => {
    expect(paths('Updated tsconfig.json for strict mode')).toContain('tsconfig.json');
  });

  it('matches both refs in "Compare src/a.ts and src/b.ts"', () => {
    const found = paths('Compare src/a.ts and src/b.ts');
    expect(found).toContain('src/a.ts');
    expect(found).toContain('src/b.ts');
  });

  it('matches src/main/pty.ts:200 line-only', () => {
    const refs = extractFileRefs('Error at src/main/pty.ts:200');
    expect(refs[0].path).toBe('src/main/pty.ts');
    expect(refs[0].line).toBe(200);
  });

  it('matches ../sibling/file.ts:8:1 parent-relative path', () => {
    const refs = extractFileRefs('at ../sibling/file.ts:8:1');
    expect(refs[0].path).toBe('../sibling/file.ts');
    expect(refs[0].line).toBe(8);
    expect(refs[0].col).toBe(1);
  });

  it('returns correct start/end offsets', () => {
    const text = 'edit src/foo/bar.ts:5:2 done';
    const refs = extractFileRefs(text);
    expect(refs).toHaveLength(1);
    expect(text.slice(refs[0].start, refs[0].end)).toBe('src/foo/bar.ts:5:2');
  });

  it('matches path after colon+space (dict-style)', () => {
    expect(paths('file: ./src/file.py:10')).toContain('./src/file.py');
  });

  it('matches yaml-extension files', () => {
    expect(paths('Updated .github/workflows/ci.yml')).toContain('.github/workflows/ci.yml');
  });

  it('matches shell script paths', () => {
    expect(paths('Running scripts/build.sh now')).toContain('scripts/build.sh');
  });

  it('matches go source file', () => {
    expect(paths('Bug in cmd/server/main.go:88')).toContain('cmd/server/main.go');
  });

  it('matches rust source file', () => {
    expect(paths('See src/lib.rs:12:4 for the fix')).toContain('src/lib.rs');
  });
});

// ── Should-NOT-match corpus ─────────────────────────────────────────────────

describe('extractFileRefs — should NOT match (no false positives)', () => {
  it('rejects https:// URLs', () => {
    expect(paths('See https://example.com/path/to/file')).toHaveLength(0);
  });

  it('rejects http:// localhost URLs', () => {
    expect(paths('Visit http://localhost:3000/api/health')).toHaveLength(0);
  });

  it('rejects ftp:// URLs', () => {
    expect(paths('ftp://files.example.com/data')).toHaveLength(0);
  });

  it('rejects Markdown link path in parens: [label](src/foo/bar.ts)', () => {
    expect(paths('[click here](src/foo/bar.ts)')).toHaveLength(0);
  });

  it('rejects pure numbers "123:45"', () => {
    expect(paths('Error code 123:45')).toHaveLength(0);
  });

  it('rejects version number "3.14.2"', () => {
    expect(paths('Version 3.14.2 released')).toHaveLength(0);
  });

  it('rejects bare word "hello"', () => {
    expect(paths('hello world')).toHaveLength(0);
  });

  it('rejects bare import keyword "React"', () => {
    expect(paths('import React')).toHaveLength(0);
  });

  it('rejects non-known 2-char extension "file.ab"', () => {
    expect(paths('file.ab is unknown')).toHaveLength(0);
  });

  it('rejects non-known extension "report.xyz"', () => {
    expect(paths('report.xyz file')).toHaveLength(0);
  });

  it('rejects IP address "192.168.1.1:8080"', () => {
    expect(paths('192.168.1.1:8080')).toHaveLength(0);
  });

  it('rejects node version string "v18.12.0"', () => {
    expect(paths('node v18.12.0 is required')).toHaveLength(0);
  });
});
