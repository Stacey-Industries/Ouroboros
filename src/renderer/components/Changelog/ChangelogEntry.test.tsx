/**
 * ChangelogEntry.test.tsx — smoke tests for ChangelogEntryCard.
 * Wave 38 Phase E.
 * @vitest-environment jsdom
 */
import type { ChangelogEntry } from '@renderer/generated/changelog';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChangelogEntryCard } from './ChangelogEntry';

afterEach(cleanup);

const baseEntry: ChangelogEntry = {
  version: '2.4.1',
  date: '2026-04-17',
  added: ['New feature A', 'New feature B'],
  changed: ['Improved X'],
  fixed: ['Bug Y'],
  removed: ['Legacy Z'],
};

describe('ChangelogEntryCard', () => {
  it('renders version and date', () => {
    render(<ChangelogEntryCard entry={baseEntry} />);
    expect(screen.getByText('v2.4.1')).toBeDefined();
    expect(screen.getByText('2026-04-17')).toBeDefined();
  });

  it('renders Added items', () => {
    render(<ChangelogEntryCard entry={baseEntry} />);
    expect(screen.getByText('New feature A')).toBeDefined();
    expect(screen.getByText('New feature B')).toBeDefined();
  });

  it('renders Changed, Fixed, Removed sections', () => {
    const { container } = render(<ChangelogEntryCard entry={baseEntry} />);
    expect(container.textContent).toContain('Improved X');
    expect(container.textContent).toContain('Bug Y');
    expect(container.textContent).toContain('Legacy Z');
  });

  it('omits section labels when arrays are empty', () => {
    const sparse: ChangelogEntry = { version: '1.0.0', added: ['Only thing'] };
    const { container } = render(<ChangelogEntryCard entry={sparse} />);
    expect(container.textContent).not.toContain('Changed');
    expect(container.textContent).not.toContain('Fixed');
    expect(container.textContent).not.toContain('Removed');
  });

  it('omits date when not provided', () => {
    const noDate: ChangelogEntry = { version: '1.0.0', added: ['A'] };
    const { container } = render(<ChangelogEntryCard entry={noDate} />);
    expect(container.querySelectorAll('.font-mono').length).toBe(1);
  });
});
