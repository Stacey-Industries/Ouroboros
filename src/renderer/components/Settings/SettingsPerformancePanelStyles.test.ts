/**
 * SettingsPerformancePanelStyles.test.ts — Smoke tests for extracted style constants.
 *
 * Verifies that every exported style object is a plain object (React.CSSProperties)
 * and that CSS variable references are preserved (no hardcoded hex/rgb values).
 */

import { describe, expect, it } from 'vitest';

import {
  cellStyle,
  chevronStyle,
  descStyle,
  hintStyle,
  historyToggleStyle,
  inlineLinkStyle,
  metricLabelStyle,
  metricRowStyle,
  metricsGridStyle,
  metricValueStyle,
  sectionStyle,
  tableStyle,
  thStyle,
  totalRowStyle,
  updatedStyle,
} from './SettingsPerformancePanelStyles';

const ALL_STYLES = {
  cellStyle,
  chevronStyle,
  descStyle,
  historyToggleStyle,
  hintStyle,
  inlineLinkStyle,
  metricLabelStyle,
  metricRowStyle,
  metricValueStyle,
  metricsGridStyle,
  sectionStyle,
  tableStyle,
  thStyle,
  totalRowStyle,
  updatedStyle,
};

describe('SettingsPerformancePanelStyles', () => {
  it('exports all style constants as plain objects', () => {
    for (const [name, style] of Object.entries(ALL_STYLES)) {
      expect(typeof style, `${name} should be an object`).toBe('object');
      expect(style, `${name} should not be null`).not.toBeNull();
    }
  });

  it('does not contain hardcoded hex or rgb color values', () => {
    const hardcodedColorPattern = /#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(/;
    for (const [name, style] of Object.entries(ALL_STYLES)) {
      const serialized = JSON.stringify(style);
      expect(hardcodedColorPattern.test(serialized), `${name} must not contain hardcoded colors`).toBe(false);
    }
  });

  it('cellStyle uses CSS variable for border', () => {
    expect(cellStyle.borderBottom).toContain('var(--');
  });

  it('totalRowStyle uses CSS variable for border', () => {
    expect(totalRowStyle.borderTop).toContain('var(--');
  });

  it('metricValueStyle uses CSS variable for fontFamily', () => {
    expect(metricValueStyle.fontFamily).toContain('var(--');
  });
});
