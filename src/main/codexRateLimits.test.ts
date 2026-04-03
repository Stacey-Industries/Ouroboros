import { describe, expect, it } from 'vitest';

import { parseCodexRateLimitLine } from './codexRateLimits';

describe('parseCodexRateLimitLine', () => {
  it('parses Codex token_count rate limits', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-29T21:44:31.913Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        rate_limits: {
          plan_type: 'plus',
          primary: {
            used_percent: 14,
            window_minutes: 300,
            resets_at: 1_774_837_770,
          },
          secondary: {
            used_percent: 4,
            window_minutes: 10_080,
            resets_at: 1_775_424_570,
          },
        },
      },
    });

    const result = parseCodexRateLimitLine(line);

    expect(result).toEqual({
      timestamp: Date.parse('2026-03-29T21:44:31.913Z'),
      planType: 'plus',
      windows: [
        { usedPercent: 14, windowMinutes: 300, resetsAt: 1_774_837_770_000 },
        { usedPercent: 4, windowMinutes: 10_080, resetsAt: 1_775_424_570_000 },
      ],
    });
  });

  it('ignores non-token-count events', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-29T21:44:31.913Z',
      type: 'event_msg',
      payload: {
        type: 'status',
        rate_limits: {
          primary: {
            used_percent: 14,
            window_minutes: 300,
            resets_at: 1_774_837_770,
          },
        },
      },
    });

    expect(parseCodexRateLimitLine(line)).toBeNull();
  });

  it('returns null for malformed json', () => {
    expect(parseCodexRateLimitLine('{not-json')).toBeNull();
  });
});
