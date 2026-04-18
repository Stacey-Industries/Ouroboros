/**
 * DispatchScreen.styles.test.ts — smoke tests for style constant exports.
 *
 * Style modules export CSSProperties objects and helper functions.
 * Tests verify: exports exist, are objects/functions, use design tokens
 * (no hardcoded colors), and statusPillStyle returns the correct color class
 * per status.
 */

import { describe, expect, it } from 'vitest';

import {
  DANGER_BUTTON_STYLE,
  DETAIL_FIELD_STYLE,
  DETAIL_LABEL_STYLE,
  DETAIL_VALUE_STYLE,
  type DispatchJobStatus,
  ERROR_TEXT_STYLE,
  FIELD_GROUP_STYLE,
  GHOST_BUTTON_STYLE,
  INPUT_STYLE,
  JOB_CARD_ACTIVE_STYLE,
  JOB_CARD_STYLE,
  JOB_META_STYLE,
  JOB_TITLE_STYLE,
  PRIMARY_BUTTON_STYLE,
  SCREEN_WRAPPER_STYLE,
  SCROLLABLE_BODY_STYLE,
  SECTION_LABEL_STYLE,
  SELECT_STYLE,
  statusPillStyle,
  STUB_NOTICE_STYLE,
  TAB_BAR_STYLE,
  tabButtonStyle,
  TEXTAREA_STYLE,
} from './DispatchScreen.styles';

// ── Constant objects ──────────────────────────────────────────────────────────

describe('DispatchScreen.styles — constant exports', () => {
  const constants = [
    ['SCREEN_WRAPPER_STYLE', SCREEN_WRAPPER_STYLE],
    ['SCROLLABLE_BODY_STYLE', SCROLLABLE_BODY_STYLE],
    ['SECTION_LABEL_STYLE', SECTION_LABEL_STYLE],
    ['ERROR_TEXT_STYLE', ERROR_TEXT_STYLE],
    ['INPUT_STYLE', INPUT_STYLE],
    ['TEXTAREA_STYLE', TEXTAREA_STYLE],
    ['SELECT_STYLE', SELECT_STYLE],
    ['FIELD_GROUP_STYLE', FIELD_GROUP_STYLE],
    ['PRIMARY_BUTTON_STYLE', PRIMARY_BUTTON_STYLE],
    ['DANGER_BUTTON_STYLE', DANGER_BUTTON_STYLE],
    ['GHOST_BUTTON_STYLE', GHOST_BUTTON_STYLE],
    ['JOB_CARD_STYLE', JOB_CARD_STYLE],
    ['JOB_CARD_ACTIVE_STYLE', JOB_CARD_ACTIVE_STYLE],
    ['JOB_TITLE_STYLE', JOB_TITLE_STYLE],
    ['JOB_META_STYLE', JOB_META_STYLE],
    ['DETAIL_FIELD_STYLE', DETAIL_FIELD_STYLE],
    ['DETAIL_LABEL_STYLE', DETAIL_LABEL_STYLE],
    ['DETAIL_VALUE_STYLE', DETAIL_VALUE_STYLE],
    ['STUB_NOTICE_STYLE', STUB_NOTICE_STYLE],
    ['TAB_BAR_STYLE', TAB_BAR_STYLE],
  ] as const;

  it.each(constants)('%s is a non-null object', (_name, style) => {
    expect(style).toBeDefined();
    expect(typeof style).toBe('object');
    expect(style).not.toBeNull();
  });
});

// ── No hardcoded colors ───────────────────────────────────────────────────────

describe('DispatchScreen.styles — no hardcoded hex/rgb colors in constants', () => {
  const hexOrRgb = /#[0-9a-f]{3,6}|rgb\(|rgba\(/i;

  const constants: Record<string, object> = {
    SCREEN_WRAPPER_STYLE,
    SCROLLABLE_BODY_STYLE,
    ERROR_TEXT_STYLE,
    INPUT_STYLE,
    PRIMARY_BUTTON_STYLE,
    DANGER_BUTTON_STYLE,
    JOB_CARD_STYLE,
    JOB_CARD_ACTIVE_STYLE,
  };

  for (const [name, style] of Object.entries(constants)) {
    it(`${name} uses only var() or keyword colors`, () => {
      const values = Object.values(style as Record<string, unknown>).join(' ');
      expect(values).not.toMatch(hexOrRgb);
    });
  }
});

// ── statusPillStyle ───────────────────────────────────────────────────────────

describe('statusPillStyle', () => {
  const statuses: DispatchJobStatus[] = [
    'queued', 'starting', 'running', 'completed', 'failed', 'canceled',
  ];

  it.each(statuses)('returns an object for status "%s"', (status) => {
    const result = statusPillStyle(status);
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  it('completed status uses success token', () => {
    const result = statusPillStyle('completed');
    expect(result.color).toContain('success');
  });

  it('failed status uses error token', () => {
    const result = statusPillStyle('failed');
    expect(result.color).toContain('error');
  });

  it('queued status uses info token', () => {
    const result = statusPillStyle('queued');
    expect(result.color).toContain('info');
  });

  it('running status uses warning token', () => {
    const result = statusPillStyle('running');
    expect(result.color).toContain('warning');
  });

  it('all statuses include borderRadius', () => {
    for (const status of statuses) {
      expect(statusPillStyle(status).borderRadius).toBeDefined();
    }
  });
});

// ── tabButtonStyle ────────────────────────────────────────────────────────────

describe('tabButtonStyle', () => {
  it('active tab has accent color', () => {
    const active = tabButtonStyle(true);
    expect(active.color).toContain('accent');
  });

  it('inactive tab has secondary color', () => {
    const inactive = tabButtonStyle(false);
    expect(inactive.color).toContain('secondary');
  });

  it('active tab has heavier fontWeight than inactive', () => {
    const active = tabButtonStyle(true);
    const inactive = tabButtonStyle(false);
    expect(Number(active.fontWeight)).toBeGreaterThan(Number(inactive.fontWeight));
  });

  it('active tab bottom border contains accent', () => {
    const active = tabButtonStyle(true);
    expect(String(active.borderBottom)).toContain('accent');
  });
});
