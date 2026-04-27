/**
 * claudeMdGeneratorLeanPrompt.test.ts
 *
 * Snapshot-style assertions: verifies required phrases, EXCLUDE list presence,
 * inline warning formatting, and empty-warnings directive.
 */

import { describe, expect, it } from 'vitest';

import type { InlineWarning } from './claudeMdGeneratorInlineWarnings';
import { buildLeanPrompt } from './claudeMdGeneratorLeanPrompt';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_INPUT = {
  dirPath: '/project/src/main',
  relPath: 'src/main',
  codeSamples: '',
  inlineWarnings: [] as InlineWarning[],
  targetMaxLines: 150,
};

const SAMPLE_WARNINGS: InlineWarning[] = [
  { file: 'foo.ts', line: 12, kind: 'NOTE', text: 'load-bearing pattern, do not remove' },
  { file: 'bar.ts', line: 5, kind: 'WARNING', text: 'ordering constraint here' },
  { file: 'baz.ts', line: 99, kind: 'ESLINT_REASON', text: 'path from directory listing' },
];

// ---------------------------------------------------------------------------
// Required phrase checks
// ---------------------------------------------------------------------------

describe('buildLeanPrompt — required phrases', () => {
  it('contains "OMIT rather than speculate" verbatim', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt).toContain('OMIT rather than speculate');
  });

  it('contains the EXCLUDE section header', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt).toContain('EXCLUDE');
  });

  it('contains the INCLUDE section header', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt).toContain('INCLUDE');
  });

  it('mentions file-role tables in the EXCLUDE list', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt).toContain('File-role tables');
  });

  it('mentions subdirectory indexes in the EXCLUDE list', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt).toContain('Subdirectory indexes');
  });

  it('mentions import/export dependency lists in the EXCLUDE list', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt).toContain('Import/export dependency lists');
  });

  it('mentions architecture flow diagrams in the EXCLUDE list', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt).toContain('Architecture flow diagrams');
  });

  it('includes the target size directive with the provided line count', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt).toContain('under 150 lines');
  });

  it('respects a custom targetMaxLines value', () => {
    const prompt = buildLeanPrompt({ ...BASE_INPUT, targetMaxLines: 200 });
    expect(prompt).toContain('under 200 lines');
  });

  it('includes the directory relPath', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt).toContain('src/main/');
  });

  it('includes output rules (no preamble prose directive)', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt).toContain('Output rules');
    expect(prompt).toContain('FIRST character must be');
  });
});

// ---------------------------------------------------------------------------
// Inline warnings formatting
// ---------------------------------------------------------------------------

describe('buildLeanPrompt — inline warnings', () => {
  it('formats inline warnings into the prompt when present', () => {
    const prompt = buildLeanPrompt({ ...BASE_INPUT, inlineWarnings: SAMPLE_WARNINGS });
    expect(prompt).toContain('[NOTE] foo.ts:12');
    expect(prompt).toContain('[WARNING] bar.ts:5');
    expect(prompt).toContain('[ESLINT_REASON] baz.ts:99');
  });

  it('includes warning text in the prompt', () => {
    const prompt = buildLeanPrompt({ ...BASE_INPUT, inlineWarnings: SAMPLE_WARNINGS });
    expect(prompt).toContain('load-bearing pattern, do not remove');
    expect(prompt).toContain('ordering constraint here');
  });

  it('instructs model to use warnings as supporting evidence', () => {
    const prompt = buildLeanPrompt({ ...BASE_INPUT, inlineWarnings: SAMPLE_WARNINGS });
    expect(prompt).toContain('supporting evidence');
  });

  it('when no warnings, instructs model to leave Gotchas empty rather than invent', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt).toContain('Leave "## Gotchas" empty');
    expect(prompt).not.toContain('[NOTE]');
    expect(prompt).not.toContain('[WARNING]');
  });

  it('does not include empty-warnings directive when warnings are present', () => {
    const prompt = buildLeanPrompt({ ...BASE_INPUT, inlineWarnings: SAMPLE_WARNINGS });
    expect(prompt).not.toContain('Leave "## Gotchas" empty');
  });
});

// ---------------------------------------------------------------------------
// Code samples
// ---------------------------------------------------------------------------

describe('buildLeanPrompt — code samples', () => {
  it('includes code samples in the prompt when provided', () => {
    const prompt = buildLeanPrompt({ ...BASE_INPUT, codeSamples: 'export const x = 1;' });
    expect(prompt).toContain('Code samples');
    expect(prompt).toContain('export const x = 1;');
  });

  it('omits the code samples section when empty', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt).not.toContain('Code samples');
  });
});

// ---------------------------------------------------------------------------
// Shape / length
// ---------------------------------------------------------------------------

describe('buildLeanPrompt — output shape', () => {
  it('prompt itself is non-empty', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('prompt starts with a sentence describing the task', () => {
    const prompt = buildLeanPrompt(BASE_INPUT);
    expect(prompt.startsWith('You are generating')).toBe(true);
  });
});
