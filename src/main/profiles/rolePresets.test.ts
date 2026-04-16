/**
 * rolePresets.test.ts — Smoke tests for built-in profile role presets (Wave 26).
 */

import { describe, expect, it } from 'vitest';

import { BUILT_IN_PROFILES } from './rolePresets';

describe('BUILT_IN_PROFILES', () => {
  it('exports exactly four presets', () => {
    expect(BUILT_IN_PROFILES).toHaveLength(4);
  });

  it('every preset has builtIn: true', () => {
    for (const p of BUILT_IN_PROFILES) {
      expect(p.builtIn).toBe(true);
    }
  });

  it('every preset has createdAt and updatedAt of 0', () => {
    for (const p of BUILT_IN_PROFILES) {
      expect(p.createdAt).toBe(0);
      expect(p.updatedAt).toBe(0);
    }
  });

  it('every preset has a non-empty id, name, and systemPromptAddendum', () => {
    for (const p of BUILT_IN_PROFILES) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.systemPromptAddendum).toBeTruthy();
    }
  });

  it('all ids are unique', () => {
    const ids = BUILT_IN_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('Reviewer', () => {
    const reviewer = BUILT_IN_PROFILES.find((p) => p.id === 'builtin-reviewer')!;

    it('exists', () => { expect(reviewer).toBeDefined(); });
    it('uses opus model', () => { expect(reviewer.model).toBe('claude-opus-4-6'); });
    it('effort is high', () => { expect(reviewer.effort).toBe('high'); });
    it('permissionMode is plan', () => { expect(reviewer.permissionMode).toBe('plan'); });
    it('enabledTools are read-only', () => {
      expect(reviewer.enabledTools).toEqual(['Read', 'Grep', 'Glob']);
    });
  });

  describe('Scaffolder', () => {
    const scaffolder = BUILT_IN_PROFILES.find((p) => p.id === 'builtin-scaffolder')!;

    it('exists', () => { expect(scaffolder).toBeDefined(); });
    it('uses sonnet model', () => { expect(scaffolder.model).toBe('claude-sonnet-4-6'); });
    it('effort is medium', () => { expect(scaffolder.effort).toBe('medium'); });
    it('permissionMode is normal', () => { expect(scaffolder.permissionMode).toBe('normal'); });
    it('includes write tools', () => {
      expect(scaffolder.enabledTools).toContain('Write');
      expect(scaffolder.enabledTools).toContain('Edit');
      expect(scaffolder.enabledTools).toContain('Bash');
      expect(scaffolder.enabledTools).toContain('Task');
    });
  });

  describe('Explorer', () => {
    const explorer = BUILT_IN_PROFILES.find((p) => p.id === 'builtin-explorer')!;

    it('exists', () => { expect(explorer).toBeDefined(); });
    it('uses sonnet model', () => { expect(explorer.model).toBe('claude-sonnet-4-6'); });
    it('effort is low', () => { expect(explorer.effort).toBe('low'); });
    it('permissionMode is normal', () => { expect(explorer.permissionMode).toBe('normal'); });
    it('includes WebSearch', () => { expect(explorer.enabledTools).toContain('WebSearch'); });
    it('does not include write tools', () => {
      expect(explorer.enabledTools).not.toContain('Write');
      expect(explorer.enabledTools).not.toContain('Edit');
    });
  });

  describe('Debugger', () => {
    const debugger_ = BUILT_IN_PROFILES.find((p) => p.id === 'builtin-debugger')!;

    it('exists', () => { expect(debugger_).toBeDefined(); });
    it('uses opus model', () => { expect(debugger_.model).toBe('claude-opus-4-6'); });
    it('effort is high', () => { expect(debugger_.effort).toBe('high'); });
    it('permissionMode is normal', () => { expect(debugger_.permissionMode).toBe('normal'); });
    it('includes Bash and Edit but not Write', () => {
      expect(debugger_.enabledTools).toContain('Bash');
      expect(debugger_.enabledTools).toContain('Edit');
      expect(debugger_.enabledTools).not.toContain('Write');
    });
  });
});
