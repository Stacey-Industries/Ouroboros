/**
 * useThemeImportState.test.ts — Unit tests for runImport, runReset, and helpers.
 */

import { describe, expect, it, vi } from 'vitest';

import { getCustomTokens, runImport, runReset, writeCustomTokens } from './useThemeImportState';

// ── getCustomTokens ────────────────────────────────────────────────────────────

describe('getCustomTokens', () => {
  it('returns empty object for null config', () => {
    expect(getCustomTokens(null)).toEqual({});
  });

  it('returns empty object when theming is absent', () => {
    expect(getCustomTokens({} as never)).toEqual({});
  });

  it('returns customTokens when present', () => {
    // hardcoded: test fixture, not user-facing
    const cfg = { theming: { customTokens: { '--bg': '#000' } } } as never;
    // hardcoded: test fixture, not user-facing
    expect(getCustomTokens(cfg)).toEqual({ '--bg': '#000' });
  });
});

// ── writeCustomTokens ──────────────────────────────────────────────────────────

describe('writeCustomTokens', () => {
  it('calls set with merged theming object', () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const cfg = { theming: { activeTheme: 'dark' } } as never;
    // hardcoded: test fixture, not user-facing
    writeCustomTokens(set, cfg, { '--fg': '#fff' });
    expect(set).toHaveBeenCalledWith('theming', {
      activeTheme: 'dark',
      // hardcoded: test fixture, not user-facing
      customTokens: { '--fg': '#fff' },
    });
  });

  it('handles null config gracefully', () => {
    const set = vi.fn().mockResolvedValue(undefined);
    // hardcoded: test fixture, not user-facing
    writeCustomTokens(set, null, { '--fg': '#fff' });
    // hardcoded: test fixture, not user-facing
    expect(set).toHaveBeenCalledWith('theming', { customTokens: { '--fg': '#fff' } });
  });
});

// ── runImport ─────────────────────────────────────────────────────────────────

describe('runImport', () => {
  it('sets error when pasteValue is empty', () => {
    const setError = vi.fn();
    runImport({
      pasteValue: '   ',
      setError,
      setImportResult: vi.fn(),
      setPhase: vi.fn(),
      set: vi.fn(),
      config: null,
    });
    expect(setError).toHaveBeenCalledWith(
      'Please paste a VS Code theme JSON or upload a .json file.',
    );
  });

  it('sets error when JSON is invalid VS Code theme', () => {
    const setError = vi.fn();
    runImport({
      pasteValue: '{"not": "a theme"}',
      setError,
      setImportResult: vi.fn(),
      setPhase: vi.fn(),
      set: vi.fn(),
      config: null,
    });
    expect(setError).toHaveBeenCalled();
  });
});

// ── runReset ──────────────────────────────────────────────────────────────────

describe('runReset', () => {
  it('reverts state to input phase and clears values', () => {
    const setPasteValue = vi.fn();
    const setPhase = vi.fn();
    const setImportResult = vi.fn();
    const setError = vi.fn();
    const set = vi.fn().mockResolvedValue(undefined);

    runReset({
      setPasteValue,
      setPhase,
      setImportResult,
      setError,
      set,
      config: null,
      previousTokens: {},
    });

    expect(setPhase).toHaveBeenCalledWith('input');
    expect(setImportResult).toHaveBeenCalledWith(null);
    expect(setPasteValue).toHaveBeenCalledWith('');
    expect(setError).toHaveBeenCalledWith(null);
  });

  it('writes previousTokens back via set', () => {
    const set = vi.fn().mockResolvedValue(undefined);
    runReset({
      setPasteValue: vi.fn(),
      setPhase: vi.fn(),
      setImportResult: vi.fn(),
      setError: vi.fn(),
      set,
      config: null,
      previousTokens: { '--bg': 'blue' },
    });
    expect(set).toHaveBeenCalledWith('theming', { customTokens: { '--bg': 'blue' } });
  });
});
