import { describe, expect, it } from 'vitest';

import { VS_CODE_COLOR_MAP } from './vsCodeImport.colorMap';

describe('VS_CODE_COLOR_MAP', () => {
  it('maps editor.background to --surface-base', () => {
    expect(VS_CODE_COLOR_MAP['editor.background']).toBe('--surface-base');
  });

  it('maps editor.foreground to --text-primary', () => {
    expect(VS_CODE_COLOR_MAP['editor.foreground']).toBe('--text-primary');
  });

  it('maps focusBorder to --border-accent', () => {
    expect(VS_CODE_COLOR_MAP['focusBorder']).toBe('--border-accent');
  });

  it('maps button.background to --interactive-accent', () => {
    expect(VS_CODE_COLOR_MAP['button.background']).toBe('--interactive-accent');
  });

  it('maps activityBar.background to --surface-panel', () => {
    expect(VS_CODE_COLOR_MAP['activityBar.background']).toBe('--surface-panel');
  });

  it('maps sideBar.background to --surface-raised', () => {
    expect(VS_CODE_COLOR_MAP['sideBar.background']).toBe('--surface-raised');
  });

  it('maps scrollbarSlider.background to --surface-scroll-thumb', () => {
    expect(VS_CODE_COLOR_MAP['scrollbarSlider.background']).toBe('--surface-scroll-thumb');
  });

  it('maps errorForeground to --status-error', () => {
    expect(VS_CODE_COLOR_MAP['errorForeground']).toBe('--status-error');
  });

  it('all values start with -- (are CSS custom property names)', () => {
    for (const [key, value] of Object.entries(VS_CODE_COLOR_MAP)) {
      expect(value, `${key} → ${value}`).toMatch(/^--/);
    }
  });

  it('contains at least 40 entries', () => {
    expect(Object.keys(VS_CODE_COLOR_MAP).length).toBeGreaterThanOrEqual(40);
  });

  it('has no duplicate values for unrelated VS Code keys (spot check)', () => {
    // editor.background and statusBar.background should map to different tokens
    expect(VS_CODE_COLOR_MAP['editor.background']).not.toBe(
      VS_CODE_COLOR_MAP['statusBar.background'],
    );
  });
});
