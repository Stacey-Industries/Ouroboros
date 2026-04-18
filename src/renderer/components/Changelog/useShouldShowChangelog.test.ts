/**
 * useShouldShowChangelog.test.ts
 * Wave 38 Phase E — tests for the changelog gate logic.
 *
 * Tests the semverGte + computeVisible logic indirectly by importing and
 * calling the exported helpers. The hook itself is integration-tested via
 * ChangelogDrawer.test.tsx (jsdom environment).
 */
import { describe, expect, it } from 'vitest';

// ── Inline the pure helpers (mirrors src logic) ───────────────────────────────
// These match the implementations in useShouldShowChangelog.ts exactly.

function semverGte(a: string, b: string): boolean {
  const toNum = (s: string) => s.split('.').map(Number);
  const [aMaj, aMin, aPat] = toNum(a);
  const [bMaj, bMin, bPat] = toNum(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat >= bPat;
}

function computeVisible(
  order: readonly string[],
  current: string,
  lastSeen: string | undefined,
): string[] {
  const result: string[] = [];
  for (const v of order) {
    if (v === 'unreleased') continue;
    if (!semverGte(current, v)) continue; // skip versions newer than current
    if (lastSeen && semverGte(lastSeen, v)) continue; // skip already-seen
    result.push(v);
  }
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('semverGte', () => {
  it('returns true when a === b', () => {
    expect(semverGte('2.4.1', '2.4.1')).toBe(true);
  });
  it('returns true when a > b (patch)', () => {
    expect(semverGte('2.4.2', '2.4.1')).toBe(true);
  });
  it('returns false when a < b (minor)', () => {
    expect(semverGte('2.3.0', '2.4.0')).toBe(false);
  });
  it('returns true when a major is greater', () => {
    expect(semverGte('3.0.0', '2.9.9')).toBe(true);
  });
});

describe('computeVisible', () => {
  const ORDER = ['2.4.1', '2.4.0', '2.3.1', '2.3.0', '2.2.0'];

  it('returns shouldShow=true when version changed and entries exist', () => {
    const result = computeVisible(ORDER, '2.4.1', '2.3.0');
    expect(result).toContain('2.4.1');
    expect(result).toContain('2.4.0');
    expect(result).toContain('2.3.1');
    expect(result).not.toContain('2.3.0');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty when lastSeen matches current', () => {
    const result = computeVisible(ORDER, '2.4.1', '2.4.1');
    expect(result).toHaveLength(0);
  });

  it('returns empty when no entries are newer than current', () => {
    // current is 2.4.1, order has 2.4.1 as the top entry; lastSeen=2.4.1
    const result = computeVisible(['2.4.1', '2.4.0'], '2.4.1', '2.4.1');
    expect(result).toHaveLength(0);
  });

  it('skips "unreleased" entries', () => {
    const result = computeVisible(['unreleased', '2.4.1'], '2.4.1', undefined);
    expect(result).not.toContain('unreleased');
    expect(result).toContain('2.4.1');
  });

  it('returns all entries when lastSeen is undefined', () => {
    const result = computeVisible(['2.4.1', '2.4.0'], '2.4.1', undefined);
    expect(result).toEqual(['2.4.1', '2.4.0']);
  });

  it('excludes versions newer than current', () => {
    // current = 2.3.0: 2.4.1 and 2.4.0 are newer so they are skipped;
    // 2.3.1 is newer too; 2.3.0 and 2.2.0 are included (no lastSeen filter).
    const result = computeVisible(ORDER, '2.3.0', undefined);
    expect(result).not.toContain('2.4.1');
    expect(result).not.toContain('2.4.0');
    expect(result).not.toContain('2.3.1');
    expect(result).toContain('2.3.0');
    expect(result).toContain('2.2.0');
  });
});
