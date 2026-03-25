import { describe, expect, it } from 'vitest';
import { findConflict, getEffectiveShortcut, keyEventToString } from './keybindingsData';

describe('keyEventToString', () => {
  it('ignores modifier-only presses', () => {
    expect(keyEventToString({ key: 'Shift' } as KeyboardEvent)).toBeNull();
    expect(keyEventToString({ key: 'Control' } as KeyboardEvent)).toBeNull();
  });

  it('normalizes modifier order and printable keys', () => {
    expect(keyEventToString({ key: 'p', ctrlKey: true, shiftKey: true } as KeyboardEvent)).toBe('Ctrl+Shift+P');
    expect(keyEventToString({ key: 'p', metaKey: true } as KeyboardEvent)).toBe('Ctrl+P');
  });

  it('normalizes special keys', () => {
    expect(keyEventToString({ key: 'ArrowUp', ctrlKey: true } as KeyboardEvent)).toBe('Ctrl+Up');
    expect(keyEventToString({ key: ' ' } as KeyboardEvent)).toBe('Space');
  });
});

describe('getEffectiveShortcut', () => {
  it('prefers user overrides', () => {
    expect(getEffectiveShortcut('app:settings', { 'app:settings': 'Ctrl+Alt+S' })).toBe('Ctrl+Alt+S');
  });

  it('falls back to built-in defaults', () => {
    expect(getEffectiveShortcut('file:open-file', {})).toBe('Ctrl+P');
  });

  it('returns an empty string for unknown actions', () => {
    expect(getEffectiveShortcut('missing:action', {})).toBe('');
  });
});

describe('findConflict', () => {
  it('finds case-insensitive conflicts against effective shortcuts', () => {
    const keybindings = { 'app:settings': 'ctrl+shift+p' };
    expect(findConflict('Ctrl+Shift+P', 'file:open-file', keybindings)).toBe('app:settings');
  });

  it('ignores the excluded action id', () => {
    const keybindings = { 'app:settings': 'Ctrl+,' };
    expect(findConflict('Ctrl+,', 'app:settings', keybindings)).toBeNull();
  });
});
