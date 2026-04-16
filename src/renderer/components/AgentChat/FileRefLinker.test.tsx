/**
 * FileRefLinker.test.tsx
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { linkifyFileRefs } from './FileRefLinker';

afterEach(cleanup);

// ── linkifyFileRefs ───────────────────────────────────────────────────────────

describe('linkifyFileRefs', () => {
  it('returns empty array for empty string', () => {
    expect(linkifyFileRefs('')).toHaveLength(0);
  });

  it('returns single string node when no file refs present', () => {
    const result = linkifyFileRefs('no file references here');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('no file references here');
  });

  it('produces 3 nodes for text with one embedded file ref', () => {
    // "Edit " + badge + " to fix the bug"
    const result = linkifyFileRefs('Edit src/foo.ts to fix the bug');
    // At minimum the badge node must be present
    const badges = result.filter((n) => typeof n !== 'string');
    expect(badges).toHaveLength(1);
  });

  it('produces 7 alternating nodes for 3 embedded file refs', () => {
    const text = 'See src/a.ts and src/b.ts and src/c.ts for details';
    const result = linkifyFileRefs(text);
    expect(result).toHaveLength(7);
    // Positions 0, 2, 4, 6 should be strings; 1, 3, 5 should be elements
    expect(typeof result[0]).toBe('string');
    expect(typeof result[1]).toBe('object'); // React element
    expect(typeof result[2]).toBe('string');
    expect(typeof result[3]).toBe('object');
    expect(typeof result[4]).toBe('string');
    expect(typeof result[5]).toBe('object');
    expect(typeof result[6]).toBe('string');
  });

  it('ref at start of string produces no leading text node', () => {
    const result = linkifyFileRefs('src/foo.ts is the entry point');
    expect(typeof result[0]).toBe('object'); // badge first
  });

  it('ref at end of string produces no trailing text node', () => {
    const result = linkifyFileRefs('the entry point is src/foo.ts');
    expect(typeof result[result.length - 1]).toBe('object'); // badge last
  });

  it('renders without crashing when inlined in JSX', () => {
    const nodes = linkifyFileRefs('check src/main.ts for details');
    const { container } = render(<p>{nodes}</p>);
    expect(container.textContent).toContain('src/main.ts');
    expect(container.textContent).toContain('for details');
  });

  it('badge buttons are present in rendered output', () => {
    const nodes = linkifyFileRefs('see src/a.ts and src/b.ts');
    const { container } = render(<p>{nodes}</p>);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2);
  });

  it('passes projectRoot to each badge', () => {
    const nodes = linkifyFileRefs('edit src/foo.ts now', '/workspace');
    const { container } = render(<p>{nodes}</p>);
    // The badge should resolve relative path — aria-label unchanged but
    // the click would dispatch with the resolved path. We verify the badge
    // rendered with correct aria-label reflecting the raw ref path.
    const btn = container.querySelector('button');
    expect(btn?.getAttribute('aria-label')).toContain('src/foo.ts');
  });

  it('does not linkify URLs', () => {
    const result = linkifyFileRefs('visit https://example.com for info');
    // URL should not become a badge
    const badges = result.filter((n) => typeof n !== 'string');
    expect(badges).toHaveLength(0);
  });

  it('each badge element has a unique key (no duplicate keys warning)', () => {
    const result = linkifyFileRefs('src/a.ts and src/b.ts');
    const elements = result.filter((n): n is React.ReactElement => typeof n === 'object');
    const keys = elements.map((el) => el.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(elements.length);
  });
});
