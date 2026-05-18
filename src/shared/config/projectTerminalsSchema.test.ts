/**
 * projectTerminalsSchema.test.ts — Wave 94 Phase B
 *
 * Contracts verified:
 *  - SessionTabRefSchema: accepts valid input; rejects missing id/title.
 *  - ProjectTerminalStateSchema: accepts valid input; applies defaults for
 *    missing optional fields.
 *  - parseTerminalSessionsPerProject: returns empty record on invalid input;
 *    returns parsed map on valid input.
 *  - readProjectState: returns empty state when project absent from map;
 *    returns parsed state when project present; falls back on invalid entry.
 */

import { describe, expect, it } from 'vitest';

import {
  EMPTY_PROJECT_TERMINAL_STATE,
  parseTerminalSessionsPerProject,
  ProjectTerminalStateSchema,
  readProjectState,
  SessionTabRefSchema,
} from './projectTerminalsSchema';

// ---------------------------------------------------------------------------
// SessionTabRefSchema
// ---------------------------------------------------------------------------

describe('SessionTabRefSchema', () => {
  it('accepts a valid session tab ref with all fields', () => {
    const result = SessionTabRefSchema.safeParse({ id: 'abc', title: 'bash', isClaude: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('abc');
      expect(result.data.isClaude).toBe(false);
    }
  });

  it('applies default isClaude=false when field is absent', () => {
    const result = SessionTabRefSchema.safeParse({ id: 'abc', title: 'bash' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isClaude).toBe(false);
  });

  it('rejects when id is missing', () => {
    const result = SessionTabRefSchema.safeParse({ title: 'bash' });
    expect(result.success).toBe(false);
  });

  it('rejects when title is missing', () => {
    const result = SessionTabRefSchema.safeParse({ id: 'abc' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ProjectTerminalStateSchema
// ---------------------------------------------------------------------------

describe('ProjectTerminalStateSchema', () => {
  it('accepts a fully-populated valid state', () => {
    const input = {
      primary: [{ id: 's1', title: 'bash', isClaude: false }],
      secondary: [],
      activeSessionPerSlot: { primary: 's1', secondary: null },
    };
    const result = ProjectTerminalStateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.primary).toHaveLength(1);
      expect(result.data.activeSessionPerSlot.primary).toBe('s1');
    }
  });

  it('applies defaults for missing primary/secondary/activeSessionPerSlot', () => {
    const result = ProjectTerminalStateSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.primary).toEqual([]);
      expect(result.data.secondary).toEqual([]);
      expect(result.data.activeSessionPerSlot).toEqual({ primary: null, secondary: null });
    }
  });

  it('rejects a session ref with an invalid entry inside primary array', () => {
    const input = { primary: [{ id: 123, title: 'bash' }] }; // id should be string
    const result = ProjectTerminalStateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseTerminalSessionsPerProject
// ---------------------------------------------------------------------------

describe('parseTerminalSessionsPerProject', () => {
  it('returns empty record when input is null', () => {
    expect(parseTerminalSessionsPerProject(null)).toEqual({});
  });

  it('returns empty record when input is a string', () => {
    expect(parseTerminalSessionsPerProject('garbage')).toEqual({});
  });

  it('returns empty record when a project entry has invalid shape', () => {
    // The record validator coerces — an invalid nested entry makes the whole record fail.
    const result = parseTerminalSessionsPerProject({ '/project': 'not-an-object' });
    expect(result).toEqual({});
  });

  it('returns parsed map for valid input', () => {
    const valid = {
      '/project/a': {
        primary: [{ id: 's1', title: 'bash', isClaude: false }],
        secondary: [],
        activeSessionPerSlot: { primary: 's1', secondary: null },
      },
    };
    const result = parseTerminalSessionsPerProject(valid);
    expect(result['/project/a']).toBeDefined();
    expect(result['/project/a'].primary[0].id).toBe('s1');
  });

  it('returns parsed map when project entry omits optional fields (uses defaults)', () => {
    const partial = { '/project/b': {} };
    const result = parseTerminalSessionsPerProject(partial);
    expect(result['/project/b']).toBeDefined();
    expect(result['/project/b'].primary).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// readProjectState
// ---------------------------------------------------------------------------

describe('readProjectState', () => {
  it('returns EMPTY_PROJECT_TERMINAL_STATE when project path is not in map', () => {
    const state = readProjectState({}, '/nonexistent');
    expect(state).toEqual(EMPTY_PROJECT_TERMINAL_STATE);
  });

  it('returns the project state when project path exists', () => {
    const map = {
      '/project/a': {
        primary: [{ id: 's1', title: 'bash', isClaude: true }],
        secondary: [],
        activeSessionPerSlot: { primary: 's1', secondary: null },
      },
    };
    const state = readProjectState(map, '/project/a');
    expect(state.primary[0].id).toBe('s1');
    expect(state.activeSessionPerSlot.primary).toBe('s1');
  });

  it('returns empty state when stored entry fails validation', () => {
    // Force an invalid entry (bypass TypeScript via unknown cast)
    const map = { '/project/bad': 'invalid' } as unknown as Record<string, unknown>;
    const state = readProjectState(map as Parameters<typeof readProjectState>[0], '/project/bad');
    expect(state).toEqual(EMPTY_PROJECT_TERMINAL_STATE);
  });

  it('returns a fresh copy each call (not a shared reference)', () => {
    const state1 = readProjectState({}, '/p');
    const state2 = readProjectState({}, '/p');
    state1.primary.push({ id: 'x', title: 'x', isClaude: false });
    expect(state2.primary).toHaveLength(0);
  });
});
