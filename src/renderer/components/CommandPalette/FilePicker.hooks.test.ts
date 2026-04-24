import { describe, expect, it } from 'vitest';

import { getEmptyLabel, getFooterHints } from './FilePicker.hooks';

describe('getFooterHints', () => {
  it('returns base hints when no files', () => {
    const hints = getFooterHints(0, 'open');
    expect(hints).toEqual(['↑↓ navigate', '↵ open', 'esc close']);
  });

  it('appends file count when files exist', () => {
    const hints = getFooterHints(42, 'open');
    expect(hints).toContain('42 files');
  });
});

describe('getEmptyLabel', () => {
  it('returns no project message when root is null', () => {
    expect(getEmptyLabel(null, false, '')).toBe('No project open');
  });

  it('returns scanning message when indexing', () => {
    expect(getEmptyLabel('/some/root', true, '')).toBe('Scanning project files...');
  });

  it('returns no match message when query present', () => {
    expect(getEmptyLabel('/some/root', false, 'foo')).toBe('No files matched');
  });

  it('returns no files message when empty query', () => {
    expect(getEmptyLabel('/some/root', false, '')).toBe('No files found');
  });
});
