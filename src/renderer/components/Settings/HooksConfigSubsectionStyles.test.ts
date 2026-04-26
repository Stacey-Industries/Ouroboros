import { describe, expect, it } from 'vitest';

import {
  addBtnStyle,
  addInputStyle,
  categoryLabelStyle,
  eventBodyStyle,
  eventHeaderStyle,
  eventSectionStyle,
  hookCmdStyle,
  hookRowStyle,
  removeBtnStyle,
  scopeButtonStyle,
  scopeToggleStyle,
} from './HooksConfigSubsectionStyles';

describe('HooksConfigSubsectionStyles — static constants', () => {
  it('categoryLabelStyle is a plain object with expected keys', () => {
    expect(categoryLabelStyle).toMatchObject({
      fontSize: '10px',
      textTransform: 'uppercase',
    });
  });

  it('scopeToggleStyle uses CSS variable for border', () => {
    expect(scopeToggleStyle.border).toContain('var(--border-default)');
  });

  it('eventSectionStyle uses CSS variable for border', () => {
    expect(eventSectionStyle.border).toContain('var(--border-default)');
  });

  it('eventBodyStyle uses CSS variable for background', () => {
    expect(eventBodyStyle.background).toContain('var(--surface-base)');
  });

  it('hookRowStyle has display flex', () => {
    expect(hookRowStyle.display).toBe('flex');
  });

  it('hookCmdStyle uses CSS variable for fontFamily', () => {
    expect(hookCmdStyle.fontFamily).toContain('var(--font-mono)');
  });

  it('removeBtnStyle uses CSS variable for color', () => {
    expect(removeBtnStyle.color).toContain('var(--text-muted)');
  });

  it('addInputStyle uses CSS variable for background', () => {
    expect(addInputStyle.background).toContain('var(--surface-raised)');
  });

  it('eventHeaderStyle uses CSS variable for color', () => {
    expect(eventHeaderStyle.color).toContain('var(--text-primary)');
  });
});

describe('scopeButtonStyle', () => {
  it('returns accent background when active', () => {
    const style = scopeButtonStyle(true);
    expect(style.background).toContain('var(--interactive-accent)');
    expect(style.color).toContain('var(--text-on-accent)');
    expect(style.fontWeight).toBe(600);
  });

  it('returns transparent background when inactive', () => {
    const style = scopeButtonStyle(false);
    expect(style.background).toBe('transparent');
    expect(style.color).toContain('var(--text-muted)');
    expect(style.fontWeight).toBe(400);
  });
});

describe('addBtnStyle', () => {
  it('returns muted color and not-allowed cursor when disabled', () => {
    const style = addBtnStyle(true);
    expect(style.color).toContain('var(--text-muted)');
    expect(style.cursor).toBe('not-allowed');
  });

  it('returns primary color and pointer cursor when enabled', () => {
    const style = addBtnStyle(false);
    expect(style.color).toContain('var(--text-primary)');
    expect(style.cursor).toBe('pointer');
  });
});
