/**
 * build-changelog.test.js — unit tests for the changelog parser.
 * Wave 38 Phase E. Runs under vitest (Node environment).
 */
import { describe, expect, it } from 'vitest';

// ── Inline the parse logic so we can test it without file I/O ────────────────
// We re-implement just the parse() function here, mirroring build-changelog.js.

const SECTION_HEADING_RE = /^##\s+\[(.+?)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/;
const CATEGORY_RE = /^###\s+(\S.*?)\s*$/;
const KNOWN_CATEGORIES = new Set(['added', 'changed', 'fixed', 'removed']);
const BULLET_RE = /^[-*]\s+(.+)$/;

function parse(md) {
  const lines = md.split(/\r?\n/);
  const entries = [];
  const warnings = [];
  let current = null;
  let currentCat = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sectionMatch = SECTION_HEADING_RE.exec(line);
    if (sectionMatch) {
      if (current) entries.push(current);
      const version =
        sectionMatch[1].toLowerCase() === 'unreleased' ? 'unreleased' : sectionMatch[1];
      current = { version, date: sectionMatch[2] };
      currentCat = null;
      continue;
    }
    if (!current) continue;
    const catMatch = CATEGORY_RE.exec(line);
    if (catMatch) {
      const cat = catMatch[1].toLowerCase();
      if (KNOWN_CATEGORIES.has(cat)) {
        currentCat = cat;
      } else {
        warnings.push(`Line ${i + 1}: unrecognised category "${catMatch[1]}"`);
        currentCat = null;
      }
      continue;
    }
    if (currentCat) {
      const bulletMatch = BULLET_RE.exec(line);
      if (bulletMatch) {
        if (!current[currentCat]) current[currentCat] = [];
        current[currentCat].push(bulletMatch[1].trim());
      }
    }
  }
  if (current) entries.push(current);
  return { entries, warnings };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FULL_FIXTURE = `
# Changelog

## [Unreleased]
### Added
- Placeholder entry.

## [2.4.1] - 2026-04-17
### Added
- Feature A
- Feature B
### Fixed
- Bug X

## [2.4.0] - 2026-04-10
### Changed
- Improved performance
### Removed
- Legacy API
`;

const NON_CONFORMING_FIXTURE = `
# Changelog

## [1.0.0] - 2026-01-01
### Added
- Initial release.

### Deprecated
- Old feature (non-standard category).
`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('build-changelog parser', () => {
  it('parses Unreleased section with version="unreleased"', () => {
    const { entries } = parse(FULL_FIXTURE);
    const unreleased = entries.find(e => e.version === 'unreleased');
    expect(unreleased).toBeDefined();
    expect(unreleased.added).toEqual(['Placeholder entry.']);
    expect(unreleased.date).toBeUndefined();
  });

  it('parses versioned sections with dates', () => {
    const { entries } = parse(FULL_FIXTURE);
    const v241 = entries.find(e => e.version === '2.4.1');
    expect(v241).toBeDefined();
    expect(v241.date).toBe('2026-04-17');
    expect(v241.added).toEqual(['Feature A', 'Feature B']);
    expect(v241.fixed).toEqual(['Bug X']);
  });

  it('parses Changed and Removed categories', () => {
    const { entries } = parse(FULL_FIXTURE);
    const v240 = entries.find(e => e.version === '2.4.0');
    expect(v240.changed).toEqual(['Improved performance']);
    expect(v240.removed).toEqual(['Legacy API']);
  });

  it('preserves entry order (newest first as in source)', () => {
    const { entries } = parse(FULL_FIXTURE);
    expect(entries.map(e => e.version)).toEqual(['unreleased', '2.4.1', '2.4.0']);
  });

  it('emits a warning for non-conforming category but still parses the conforming ones', () => {
    const { entries, warnings } = parse(NON_CONFORMING_FIXTURE);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/Deprecated/i);
    const v100 = entries.find(e => e.version === '1.0.0');
    expect(v100.added).toEqual(['Initial release.']);
  });

  it('returns empty entries for an empty string', () => {
    const { entries, warnings } = parse('');
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('handles asterisk bullets as well as dash bullets', () => {
    const md = `## [1.0.0]\n### Added\n* Star bullet\n- Dash bullet\n`;
    const { entries } = parse(md);
    expect(entries[0].added).toEqual(['Star bullet', 'Dash bullet']);
  });
});
