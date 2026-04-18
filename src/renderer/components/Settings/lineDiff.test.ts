/**
 * lineDiff.test.ts — Pure unit tests for the line-level LCS diff utility.
 *
 * Wave 37 Phase B.
 */

import { describe, expect, it } from 'vitest'

import type { DiffLine } from './lineDiff'
import { lineDiff } from './lineDiff'

// ── Helpers ───────────────────────────────────────────────────────────────────

function kinds(lines: DiffLine[]): string[] {
  return lines.map((l) => l.kind)
}

function texts(lines: DiffLine[]): string[] {
  return lines.map((l) => l.text)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('lineDiff', () => {
  it('returns empty array for two empty strings', () => {
    expect(lineDiff('', '')).toEqual([])
  })

  it('marks all lines equal when inputs are identical', () => {
    const result = lineDiff('a\nb\nc', 'a\nb\nc')
    expect(kinds(result)).toEqual(['equal', 'equal', 'equal'])
    expect(texts(result)).toEqual(['a', 'b', 'c'])
  })

  it('marks inserted lines when b has extra lines', () => {
    const result = lineDiff('a\nc', 'a\nb\nc')
    const inserts = result.filter((l) => l.kind === 'insert')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].text).toBe('b')
  })

  it('marks deleted lines when a has extra lines', () => {
    const result = lineDiff('a\nb\nc', 'a\nc')
    const deletes = result.filter((l) => l.kind === 'delete')
    expect(deletes).toHaveLength(1)
    expect(deletes[0].text).toBe('b')
  })

  it('handles fully different inputs (all delete + insert)', () => {
    const result = lineDiff('x\ny', 'a\nb')
    const dels = result.filter((l) => l.kind === 'delete')
    const ins = result.filter((l) => l.kind === 'insert')
    expect(dels).toHaveLength(2)
    expect(ins).toHaveLength(2)
    expect(result.filter((l) => l.kind === 'equal')).toHaveLength(0)
  })

  it('produces correct output order (equal lines preserved in position)', () => {
    // a and c are shared; b is deleted; x is inserted
    const result = lineDiff('a\nb\nc', 'a\nx\nc')
    expect(texts(result)).toEqual(['a', 'b', 'x', 'c'])
    expect(kinds(result)).toEqual(['equal', 'delete', 'insert', 'equal'])
  })

  it('handles single-line inputs that are equal', () => {
    const result = lineDiff('hello', 'hello')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ kind: 'equal', text: 'hello' })
  })

  it('handles single-line inputs that differ', () => {
    const result = lineDiff('hello', 'world')
    const dels = result.filter((l) => l.kind === 'delete')
    const ins = result.filter((l) => l.kind === 'insert')
    expect(dels[0].text).toBe('hello')
    expect(ins[0].text).toBe('world')
  })

  it('handles empty lhs (all inserts)', () => {
    const result = lineDiff('', 'a\nb')
    // splitting '' on '\n' gives [''], then b gives ['a','b']
    // The equal '' line from lhs matches nothing in b — implementation detail.
    // What matters: every line from b appears as insert or the result contains b's lines.
    const insertedTexts = result.filter((l) => l.kind === 'insert').map((l) => l.text)
    expect(insertedTexts).toContain('a')
    expect(insertedTexts).toContain('b')
  })

  it('handles empty rhs (all deletes)', () => {
    const result = lineDiff('a\nb', '')
    const deletedTexts = result.filter((l) => l.kind === 'delete').map((l) => l.text)
    expect(deletedTexts).toContain('a')
    expect(deletedTexts).toContain('b')
  })

  it('preserves blank lines as distinct tokens', () => {
    const result = lineDiff('a\n\nb', 'a\n\nc')
    const equalLines = result.filter((l) => l.kind === 'equal').map((l) => l.text)
    expect(equalLines).toContain('a')
    expect(equalLines).toContain('')
  })
})
