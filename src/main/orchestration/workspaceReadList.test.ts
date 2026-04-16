/**
 * workspaceReadList.test.ts — Unit tests for the workspace read-list module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const configStore = new Map<string, unknown>();

vi.mock('../config', () => ({
  getConfigValue: (key: string) => (key === 'workspaceReadLists' ? configStore.get(key) ?? {} : undefined),
  setConfigValue: (key: string, value: unknown) => { configStore.set(key, value); },
}));

const addedPins: Array<{ sessionId: string; item: unknown }> = [];
const existingPins: Array<{ source: string; dismissed?: boolean }> = [];

vi.mock('./pinnedContextStore', () => ({
  getPinnedContextStore: () => ({
    list: (sessionId: string, opts: unknown) => { void sessionId; void opts; return existingPins; },
    add: (sessionId: string, item: unknown) => { addedPins.push({ sessionId, item }); return item; },
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  addToReadList,
  applyToSession,
  getReadList,
  removeFromReadList,
} from './workspaceReadList';

// ─── Tests ────────────────────────────────────────────────────────────────────

const ROOT = '/projects/my-app';
const FILE_A = '/projects/my-app/src/main.ts';
const FILE_B = '/projects/my-app/src/utils.ts';

beforeEach(() => {
  configStore.delete('workspaceReadLists');
  addedPins.length = 0;
  existingPins.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getReadList', () => {
  it('returns empty array when nothing stored', () => {
    expect(getReadList(ROOT)).toEqual([]);
  });

  it('returns stored list for project root', () => {
    configStore.set('workspaceReadLists', { [ROOT]: [FILE_A] });
    expect(getReadList(ROOT)).toEqual([FILE_A]);
  });

  it('returns empty array for unknown root even when map has other entries', () => {
    configStore.set('workspaceReadLists', { '/other': [FILE_A] });
    expect(getReadList(ROOT)).toEqual([]);
  });
});

describe('addToReadList', () => {
  it('adds a file and returns the new list', () => {
    const result = addToReadList(ROOT, FILE_A);
    expect(result).toEqual([FILE_A]);
    expect(getReadList(ROOT)).toEqual([FILE_A]);
  });

  it('adds a second file preserving the first', () => {
    addToReadList(ROOT, FILE_A);
    const result = addToReadList(ROOT, FILE_B);
    expect(result).toEqual([FILE_A, FILE_B]);
  });

  it('is idempotent — duplicate add returns same list', () => {
    addToReadList(ROOT, FILE_A);
    const result = addToReadList(ROOT, FILE_A);
    expect(result).toEqual([FILE_A]);
  });

  it('does not affect other roots', () => {
    addToReadList(ROOT, FILE_A);
    expect(getReadList('/other')).toEqual([]);
  });
});

describe('removeFromReadList', () => {
  it('removes a file from the list', () => {
    addToReadList(ROOT, FILE_A);
    addToReadList(ROOT, FILE_B);
    const result = removeFromReadList(ROOT, FILE_A);
    expect(result).toEqual([FILE_B]);
  });

  it('is a no-op when file is not in the list', () => {
    addToReadList(ROOT, FILE_A);
    const result = removeFromReadList(ROOT, FILE_B);
    expect(result).toEqual([FILE_A]);
  });

  it('returns empty array when removing last entry', () => {
    addToReadList(ROOT, FILE_A);
    const result = removeFromReadList(ROOT, FILE_A);
    expect(result).toEqual([]);
  });
});

describe('applyToSession', () => {
  it('adds stub pins for all files in the read-list', () => {
    addToReadList(ROOT, FILE_A);
    addToReadList(ROOT, FILE_B);
    applyToSession('session-1', ROOT);
    expect(addedPins).toHaveLength(2);
    expect(addedPins[0]).toMatchObject({
      sessionId: 'session-1',
      item: { type: 'user-file', source: FILE_A, title: 'main.ts', content: '(not yet loaded)', tokens: 0 },
    });
    expect(addedPins[1]).toMatchObject({
      sessionId: 'session-1',
      item: { type: 'user-file', source: FILE_B, title: 'utils.ts' },
    });
  });

  it('skips files already pinned in the session', () => {
    existingPins.push({ source: FILE_A });
    addToReadList(ROOT, FILE_A);
    addToReadList(ROOT, FILE_B);
    applyToSession('session-1', ROOT);
    expect(addedPins).toHaveLength(1);
    expect(addedPins[0]).toMatchObject({ item: { source: FILE_B } });
  });

  it('does nothing when read-list is empty', () => {
    applyToSession('session-1', ROOT);
    expect(addedPins).toHaveLength(0);
  });
});
