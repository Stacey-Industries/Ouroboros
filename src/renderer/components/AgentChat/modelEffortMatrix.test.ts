/**
 * modelEffortMatrix.test.ts — Wave 59 Phase G
 */
import { describe, expect, it } from 'vitest';

import { ANTHROPIC_AUTO_MODEL } from './ChatControlsBarSupport';
import { getEffortOptions, getModelLabel, MODEL_EFFORTS, MODEL_LABELS } from './modelEffortMatrix';

describe('MODEL_LABELS', () => {
  it('has correct label for each Anthropic model', () => {
    expect(MODEL_LABELS[ANTHROPIC_AUTO_MODEL]).toBe('Auto');
    expect(MODEL_LABELS['opus[1m]']).toBe('Opus 4.7 1M');
    expect(MODEL_LABELS['opus']).toBe('Opus 4.7');
    expect(MODEL_LABELS['sonnet']).toBe('Sonnet 4.6');
    expect(MODEL_LABELS['haiku']).toBe('Haiku 4.5');
  });
});

describe('MODEL_EFFORTS', () => {
  it('opus[1m] supports full ladder including xhigh and max', () => {
    expect(MODEL_EFFORTS['opus[1m]']).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('opus supports full ladder including xhigh and max', () => {
    expect(MODEL_EFFORTS['opus']).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('sonnet supports low/medium/high/max but not xhigh', () => {
    expect(MODEL_EFFORTS['sonnet']).toEqual(['low', 'medium', 'high', 'max']);
    expect(MODEL_EFFORTS['sonnet']).not.toContain('xhigh');
  });

  it('haiku has null effort (no selector)', () => {
    expect(MODEL_EFFORTS['haiku']).toBeNull();
  });

  it('auto has null effort (deferred to underlying model)', () => {
    expect(MODEL_EFFORTS[ANTHROPIC_AUTO_MODEL]).toBeNull();
  });
});

describe('getModelLabel', () => {
  it('returns correct label for each known model', () => {
    expect(getModelLabel('opus')).toBe('Opus 4.7');
    expect(getModelLabel('opus[1m]')).toBe('Opus 4.7 1M');
    expect(getModelLabel('sonnet')).toBe('Sonnet 4.6');
    expect(getModelLabel('haiku')).toBe('Haiku 4.5');
    expect(getModelLabel(ANTHROPIC_AUTO_MODEL)).toBe('Auto');
  });

  it('falls back to raw ID for unknown model IDs', () => {
    expect(getModelLabel('gpt-5.4')).toBe('gpt-5.4');
    expect(getModelLabel('minimax:m2.7')).toBe('minimax:m2.7');
  });
});

describe('getEffortOptions', () => {
  it('returns full ladder for opus', () => {
    expect(getEffortOptions('opus')).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('returns full ladder for opus[1m]', () => {
    expect(getEffortOptions('opus[1m]')).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('returns ladder without xhigh for sonnet', () => {
    const opts = getEffortOptions('sonnet');
    expect(opts).toEqual(['low', 'medium', 'high', 'max']);
  });

  it('returns null for haiku (effort hidden)', () => {
    expect(getEffortOptions('haiku')).toBeNull();
  });

  it('returns null for auto (deferred to underlying model)', () => {
    expect(getEffortOptions(ANTHROPIC_AUTO_MODEL)).toBeNull();
  });

  it('returns null for unknown model IDs (conservative default)', () => {
    expect(getEffortOptions('gpt-5.4')).toBeNull();
    expect(getEffortOptions('')).toBeNull();
  });
});
