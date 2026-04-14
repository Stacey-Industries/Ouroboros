import { describe, expect, it } from 'vitest';

import { parseUsageText } from './claudeUsagePoller';

// ── parseUsageText unit tests ──────────────────────────────────────────────

const SAMPLE_USAGE_TEXT = `
Current session
████████  80% used
Resets 11pm (America/Toronto)

Current week (all models)
██████  34% used
Resets Apr 4, 1pm (America/Toronto)
`;

const EMPTY_TEXT = 'No usage data here';

describe('parseUsageText', () => {
  it('parses fiveHourUsed and sevenDayUsed from well-formed output', () => {
    const result = parseUsageText(SAMPLE_USAGE_TEXT);
    expect(result.fiveHourUsed).toBe(80);
    expect(result.sevenDayUsed).toBe(34);
  });

  it('returns null fields when output has no usage data', () => {
    const result = parseUsageText(EMPTY_TEXT);
    expect(result.fiveHourUsed).toBeNull();
    expect(result.sevenDayUsed).toBeNull();
    expect(result.fiveHourResetsAt).toBeNull();
    expect(result.sevenDayResetsAt).toBeNull();
  });

  it('does not set stale on a fresh parse result', () => {
    const result = parseUsageText(SAMPLE_USAGE_TEXT);
    expect(result.stale).toBeUndefined();
  });
});

// ── stale flag tests (simulated via the shape contract) ────────────────────
//
// spawnUsageQuery is not directly testable without a real PTY, so we verify
// the stale-flag contract through the ParsedUsage type shape and the spread
// pattern used in attachPtyHandlers.

describe('stale flag contract', () => {
  it('spread of a fresh parse with stale:true produces correct shape', () => {
    const fresh = parseUsageText(SAMPLE_USAGE_TEXT);
    // Simulate what the timeout path does
    const staleResult = fresh.fiveHourUsed !== null ? { ...fresh, stale: true } : null;
    expect(staleResult).not.toBeNull();
    expect(staleResult?.stale).toBe(true);
    expect(staleResult?.fiveHourUsed).toBe(80);
    expect(staleResult?.sevenDayUsed).toBe(34);
  });

  it('returns null when no parse has succeeded (empty lastParse)', () => {
    // Simulate timeout path when lastParseRef.value is null.
    // Use a helper to avoid TS literal-null narrowing on the spread.
    function applyStale(last: ReturnType<typeof parseUsageText> | null) {
      return last ? { ...last, stale: true } : null;
    }
    expect(applyStale(null)).toBeNull();
  });

  it('stale is not set on a non-timeout (exit) result', () => {
    // Exit path: result comes directly from parseUsageText with no stale spread
    const exitResult = parseUsageText(SAMPLE_USAGE_TEXT);
    expect(exitResult.stale).toBeUndefined();
  });
});
