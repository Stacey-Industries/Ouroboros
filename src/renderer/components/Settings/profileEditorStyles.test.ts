/**
 * profileEditorStyles.test.ts — Smoke tests for style exports.
 *
 * These are pure JS objects/functions — no DOM needed.
 */

import { describe, expect, it } from 'vitest';

import {
  cancelBtnStyle,
  checkItemStyle,
  checklistWrapStyle,
  editorTitleStyle,
  editorWrapStyle,
  errorStyle,
  fieldRowStyle,
  footerStyle,
  inputStyle,
  labelStyle,
  saveBtnStyle,
  segmentActiveStyle,
  segmentedWrapStyle,
  segmentStyle,
  textareaStyle,
} from './profileEditorStyles';

describe('profileEditorStyles', () => {
  it('editorWrapStyle uses surface-raised background', () => {
    expect(editorWrapStyle.background).toBe('var(--surface-raised)');
  });

  it('inputStyle uses surface-base background', () => {
    expect(inputStyle.background).toBe('var(--surface-base)');
  });

  it('textareaStyle extends inputStyle with vertical resize', () => {
    expect(textareaStyle.resize).toBe('vertical');
    expect(textareaStyle.background).toBe(inputStyle.background);
  });

  it('segmentActiveStyle uses interactive-accent background', () => {
    expect(segmentActiveStyle.background).toBe('var(--interactive-accent)');
  });

  it('segmentStyle equals segmentBase (transparent background)', () => {
    expect(segmentStyle.background).toBe('transparent');
  });

  it('saveBtnStyle(true) returns accent background', () => {
    const style = saveBtnStyle(true);
    expect(style.background).toBe('var(--interactive-accent)');
    expect(style.cursor).toBe('pointer');
  });

  it('saveBtnStyle(false) returns surface-raised background', () => {
    const style = saveBtnStyle(false);
    expect(style.background).toBe('var(--surface-raised)');
    expect(style.cursor).toBe('not-allowed');
  });

  it('all style exports are defined objects', () => {
    const styles = [
      editorWrapStyle, editorTitleStyle, errorStyle, fieldRowStyle,
      labelStyle, inputStyle, textareaStyle, segmentedWrapStyle,
      segmentActiveStyle, checklistWrapStyle, checkItemStyle,
      footerStyle, cancelBtnStyle,
    ];
    for (const s of styles) {
      expect(typeof s).toBe('object');
      expect(s).not.toBeNull();
    }
  });
});
