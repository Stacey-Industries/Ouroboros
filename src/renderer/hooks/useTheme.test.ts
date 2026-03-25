import { beforeEach, describe, expect, it, vi } from 'vitest';
import { customTheme } from '../themes';
import { applyCustomThemeColors, applyFontConfig } from './useTheme';

type StyleRecorder = {
  fontSize: string;
  getPropertyValue: (name: string) => string;
  setProperty: ReturnType<typeof vi.fn>;
};

function createStyleRecorder(): StyleRecorder {
  const values = new Map<string, string>();
  return {
    fontSize: '',
    getPropertyValue: (name: string) => values.get(name) ?? '',
    setProperty: vi.fn((name: string, value: string) => {
      values.set(name, value);
    }),
  };
}

function getStyleRecorder(): StyleRecorder {
  return document.documentElement.style as unknown as StyleRecorder;
}

describe('useTheme helpers', () => {
  const originalCustomBg = customTheme.colors.bg;
  const originalCustomText = customTheme.colors.text;

  beforeEach(() => {
    const style = createStyleRecorder();
    const documentElement = {
      style,
      dataset: {},
    };

    vi.stubGlobal('document', { documentElement });
    vi.stubGlobal('window', { dispatchEvent: vi.fn(), electronAPI: { app: { setTitleBarOverlay: vi.fn() } } });
    customTheme.colors.bg = originalCustomBg;
    customTheme.colors.text = originalCustomText;
  });

  it('applies font families and clamps the UI font size', () => {
    const style = getStyleRecorder();

    applyFontConfig('Inter', 'Fira Code', 25);

    expect(style.setProperty).toHaveBeenCalledWith('--font-ui', '"Inter", system-ui, sans-serif');
    expect(style.setProperty).toHaveBeenCalledWith('--font-mono', '"Fira Code", monospace');
    expect(style.setProperty).toHaveBeenCalledWith('--font-size-ui', '18px');
    expect(style.fontSize).toBe('18px');
  });

  it('falls back to the minimum font size when the input is too small', () => {
    const style = getStyleRecorder();

    applyFontConfig('', '', 8);

    expect(style.setProperty).toHaveBeenCalledWith('--font-size-ui', '11px');
    expect(style.fontSize).toBe('11px');
  });

  it('merges custom theme colors into the shared theme and DOM variables', () => {
    const style = getStyleRecorder();

    applyCustomThemeColors({ '--bg': '#101010', '--text': '#efefef' });

    expect((customTheme.colors as Record<string, string>)['--bg']).toBe('#101010');
    expect((customTheme.colors as Record<string, string>)['--text']).toBe('#efefef');
    expect(style.setProperty).toHaveBeenCalledWith('--bg', '#101010');
    expect(style.setProperty).toHaveBeenCalledWith('--text', '#efefef');
  });
});
