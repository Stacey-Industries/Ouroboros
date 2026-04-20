/**
 * settingsEntriesAgent.test.ts — Smoke tests for the agent/general entry arrays
 * exported from settingsEntriesAgent.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  ACCOUNTS_ENTRIES,
  AGENT_ENTRIES,
  APPEARANCE_ENTRIES,
  FONT_ENTRIES,
  TERMINAL_ENTRIES,
} from './settingsEntriesAgent';

describe('ACCOUNTS_ENTRIES', () => {
  it('is non-empty and every entry has a label and section', () => {
    expect(ACCOUNTS_ENTRIES.length).toBeGreaterThan(0);
    for (const e of ACCOUNTS_ENTRIES) {
      expect(typeof e.label).toBe('string');
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.section).toBe('accounts');
      expect(e.sectionLabel).toBe('Accounts');
    }
  });

  it('contains a GitHub entry', () => {
    expect(ACCOUNTS_ENTRIES.some((e) => e.label === 'GitHub')).toBe(true);
  });
});

describe('AGENT_ENTRIES', () => {
  it('is non-empty and every entry has a label and section', () => {
    expect(AGENT_ENTRIES.length).toBeGreaterThan(0);
    for (const e of AGENT_ENTRIES) {
      expect(typeof e.label).toBe('string');
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.section).toBe('agent');
      expect(e.sectionLabel).toBe('Agent');
    }
  });

  it('contains Automatic Model Routing entry', () => {
    expect(AGENT_ENTRIES.some((e) => e.label === 'Automatic Model Routing')).toBe(true);
  });

  it('every entry with a description has a non-empty string description', () => {
    for (const e of AGENT_ENTRIES) {
      if (e.description !== undefined) {
        expect(typeof e.description).toBe('string');
        expect(e.description.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('APPEARANCE_ENTRIES', () => {
  it('is non-empty with section appearance', () => {
    expect(APPEARANCE_ENTRIES.length).toBeGreaterThan(0);
    expect(APPEARANCE_ENTRIES.every((e) => e.section === 'appearance')).toBe(true);
  });

  it('contains a Theme entry', () => {
    expect(APPEARANCE_ENTRIES.some((e) => e.label === 'Theme')).toBe(true);
  });
});

describe('FONT_ENTRIES', () => {
  it('is non-empty with section fonts', () => {
    expect(FONT_ENTRIES.length).toBeGreaterThan(0);
    expect(FONT_ENTRIES.every((e) => e.section === 'fonts')).toBe(true);
  });
});

describe('TERMINAL_ENTRIES', () => {
  it('is non-empty with section terminal', () => {
    expect(TERMINAL_ENTRIES.length).toBeGreaterThan(0);
    expect(TERMINAL_ENTRIES.every((e) => e.section === 'terminal')).toBe(true);
  });

  it('contains a Default Shell entry', () => {
    expect(TERMINAL_ENTRIES.some((e) => e.label === 'Default Shell')).toBe(true);
  });
});
