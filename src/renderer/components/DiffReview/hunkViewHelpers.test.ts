/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import {
  buildDisplayLines,
  gutterBg,
  lineBg,
  lineTypeFromPrefix,
  markerColor,
} from './hunkViewHelpers';
import type { ReviewHunk } from './types';

function makeHunk(lines: string[], overrides: Partial<ReviewHunk> = {}): ReviewHunk {
  return {
    id: 'test-hunk',
    header: '@@ -1,3 +1,3 @@',
    oldStart: 1,
    oldCount: 3,
    newStart: 1,
    newCount: 3,
    lines,
    rawPatch: '',
    decision: 'pending',
    ...overrides,
  };
}

describe('lineTypeFromPrefix', () => {
  it('returns added for + lines', () => {
    expect(lineTypeFromPrefix('+new line')).toBe('added');
  });
  it('returns removed for - lines', () => {
    expect(lineTypeFromPrefix('-old line')).toBe('removed');
  });
  it('returns context for space lines', () => {
    expect(lineTypeFromPrefix(' context')).toBe('context');
  });
});

describe('lineBg', () => {
  it('added uses diff-add-bg token', () => {
    expect(lineBg('added')).toBe('var(--diff-add-bg)');
  });
  it('removed uses diff-del-bg token', () => {
    expect(lineBg('removed')).toBe('var(--diff-del-bg)');
  });
  it('context is transparent', () => {
    expect(lineBg('context')).toBe('transparent');
  });
});

describe('gutterBg', () => {
  it('added uses diff-add-bg token', () => {
    expect(gutterBg('added')).toBe('var(--diff-add-bg)');
  });
  it('context uses surface-base token', () => {
    expect(gutterBg('context')).toBe('var(--surface-base)');
  });
});

describe('markerColor', () => {
  it('added is status-success', () => {
    expect(markerColor('added')).toBe('var(--status-success)');
  });
  it('removed is status-error', () => {
    expect(markerColor('removed')).toBe('var(--status-error)');
  });
  it('context is text-faint', () => {
    expect(markerColor('context')).toBe('var(--text-faint)');
  });
});

describe('buildDisplayLines', () => {
  it('added line has null leftNo and increments rightNo', () => {
    const hunk = makeHunk(['+added line'], { oldStart: 5, newStart: 10 });
    const lines = buildDisplayLines(hunk);
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe('added');
    expect(lines[0].leftNo).toBeNull();
    expect(lines[0].rightNo).toBe(10);
  });

  it('removed line has null rightNo and increments leftNo', () => {
    const hunk = makeHunk(['-removed line'], { oldStart: 3, newStart: 7 });
    const lines = buildDisplayLines(hunk);
    expect(lines[0].type).toBe('removed');
    expect(lines[0].leftNo).toBe(3);
    expect(lines[0].rightNo).toBeNull();
  });

  it('context line increments both line numbers', () => {
    const hunk = makeHunk([' context line'], { oldStart: 2, newStart: 4 });
    const lines = buildDisplayLines(hunk);
    expect(lines[0].type).toBe('context');
    expect(lines[0].leftNo).toBe(2);
    expect(lines[0].rightNo).toBe(4);
  });

  it('strips prefix character from text', () => {
    const hunk = makeHunk(['+hello world']);
    const lines = buildDisplayLines(hunk);
    expect(lines[0].text).toBe('hello world');
  });

  it('generates unique ids per line', () => {
    const hunk = makeHunk([' a', ' b', ' c'], { id: 'h1' });
    const lines = buildDisplayLines(hunk);
    const ids = lines.map((l) => l.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('h1-0');
    expect(ids[2]).toBe('h1-2');
  });

  it('increments line numbers correctly across mixed lines', () => {
    const hunk = makeHunk([' ctx', '-rem', '+add', ' ctx2'], { oldStart: 1, newStart: 1 });
    const lines = buildDisplayLines(hunk);
    // ctx: left=1, right=1
    expect(lines[0].leftNo).toBe(1);
    expect(lines[0].rightNo).toBe(1);
    // rem: left=2, right=null
    expect(lines[1].leftNo).toBe(2);
    expect(lines[1].rightNo).toBeNull();
    // add: left=null, right=2
    expect(lines[2].leftNo).toBeNull();
    expect(lines[2].rightNo).toBe(2);
    // ctx2: left=3, right=3
    expect(lines[3].leftNo).toBe(3);
    expect(lines[3].rightNo).toBe(3);
  });
});
