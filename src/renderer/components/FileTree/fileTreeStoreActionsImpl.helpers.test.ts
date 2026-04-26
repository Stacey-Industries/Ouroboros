/**
 * Smoke tests for fileTreeStoreActionsImpl.helpers — buildFileTreeActions group builders.
 *
 * Uses a minimal mutable state object and a plain `set` spy (no immer, no zustand)
 * to verify each action group mutates the expected fields.
 */
import { enableMapSet, produce } from 'immer';
import { describe, expect, it } from 'vitest';

import type { FileTreeState } from './fileTreeStore';
import { buildFileTreeActions } from './fileTreeStoreActionsImpl.helpers';

enableMapSet();

function makeState(overrides: Partial<FileTreeState> = {}): FileTreeState {
  return {
    roots: new Map(),
    loadedDirs: new Set(),
    gitStatus: new Map(),
    selectedPaths: new Set(),
    focusedPath: null,
    lastSelectedPath: null,
    expandedPaths: new Set(),
    searchQuery: '',
    filter: 'all',
    sortMode: 'name',
    editState: null,
    bookmarks: [],
    diagnostics: new Map(),
    dirtyFiles: new Set(),
    nestingEnabled: false,
    nestExpandedPaths: new Set(),
    ...overrides,
  } as FileTreeState;
}

function makeActions(state: { current: FileTreeState }) {
  const set = (updater: (s: FileTreeState) => void) => {
    state.current = produce(state.current, updater);
  };
  return buildFileTreeActions(set as Parameters<typeof buildFileTreeActions>[0]);
}

// ─── Expansion actions ────────────────────────────────────────────────────────

describe('buildExpansionActions (via buildFileTreeActions)', () => {
  it('toggleExpand adds path when absent, removes when present', () => {
    const s = { current: makeState() };
    const actions = makeActions(s);
    actions.toggleExpand('/a');
    expect(s.current.expandedPaths.has('/a')).toBe(true);
    actions.toggleExpand('/a');
    expect(s.current.expandedPaths.has('/a')).toBe(false);
  });

  it('ensureExpanded always adds the path', () => {
    const s = { current: makeState() };
    const actions = makeActions(s);
    actions.ensureExpanded('/b');
    actions.ensureExpanded('/b');
    expect(s.current.expandedPaths.has('/b')).toBe(true);
  });

  it('toggleNesting flips nestingEnabled', () => {
    const s = { current: makeState({ nestingEnabled: false }) };
    const actions = makeActions(s);
    actions.toggleNesting();
    expect(s.current.nestingEnabled).toBe(true);
    actions.toggleNesting();
    expect(s.current.nestingEnabled).toBe(false);
  });

  it('toggleNestExpansion toggles the path in nestExpandedPaths', () => {
    const s = { current: makeState() };
    const actions = makeActions(s);
    actions.toggleNestExpansion('/c');
    expect(s.current.nestExpandedPaths.has('/c')).toBe(true);
    actions.toggleNestExpansion('/c');
    expect(s.current.nestExpandedPaths.has('/c')).toBe(false);
  });
});

// ─── Selection actions ────────────────────────────────────────────────────────

describe('buildSelectionActions (via buildFileTreeActions)', () => {
  it('setFocus sets focusedPath', () => {
    const s = { current: makeState() };
    const actions = makeActions(s);
    actions.setFocus('/d');
    expect(s.current.focusedPath).toBe('/d');
    actions.setFocus(null);
    expect(s.current.focusedPath).toBeNull();
  });

  it('clearSelection empties selectedPaths', () => {
    const s = { current: makeState({ selectedPaths: new Set(['/e', '/f']) }) };
    const actions = makeActions(s);
    actions.clearSelection();
    expect(s.current.selectedPaths.size).toBe(0);
  });

  it('toggleSelection adds then removes a path', () => {
    const s = { current: makeState() };
    const actions = makeActions(s);
    actions.toggleSelection('/g');
    expect(s.current.selectedPaths.has('/g')).toBe(true);
    actions.toggleSelection('/g');
    expect(s.current.selectedPaths.has('/g')).toBe(false);
  });

  it('select without modifiers replaces selection', () => {
    const s = { current: makeState({ selectedPaths: new Set(['/h']) }) };
    const actions = makeActions(s);
    actions.select('/i', { ctrl: false, shift: false });
    expect(s.current.selectedPaths.has('/h')).toBe(false);
    expect(s.current.selectedPaths.has('/i')).toBe(true);
  });

  it('select with ctrl toggles the path without clearing others', () => {
    const s = { current: makeState({ selectedPaths: new Set(['/h']) }) };
    const actions = makeActions(s);
    actions.select('/i', { ctrl: true, shift: false });
    expect(s.current.selectedPaths.has('/h')).toBe(true);
    expect(s.current.selectedPaths.has('/i')).toBe(true);
  });
});

// ─── Data actions ─────────────────────────────────────────────────────────────

describe('buildDataActions (via buildFileTreeActions)', () => {
  it('setSearchQuery updates searchQuery', () => {
    const s = { current: makeState() };
    const actions = makeActions(s);
    actions.setSearchQuery('hello');
    expect(s.current.searchQuery).toBe('hello');
  });

  it('setFilter updates filter', () => {
    const s = { current: makeState() };
    const actions = makeActions(s);
    actions.setFilter('modified');
    expect(s.current.filter).toBe('modified');
  });

  it('setSortMode updates sortMode', () => {
    const s = { current: makeState() };
    const actions = makeActions(s);
    actions.setSortMode('type');
    expect(s.current.sortMode).toBe('type');
  });

  it('toggleBookmark adds then removes bookmark', () => {
    const s = { current: makeState() };
    const actions = makeActions(s);
    actions.toggleBookmark('/j');
    expect(s.current.bookmarks).toContain('/j');
    actions.toggleBookmark('/j');
    expect(s.current.bookmarks).not.toContain('/j');
  });

  it('setBookmarks replaces bookmark list', () => {
    const s = { current: makeState({ bookmarks: ['/old'] }) };
    const actions = makeActions(s);
    actions.setBookmarks(['/new1', '/new2']);
    expect(s.current.bookmarks).toEqual(['/new1', '/new2']);
  });

  it('markDirLoaded adds to loadedDirs', () => {
    const s = { current: makeState() };
    const actions = makeActions(s);
    actions.markDirLoaded('/dir');
    expect(s.current.loadedDirs.has('/dir')).toBe(true);
  });

  it('clearLoadedDirs empties loadedDirs', () => {
    const s = { current: makeState({ loadedDirs: new Set(['/dir']) }) };
    const actions = makeActions(s);
    actions.clearLoadedDirs();
    expect(s.current.loadedDirs.size).toBe(0);
  });

  it('markDirty / markClean round-trips dirtyFiles', () => {
    const s = { current: makeState() };
    const actions = makeActions(s);
    actions.markDirty('/file.ts');
    expect(s.current.dirtyFiles.has('/file.ts')).toBe(true);
    actions.markClean('/file.ts');
    expect(s.current.dirtyFiles.has('/file.ts')).toBe(false);
  });
});
