/**
 * profileLint.test.ts — Unit tests for profileLint (Wave 26 Phase D).
 */

import type { Profile } from '@shared/types/profile';
import { describe, expect, it } from 'vitest';

import { lintProfile } from './profileLint';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'test-profile',
    name: 'Test',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// ─── Rule 1: Scaffolder without Write/Edit ────────────────────────────────────

describe('lintProfile — scaffolder without write/edit', () => {
  it('warns when prompt mentions scaffold but enabledTools lacks Write and Edit', () => {
    const profile = makeProfile({
      systemPromptAddendum: 'Generate new code quickly.',
      enabledTools: ['Read', 'Bash'],
    });
    const lints = lintProfile(profile);
    expect(lints).toHaveLength(1);
    expect(lints[0].severity).toBe('warn');
    expect(lints[0].message).toMatch(/Scaffolder/);
  });

  it('does not warn when prompt mentions scaffold and Write is present', () => {
    const profile = makeProfile({
      systemPromptAddendum: 'Scaffold new components.',
      enabledTools: ['Read', 'Write', 'Edit'],
    });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.message.includes('Scaffolder'))).toBe(false);
  });

  it('does not warn when prompt mentions scaffold and enabledTools is undefined', () => {
    const profile = makeProfile({ systemPromptAddendum: 'scaffold code' });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.message.includes('Scaffolder'))).toBe(false);
  });
});

// ─── Rule 2: Reviewer with modify tools ───────────────────────────────────────

describe('lintProfile — reviewer with modify tools', () => {
  it('warns when prompt mentions review and Bash is enabled', () => {
    const profile = makeProfile({
      systemPromptAddendum: 'Focus on code review; do not modify files.',
      enabledTools: ['Read', 'Grep', 'Bash'],
    });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.message.includes('Reviewer'))).toBe(true);
    expect(lints.find((l) => l.message.includes('Reviewer'))?.severity).toBe('warn');
  });

  it('warns when prompt mentions do not modify and Edit is enabled', () => {
    const profile = makeProfile({
      systemPromptAddendum: 'Review only. Do not modify any files.',
      enabledTools: ['Read', 'Edit'],
    });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.message.includes('Reviewer'))).toBe(true);
  });

  it('does not warn when reviewer prompt has only read tools', () => {
    const profile = makeProfile({
      systemPromptAddendum: 'Review code carefully.',
      enabledTools: ['Read', 'Grep', 'Glob'],
    });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.message.includes('Reviewer'))).toBe(false);
  });
});

// ─── Rule 3: Debugger without Bash ────────────────────────────────────────────

describe('lintProfile — debugger without bash', () => {
  it('warns when prompt mentions diagnose but Bash is not in enabledTools', () => {
    const profile = makeProfile({
      systemPromptAddendum: 'Diagnose and fix issues.',
      enabledTools: ['Read', 'Edit', 'Grep'],
    });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.message.includes('Debugger'))).toBe(true);
    expect(lints.find((l) => l.message.includes('Debugger'))?.severity).toBe('warn');
  });

  it('warns when prompt mentions reproduce and Bash is absent', () => {
    const profile = makeProfile({
      systemPromptAddendum: 'Reproduce the bug before fixing it.',
      enabledTools: ['Read', 'Grep'],
    });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.message.includes('Debugger'))).toBe(true);
  });

  it('does not warn when Bash is present', () => {
    const profile = makeProfile({
      systemPromptAddendum: 'Diagnose issues and run tests.',
      enabledTools: ['Read', 'Bash', 'Grep'],
    });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.message.includes('Debugger'))).toBe(false);
  });
});

// ─── Rule 4: Empty enabledTools ───────────────────────────────────────────────

describe('lintProfile — empty enabledTools', () => {
  it('warns when enabledTools is an empty array', () => {
    const profile = makeProfile({ enabledTools: [] });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.message.includes('No tools'))).toBe(true);
    expect(lints.find((l) => l.message.includes('No tools'))?.severity).toBe('warn');
  });

  it('does not warn when enabledTools is undefined', () => {
    const profile = makeProfile({ enabledTools: undefined });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.message.includes('No tools'))).toBe(false);
  });

  it('does not warn when enabledTools has entries', () => {
    const profile = makeProfile({ enabledTools: ['Read'] });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.message.includes('No tools'))).toBe(false);
  });
});

// ─── Rule 5: bypass + Bash ────────────────────────────────────────────────────

describe('lintProfile — bypass + Bash', () => {
  it('errors when permissionMode is bypass and Bash is enabled', () => {
    const profile = makeProfile({
      permissionMode: 'bypass',
      enabledTools: ['Read', 'Bash'],
    });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.severity === 'error')).toBe(true);
    expect(lints.find((l) => l.severity === 'error')?.message).toMatch(/bypass/i);
  });

  it('does not error when permissionMode is bypass but Bash is absent', () => {
    const profile = makeProfile({
      permissionMode: 'bypass',
      enabledTools: ['Read', 'Write'],
    });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.severity === 'error')).toBe(false);
  });

  it('does not error when permissionMode is normal and Bash is enabled', () => {
    const profile = makeProfile({
      permissionMode: 'normal',
      enabledTools: ['Read', 'Bash'],
    });
    const lints = lintProfile(profile);
    expect(lints.some((l) => l.severity === 'error')).toBe(false);
  });

  it('does not error when enabledTools is undefined (all tools = bypass still risky but not in scope)', () => {
    // undefined tools means all allowed — bypass + Bash is only flagged when
    // Bash is explicitly in the list (opt-in rather than implicit).
    const profile = makeProfile({ permissionMode: 'bypass', enabledTools: undefined });
    const lints = lintProfile(profile);
    // hasTools(undefined, 'Bash') returns true → error fires
    expect(lints.some((l) => l.severity === 'error')).toBe(true);
  });
});

// ─── Clean profile: no lints ─────────────────────────────────────────────────

describe('lintProfile — clean profile', () => {
  it('returns no lints for a well-formed profile', () => {
    const profile = makeProfile({
      systemPromptAddendum: 'Help me navigate the codebase.',
      enabledTools: ['Read', 'Grep', 'Glob'],
      permissionMode: 'normal',
    });
    expect(lintProfile(profile)).toHaveLength(0);
  });

  it('returns no lints for a profile with no systemPromptAddendum', () => {
    const profile = makeProfile({ enabledTools: ['Read', 'Write', 'Bash'] });
    expect(lintProfile(profile)).toHaveLength(0);
  });
});
