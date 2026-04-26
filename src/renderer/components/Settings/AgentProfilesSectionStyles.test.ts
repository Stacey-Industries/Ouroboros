/**
 * AgentProfilesSectionStyles.test.ts — Smoke tests for style constant exports.
 */

import { describe, expect, it } from 'vitest';

import {
  actionBtnStyle,
  actionsStyle,
  badgeRowStyle,
  badgeStyle,
  builtInLabelStyle,
  cancelBtnStyle,
  deleteBtnStyle,
  importBtnStyle,
  modalCardStyle,
  modalDescStyle,
  modalFooterStyle,
  modalOverlayStyle,
  modalTextareaStyle,
  nameStyle,
  profileRowStyle,
} from './AgentProfilesSectionStyles';

describe('AgentProfilesSectionStyles', () => {
  it('exports style objects with expected shape', () => {
    expect(badgeStyle).toMatchObject({ fontSize: '10px' });
    expect(actionsStyle).toMatchObject({ display: 'flex' });
    expect(actionBtnStyle).toMatchObject({ cursor: 'pointer' });
    expect(deleteBtnStyle).toMatchObject({ borderColor: 'var(--status-error)' });
    expect(profileRowStyle).toMatchObject({ display: 'flex' });
    expect(nameStyle).toMatchObject({ flex: 1 });
    expect(builtInLabelStyle).toMatchObject({ fontSize: '10px' });
    expect(badgeRowStyle).toMatchObject({ display: 'flex' });
    expect(modalOverlayStyle).toMatchObject({ position: 'fixed' });
    expect(modalCardStyle).toMatchObject({ width: '480px' });
    expect(modalDescStyle).toMatchObject({ fontSize: '12px' });
    expect(modalTextareaStyle).toMatchObject({ fontFamily: 'var(--font-mono)' });
    expect(modalFooterStyle).toMatchObject({ display: 'flex' });
    expect(cancelBtnStyle).toMatchObject({ cursor: 'pointer' });
  });

  it('importBtnStyle returns enabled styles when enabled=true', () => {
    const style = importBtnStyle(true);
    expect(style.background).toBe('var(--interactive-accent)');
    expect(style.cursor).toBe('pointer');
  });

  it('importBtnStyle returns disabled styles when enabled=false', () => {
    const style = importBtnStyle(false);
    expect(style.background).toBe('var(--surface-raised)');
    expect(style.cursor).toBe('not-allowed');
  });
});
