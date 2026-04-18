/**
 * awesomeEntries.test.ts — Smoke tests for the ALL_ENTRIES seed data.
 *
 * Wave 37 Phase E.
 */

import { describe, expect, it } from 'vitest';

import { ALL_ENTRIES } from './awesomeEntries';

describe('ALL_ENTRIES', () => {
  it('has at least 15 entries', () => {
    expect(ALL_ENTRIES.length).toBeGreaterThanOrEqual(15);
  });

  it('every entry has required string fields', () => {
    for (const e of ALL_ENTRIES) {
      expect(e.id, `${e.id}: id`).toBeTruthy();
      expect(e.category, `${e.id}: category`).toBeTruthy();
      expect(e.title, `${e.id}: title`).toBeTruthy();
      expect(e.description, `${e.id}: description`).toBeTruthy();
      expect(e.content, `${e.id}: content`).toBeTruthy();
    }
  });

  it('all ids are unique', () => {
    const ids = ALL_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers all five categories', () => {
    const cats = new Set(ALL_ENTRIES.map((e) => e.category));
    expect(cats).toContain('hooks');
    expect(cats).toContain('slash-commands');
    expect(cats).toContain('mcp-configs');
    expect(cats).toContain('rules');
    expect(cats).toContain('skills');
  });

  it('content never contains a real-looking secret token', () => {
    for (const e of ALL_ENTRIES) {
      expect(e.content, `${e.id}: no real sk- key`).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
      expect(e.content, `${e.id}: no real ghp_ token`).not.toMatch(/ghp_[A-Za-z0-9]{36}/);
    }
  });

  it('installAction kind is rule | skill | hook when present', () => {
    const valid = ['rule', 'skill', 'hook'];
    for (const e of ALL_ENTRIES) {
      if (e.installAction) {
        expect(valid, `${e.id}: kind`).toContain(e.installAction.kind);
      }
    }
  });
});
