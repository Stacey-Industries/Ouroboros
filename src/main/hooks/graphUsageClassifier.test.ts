/**
 * graphUsageClassifier.test.ts — Wave 50 Phase D
 *
 * Coverage for classifyGrepPattern and classifyShape.
 * Verifies that the symbol / literal / unknown distinctions hold for the
 * patterns observed in the real corpus.
 */

import { describe, expect, it } from 'vitest';

import { classifyGrepPattern, classifyShape } from './graphUsageClassifier';

// ─── classifyGrepPattern ──────────────────────────────────────────────────────

describe('classifyGrepPattern', () => {
  it('returns symbol for bare camelCase identifiers', () => {
    expect(classifyGrepPattern('handleEvent')).toBe('symbol');
    expect(classifyGrepPattern('tapGraphUsage')).toBe('symbol');
    expect(classifyGrepPattern('registerAiHandlers')).toBe('symbol');
    expect(classifyGrepPattern('ContextSnippetSource')).toBe('symbol');
  });

  it('returns symbol for underscore-prefixed identifiers', () => {
    expect(classifyGrepPattern('_privateMethod')).toBe('symbol');
    expect(classifyGrepPattern('_helperFn')).toBe('symbol');
  });

  it('returns literal for dollar-prefixed patterns ($ is a regex metachar)', () => {
    // $ triggers REGEX_META check before BARE_IDENTIFIER — classified literal, not symbol
    expect(classifyGrepPattern('$injected')).toBe('literal');
  });

  it('returns literal for regex-meta patterns', () => {
    expect(classifyGrepPattern('handle.*Event')).toBe('literal');
    expect(classifyGrepPattern('foo|bar')).toBe('literal');
    expect(classifyGrepPattern('^export')).toBe('literal');
    expect(classifyGrepPattern('\\bfoo\\b')).toBe('literal');
    expect(classifyGrepPattern('foo(bar)')).toBe('literal');
    expect(classifyGrepPattern('[A-Z]+')).toBe('literal');
  });

  it('returns literal for quoted strings', () => {
    expect(classifyGrepPattern('"some error message"')).toBe('literal');
    expect(classifyGrepPattern("'single quoted'")).toBe('literal');
    expect(classifyGrepPattern('`template literal`')).toBe('literal');
  });

  it('returns literal for multi-word bare phrases (contain spaces)', () => {
    expect(classifyGrepPattern('some error message')).toBe('literal');
    expect(classifyGrepPattern('import React from')).toBe('literal');
  });

  it('returns literal for short identifiers (< 3 chars after first)', () => {
    // BARE_IDENTIFIER requires [\w$]{2,} after first char — 2+ more chars
    expect(classifyGrepPattern('id')).toBe('literal'); // only 2 chars total
    expect(classifyGrepPattern('fn')).toBe('literal');
  });

  it('returns unknown for empty pattern', () => {
    expect(classifyGrepPattern('')).toBe('unknown');
  });

  it('returns literal for @scoped package names', () => {
    expect(classifyGrepPattern('@tanstack/react-virtual')).toBe('literal');
    expect(classifyGrepPattern('@xterm/xterm')).toBe('literal');
  });

  it('returns literal for patterns with dots or slashes', () => {
    expect(classifyGrepPattern('src/main/foo.ts')).toBe('literal');
    expect(classifyGrepPattern('foo.bar.baz')).toBe('literal');
  });
});

// ─── classifyShape ────────────────────────────────────────────────────────────

describe('classifyShape', () => {
  it('classifies Grep with bare identifier as symbol', () => {
    expect(classifyShape('Grep', { pattern: 'handleEvent' })).toBe('symbol');
    expect(classifyShape('Grep', { pattern: 'evaluatePreToolUse' })).toBe('symbol');
  });

  it('classifies Grep with regex pattern as literal', () => {
    expect(classifyShape('Grep', { pattern: 'handle.*Event' })).toBe('literal');
  });

  it('classifies Grep with quoted string as literal', () => {
    expect(classifyShape('Grep', { pattern: '"error message"' })).toBe('literal');
  });

  it('returns unknown for Grep with empty pattern', () => {
    expect(classifyShape('Grep', { pattern: '' })).toBe('unknown');
    expect(classifyShape('Grep', {})).toBe('unknown');
  });

  it('classifies Read with file_path as literal', () => {
    expect(classifyShape('Read', { file_path: '/src/main/foo.ts' })).toBe('literal');
    expect(classifyShape('Read', { file_path: 'C:\\Web App\\foo.ts' })).toBe('literal');
  });

  it('returns unknown for Read with missing file_path', () => {
    expect(classifyShape('Read', {})).toBe('unknown');
    expect(classifyShape('Read', { file_path: '' })).toBe('unknown');
  });

  it('returns unknown for non-target tools', () => {
    expect(classifyShape('Edit', { pattern: 'foo' })).toBe('unknown');
    expect(classifyShape('Bash', { command: 'npm test' })).toBe('unknown');
    expect(classifyShape('Write', { file_path: '/foo' })).toBe('unknown');
  });

  it('returns unknown when input is undefined', () => {
    expect(classifyShape('Grep', undefined)).toBe('unknown');
    expect(classifyShape('Read', undefined)).toBe('unknown');
  });
});
