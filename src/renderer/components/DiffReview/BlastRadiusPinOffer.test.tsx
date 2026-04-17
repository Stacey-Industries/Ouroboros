/**
 * BlastRadiusPinOffer.test.tsx — smoke tests for the blast-radius caller-inclusion
 * toast/card component.
 *
 * Covers: feature-flag gate, rendering caller names, Accept/Dismiss callbacks,
 * pin-key format, maxDisplay cap, and sort-by-distance ordering.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BlastRadiusEntry } from '../../types/electron-graph';
import { BlastRadiusPinOffer } from './BlastRadiusPinOffer';

afterEach(cleanup);

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEntry(
  id: string,
  name: string,
  distance: number,
  criticality: BlastRadiusEntry['criticality'] = 'medium',
): BlastRadiusEntry {
  return {
    node: {
      id,
      type: 'function',
      name,
      filePath: `src/${name}.ts`,
      line: 10,
    },
    distance,
    criticality,
  };
}

const THREE_CALLERS: BlastRadiusEntry[] = [
  makeEntry('c1', 'callerA', 1, 'critical'),
  makeEntry('c2', 'callerB', 2, 'high'),
  makeEntry('c3', 'callerC', 3, 'low'),
];

// ── Feature-flag gate ─────────────────────────────────────────────────────────

describe('BlastRadiusPinOffer — feature flag', () => {
  it('renders null when enabled=false', () => {
    const { container } = render(
      <BlastRadiusPinOffer
        callers={THREE_CALLERS}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        enabled={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the card when enabled=true', () => {
    render(
      <BlastRadiusPinOffer
        callers={THREE_CALLERS}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        enabled={true}
      />,
    );
    expect(screen.getByText(/Also include/)).toBeTruthy();
  });
});

// ── Empty callers ─────────────────────────────────────────────────────────────

describe('BlastRadiusPinOffer — empty callers', () => {
  it('renders null when callers array is empty', () => {
    const { container } = render(
      <BlastRadiusPinOffer
        callers={[]}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        enabled={true}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ── Caller display ────────────────────────────────────────────────────────────

describe('BlastRadiusPinOffer — caller display', () => {
  it('shows each caller name', () => {
    render(
      <BlastRadiusPinOffer
        callers={THREE_CALLERS}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        enabled={true}
      />,
    );
    expect(screen.getByText('callerA')).toBeTruthy();
    expect(screen.getByText('callerB')).toBeTruthy();
    expect(screen.getByText('callerC')).toBeTruthy();
  });

  it('shows plural label for multiple callers', () => {
    render(
      <BlastRadiusPinOffer
        callers={THREE_CALLERS}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        enabled={true}
      />,
    );
    expect(screen.getByText('3 callers')).toBeTruthy();
  });

  it('shows singular label for exactly one caller', () => {
    render(
      <BlastRadiusPinOffer
        callers={[makeEntry('x', 'onlyOne', 1)]}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        enabled={true}
      />,
    );
    expect(screen.getByText('1 caller')).toBeTruthy();
  });
});

// ── maxDisplay cap ────────────────────────────────────────────────────────────

describe('BlastRadiusPinOffer — maxDisplay', () => {
  it('caps the displayed callers at maxDisplay', () => {
    render(
      <BlastRadiusPinOffer
        callers={THREE_CALLERS}
        maxDisplay={2}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        enabled={true}
      />,
    );
    expect(screen.getByText('callerA')).toBeTruthy();
    expect(screen.getByText('callerB')).toBeTruthy();
    expect(screen.queryByText('callerC')).toBeNull();
  });

  it('defaults to 3 when maxDisplay is omitted', () => {
    render(
      <BlastRadiusPinOffer
        callers={[...THREE_CALLERS, makeEntry('c4', 'callerD', 4)]}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        enabled={true}
      />,
    );
    expect(screen.getByText('callerA')).toBeTruthy();
    expect(screen.getByText('callerB')).toBeTruthy();
    expect(screen.getByText('callerC')).toBeTruthy();
    expect(screen.queryByText('callerD')).toBeNull();
  });
});

// ── Sort by distance ──────────────────────────────────────────────────────────

describe('BlastRadiusPinOffer — sort order', () => {
  it('shows callers ordered by ascending distance', () => {
    const unordered = [
      makeEntry('z', 'farAway', 5),
      makeEntry('a', 'closest', 1),
      makeEntry('m', 'middle', 3),
    ];
    render(
      <BlastRadiusPinOffer
        callers={unordered}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        enabled={true}
      />,
    );
    const items = screen.getAllByText(/d=\d+/);
    expect(items[0].textContent).toBe('d=1');
    expect(items[1].textContent).toBe('d=3');
    expect(items[2].textContent).toBe('d=5');
  });
});

// ── Accept callback ───────────────────────────────────────────────────────────

describe('BlastRadiusPinOffer — Accept', () => {
  it('calls onAccept with @symbol: pin keys when Accept is clicked', () => {
    const onAccept = vi.fn();
    render(
      <BlastRadiusPinOffer
        callers={[makeEntry('c1', 'callerA', 1)]}
        onAccept={onAccept}
        onDismiss={vi.fn()}
        enabled={true}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(onAccept).toHaveBeenCalledOnce();
    const keys: string[] = onAccept.mock.calls[0][0];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe('@symbol:src/callerA.ts::callerA::10');
  });

  it('includes all displayed callers in the pin keys', () => {
    const onAccept = vi.fn();
    render(
      <BlastRadiusPinOffer
        callers={THREE_CALLERS}
        onAccept={onAccept}
        onDismiss={vi.fn()}
        enabled={true}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    const keys: string[] = onAccept.mock.calls[0][0];
    expect(keys).toHaveLength(3);
    expect(keys[0]).toMatch(/^@symbol:src\/callerA\.ts::callerA::/);
  });
});

// ── Dismiss callbacks ─────────────────────────────────────────────────────────

describe('BlastRadiusPinOffer — Dismiss', () => {
  it('calls onDismiss when Dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <BlastRadiusPinOffer
        callers={THREE_CALLERS}
        onAccept={vi.fn()}
        onDismiss={onDismiss}
        enabled={true}
      />,
    );
    // Use exact text match to distinguish the "Dismiss" button from the × aria-label
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when the × close button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <BlastRadiusPinOffer
        callers={THREE_CALLERS}
        onAccept={vi.fn()}
        onDismiss={onDismiss}
        enabled={true}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss caller offer/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
