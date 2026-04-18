/**
 * awesomeData.test.ts — Validates shape and coverage of AWESOME_ENTRIES.
 *
 * Wave 37 Phase E.
 */

import { describe, expect, it } from 'vitest';

import {
  AWESOME_CATEGORIES,
  AWESOME_ENTRIES,
  type AwesomeCategory,
  type AwesomeEntry,
} from './awesomeData';

// ── Shape validation ──────────────────────────────────────────────────────────

describe('AWESOME_ENTRIES shape', () => {
  it('has at least 15 entries', () => {
    expect(AWESOME_ENTRIES.length).toBeGreaterThanOrEqual(15);
  });

  it('every entry has required fields', () => {
    for (const entry of AWESOME_ENTRIES) {
      expect(entry.id, `${entry.id}: id`).toBeTruthy();
      expect(entry.category, `${entry.id}: category`).toBeTruthy();
      expect(entry.title, `${entry.id}: title`).toBeTruthy();
      expect(entry.description, `${entry.id}: description`).toBeTruthy();
      expect(entry.content, `${entry.id}: content`).toBeTruthy();
    }
  });

  it('every entry id is unique', () => {
    const ids = AWESOME_ENTRIES.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every category is one of the known AwesomeCategory values', () => {
    const valid: AwesomeCategory[] = ['hooks', 'slash-commands', 'mcp-configs', 'rules', 'skills'];
    for (const entry of AWESOME_ENTRIES) {
      expect(valid, `${entry.id}: unknown category`).toContain(entry.category);
    }
  });

  it('installAction kind is rule | skill | hook when present', () => {
    const validKinds = ['rule', 'skill', 'hook'];
    for (const entry of AWESOME_ENTRIES) {
      if (entry.installAction) {
        expect(
          validKinds,
          `${entry.id}: invalid installAction.kind`,
        ).toContain(entry.installAction.kind);
        expect(
          entry.installAction.payload,
          `${entry.id}: payload must be an object`,
        ).toBeDefined();
      }
    }
  });

  it('content never contains real secrets or credential values', () => {
    for (const entry of AWESOME_ENTRIES) {
      // Must not contain Bearer tokens, sk- real keys, etc.
      expect(entry.content, `${entry.id}: content`).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
      // Placeholders like <your-pat> are fine; real-looking tokens are not.
      expect(entry.content, `${entry.id}: content`).not.toMatch(/ghp_[A-Za-z0-9]{36}/);
    }
  });
});

// ── Category coverage ─────────────────────────────────────────────────────────

describe('category coverage', () => {
  const entriesByCategory = (cat: AwesomeCategory): AwesomeEntry[] =>
    AWESOME_ENTRIES.filter((e) => e.category === cat) as AwesomeEntry[];

  it('has at least 1 hooks entry', () => {
    expect(entriesByCategory('hooks').length).toBeGreaterThanOrEqual(1);
  });

  it('has at least 1 slash-commands entry', () => {
    expect(entriesByCategory('slash-commands').length).toBeGreaterThanOrEqual(1);
  });

  it('has at least 1 mcp-configs entry', () => {
    expect(entriesByCategory('mcp-configs').length).toBeGreaterThanOrEqual(1);
  });

  it('has at least 1 rules entry', () => {
    expect(entriesByCategory('rules').length).toBeGreaterThanOrEqual(1);
  });

  it('has at least 1 skills entry', () => {
    expect(entriesByCategory('skills').length).toBeGreaterThanOrEqual(1);
  });
});

// ── AWESOME_CATEGORIES list ───────────────────────────────────────────────────

describe('AWESOME_CATEGORIES', () => {
  it('contains all five categories', () => {
    expect(AWESOME_CATEGORIES).toContain('hooks');
    expect(AWESOME_CATEGORIES).toContain('slash-commands');
    expect(AWESOME_CATEGORIES).toContain('mcp-configs');
    expect(AWESOME_CATEGORIES).toContain('rules');
    expect(AWESOME_CATEGORIES).toContain('skills');
  });

  it('has no duplicates', () => {
    expect(new Set(AWESOME_CATEGORIES).size).toBe(AWESOME_CATEGORIES.length);
  });
});
