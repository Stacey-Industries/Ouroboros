import { describe, expect, it } from 'vitest';

import type { TaskRequestContextSelection } from '../../types/electron';
import {
  normalizeSelection,
  toggleExcludedSelection,
  toggleIncludedSelection,
  togglePinnedSelection,
  updateSelectionForIntent,
} from './useContextSelectionModel';

function createSelection(overrides: Partial<TaskRequestContextSelection> = {}): TaskRequestContextSelection {
  return {
    userSelectedFiles: [],
    pinnedFiles: [],
    includedFiles: [],
    excludedFiles: [],
    ...overrides,
  };
}

describe('useContextSelectionModel helpers', () => {
  it('normalizes slash styles, trims values, and removes duplicates', () => {
    expect(normalizeSelection({
      pinnedFiles: ['src\\one.ts', 'src/one.ts', '  src/two.ts  ', '', '   '],
      includedFiles: ['README.md', 'README.md'],
    })).toEqual({
      userSelectedFiles: [],
      pinnedFiles: ['src/one.ts', 'src/two.ts'],
      includedFiles: ['README.md'],
      excludedFiles: [],
    });
  });

  it('applies picker intents with conflict resolution', () => {
    const selection = createSelection({
      pinnedFiles: ['src/pinned.ts'],
      includedFiles: ['src/included.ts'],
      excludedFiles: ['src/excluded.ts'],
    });

    expect(updateSelectionForIntent(selection, 'pin', 'src/excluded.ts')).toEqual({
      userSelectedFiles: [],
      pinnedFiles: ['src/pinned.ts', 'src/excluded.ts'],
      includedFiles: ['src/included.ts'],
      excludedFiles: [],
    });

    expect(updateSelectionForIntent(selection, 'include', 'src/excluded.ts')).toEqual({
      userSelectedFiles: [],
      pinnedFiles: ['src/pinned.ts'],
      includedFiles: ['src/included.ts', 'src/excluded.ts'],
      excludedFiles: [],
    });

    expect(updateSelectionForIntent(selection, 'exclude', 'src/included.ts')).toEqual({
      userSelectedFiles: [],
      pinnedFiles: ['src/pinned.ts'],
      includedFiles: [],
      excludedFiles: ['src/excluded.ts', 'src/included.ts'],
    });
  });

  it('toggles pinned and included files while clearing exclusions for the same path', () => {
    const selection = createSelection({
      excludedFiles: ['src/context.ts'],
    });

    expect(togglePinnedSelection(selection, 'src\\context.ts')).toEqual({
      userSelectedFiles: [],
      pinnedFiles: ['src/context.ts'],
      includedFiles: [],
      excludedFiles: [],
    });

    expect(toggleIncludedSelection(selection, 'src\\context.ts')).toEqual({
      userSelectedFiles: [],
      pinnedFiles: [],
      includedFiles: ['src/context.ts'],
      excludedFiles: [],
    });
  });

  it('toggles exclusions and removes conflicting pin/include state only while excluded', () => {
    const selection = createSelection({
      pinnedFiles: ['src/context.ts'],
      includedFiles: ['src/context.ts'],
    });

    const excluded = toggleExcludedSelection(selection, 'src\\context.ts');
    expect(excluded).toEqual({
      userSelectedFiles: [],
      pinnedFiles: [],
      includedFiles: [],
      excludedFiles: ['src/context.ts'],
    });

    expect(toggleExcludedSelection(excluded, 'src/context.ts')).toEqual({
      userSelectedFiles: [],
      pinnedFiles: [],
      includedFiles: [],
      excludedFiles: [],
    });
  });
});
