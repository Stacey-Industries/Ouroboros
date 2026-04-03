import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ROUTER_SETTINGS,
  FEATURE_NAMES,
  SLASH_COMMAND_TIERS,
  TIER_TO_MODEL,
} from './routerTypes';

describe('routerTypes constants', () => {
  it('TIER_TO_MODEL covers all three tiers', () => {
    expect(TIER_TO_MODEL).toHaveProperty('HAIKU');
    expect(TIER_TO_MODEL).toHaveProperty('SONNET');
    expect(TIER_TO_MODEL).toHaveProperty('OPUS');
  });

  it('TIER_TO_MODEL values are valid model ID strings', () => {
    for (const model of Object.values(TIER_TO_MODEL)) {
      expect(model).toMatch(/^claude-/);
    }
  });

  it('SLASH_COMMAND_TIERS values are valid tiers', () => {
    const validTiers = new Set(['HAIKU', 'SONNET', 'OPUS']);
    for (const tier of Object.values(SLASH_COMMAND_TIERS)) {
      expect(validTiers.has(tier)).toBe(true);
    }
  });

  it('FEATURE_NAMES has no duplicates', () => {
    const unique = new Set(FEATURE_NAMES);
    expect(unique.size).toBe(FEATURE_NAMES.length);
  });

  it('DEFAULT_ROUTER_SETTINGS has all required fields', () => {
    expect(DEFAULT_ROUTER_SETTINGS.enabled).toBe(true);
    expect(typeof DEFAULT_ROUTER_SETTINGS.layer2ConfidenceThreshold).toBe('number');
    expect(DEFAULT_ROUTER_SETTINGS.paranoidMode).toBe(false);
  });
});
