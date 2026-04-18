/**
 * wordDiff.test.ts — Wave 36 Phase F
 * @vitest-environment node
 *
 * Pure unit tests for the wordDiff function. No DOM needed.
 */

import { describe, expect, it } from 'vitest';

import type { DiffToken } from './wordDiff';
import { wordDiff } from './wordDiff';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function equalTexts(tokens: DiffToken[]): string[] {
  return tokens.filter((t) => t.kind === 'equal').map((t) => t.text);
}

function insertedTexts(tokens: DiffToken[]): string[] {
  return tokens.filter((t) => t.kind === 'insert').map((t) => t.text);
}

function deletedTexts(tokens: DiffToken[]): string[] {
  return tokens.filter((t) => t.kind === 'delete').map((t) => t.text);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('wordDiff', () => {
  it('returns empty array for two empty strings', () => {
    expect(wordDiff('', '')).toEqual([]);
  });

  it('marks all tokens as equal for identical strings', () => {
    const tokens = wordDiff('hello world', 'hello world');
    expect(tokens.every((t) => t.kind === 'equal')).toBe(true);
    expect(equalTexts(tokens)).toContain('hello');
    expect(equalTexts(tokens)).toContain('world');
  });

  it('marks all tokens as insert when left is empty', () => {
    const tokens = wordDiff('', 'foo bar');
    expect(tokens.every((t) => t.kind === 'insert')).toBe(true);
    expect(insertedTexts(tokens)).toContain('foo');
    expect(insertedTexts(tokens)).toContain('bar');
  });

  it('marks all tokens as delete when right is empty', () => {
    const tokens = wordDiff('foo bar', '');
    expect(tokens.every((t) => t.kind === 'delete')).toBe(true);
    expect(deletedTexts(tokens)).toContain('foo');
    expect(deletedTexts(tokens)).toContain('bar');
  });

  it('detects a single word change', () => {
    const tokens = wordDiff('the cat sat', 'the dog sat');
    expect(equalTexts(tokens)).toContain('the');
    expect(equalTexts(tokens)).toContain('sat');
    expect(deletedTexts(tokens)).toContain('cat');
    expect(insertedTexts(tokens)).toContain('dog');
  });

  it('detects an inserted word', () => {
    const tokens = wordDiff('foo bar', 'foo baz bar');
    expect(equalTexts(tokens)).toContain('foo');
    expect(equalTexts(tokens)).toContain('bar');
    expect(insertedTexts(tokens)).toContain('baz');
  });

  it('detects a deleted word', () => {
    const tokens = wordDiff('foo baz bar', 'foo bar');
    expect(equalTexts(tokens)).toContain('foo');
    expect(equalTexts(tokens)).toContain('bar');
    expect(deletedTexts(tokens)).toContain('baz');
  });

  it('handles completely different strings', () => {
    const tokens = wordDiff('alpha beta', 'gamma delta');
    expect(deletedTexts(tokens)).toContain('alpha');
    expect(deletedTexts(tokens)).toContain('beta');
    expect(insertedTexts(tokens)).toContain('gamma');
    expect(insertedTexts(tokens)).toContain('delta');
    // The whitespace separator ' ' is a shared token — only word tokens differ
    const equalWords = equalTexts(tokens).filter((t) => t.trim().length > 0);
    expect(equalWords).toHaveLength(0);
  });

  it('preserves all tokens so join reconstructs both sides', () => {
    const a = 'the quick brown fox';
    const b = 'the slow brown dog';
    const tokens = wordDiff(a, b);

    const reconstructA = tokens
      .filter((t) => t.kind === 'equal' || t.kind === 'delete')
      .map((t) => t.text)
      .join('');
    const reconstructB = tokens
      .filter((t) => t.kind === 'equal' || t.kind === 'insert')
      .map((t) => t.text)
      .join('');

    expect(reconstructA).toBe(a);
    expect(reconstructB).toBe(b);
  });

  it('returns DiffToken objects with kind and text fields', () => {
    const tokens = wordDiff('a b', 'a c');
    for (const token of tokens) {
      expect(token).toHaveProperty('kind');
      expect(token).toHaveProperty('text');
      expect(['equal', 'insert', 'delete']).toContain(token.kind);
      expect(typeof token.text).toBe('string');
    }
  });

  it('handles multiline strings', () => {
    const a = 'line one\nline two';
    const b = 'line one\nline three';
    const tokens = wordDiff(a, b);
    expect(equalTexts(tokens)).toContain('one');
    expect(deletedTexts(tokens)).toContain('two');
    expect(insertedTexts(tokens)).toContain('three');
  });
});
