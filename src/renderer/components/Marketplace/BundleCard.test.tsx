/**
 * @vitest-environment jsdom
 *
 * BundleCard.test.tsx — unit tests for the marketplace bundle row component.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BundleManifestEntry } from '../../types/electron-marketplace';
import { BundleCard } from './BundleCard';

afterEach(() => cleanup());

function makeEntry(overrides: Partial<BundleManifestEntry> = {}): BundleManifestEntry {
  return {
    id: 'test-bundle',
    title: 'Test Bundle',
    description: 'A test bundle description',
    author: 'Test Author',
    kind: 'theme',
    version: '1.2.3',
    signature: 'sig==',
    downloadUrl: 'https://example.com/test-bundle.json',
    ...overrides,
  };
}

describe('BundleCard — rendering', () => {
  it('renders the bundle title', () => {
    render(<BundleCard entry={makeEntry()} onInstall={vi.fn()} />);
    expect(screen.getByText('Test Bundle')).toBeDefined();
  });

  it('renders the author', () => {
    render(<BundleCard entry={makeEntry()} onInstall={vi.fn()} />);
    expect(screen.getByText('Test Author')).toBeDefined();
  });

  it('renders the kind badge', () => {
    render(<BundleCard entry={makeEntry({ kind: 'theme' })} onInstall={vi.fn()} />);
    expect(screen.getByText('theme')).toBeDefined();
  });

  it('renders the version', () => {
    render(<BundleCard entry={makeEntry({ version: '2.0.0' })} onInstall={vi.fn()} />);
    expect(screen.getByText('v2.0.0')).toBeDefined();
  });

  it('renders the description', () => {
    render(<BundleCard entry={makeEntry({ description: 'Great theme' })} onInstall={vi.fn()} />);
    expect(screen.getByText('Great theme')).toBeDefined();
  });

  it('renders an Install button', () => {
    render(<BundleCard entry={makeEntry()} onInstall={vi.fn()} />);
    expect(screen.getByRole('button', { name: /install/i })).toBeDefined();
  });

  it('renders prompt kind badge for prompt bundles', () => {
    render(<BundleCard entry={makeEntry({ kind: 'prompt' })} onInstall={vi.fn()} />);
    expect(screen.getByText('prompt')).toBeDefined();
  });

  it('renders rules-and-skills kind badge', () => {
    render(<BundleCard entry={makeEntry({ kind: 'rules-and-skills' })} onInstall={vi.fn()} />);
    expect(screen.getByText('rules-and-skills')).toBeDefined();
  });
});

describe('BundleCard — install interaction', () => {
  it('calls onInstall with the correct id and title on click', async () => {
    const onInstall = vi.fn().mockResolvedValue(undefined);
    render(<BundleCard entry={makeEntry()} onInstall={onInstall} />);

    fireEvent.click(screen.getByRole('button', { name: /install/i }));

    await waitFor(() => {
      expect(onInstall).toHaveBeenCalledWith('test-bundle', 'Test Bundle');
    });
  });

  it('shows Installing… and disables button while installing', async () => {
    let resolve!: () => void;
    const onInstall = vi.fn().mockReturnValue(new Promise<void>((r) => { resolve = r; }));

    render(<BundleCard entry={makeEntry()} onInstall={onInstall} />);
    fireEvent.click(screen.getByRole('button', { name: /install/i }));

    await waitFor(() => {
      const btn = screen.getByRole('button');
      expect(btn.textContent).toContain('Installing');
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });

    resolve();
    await waitFor(() => {
      expect(screen.getByRole('button').textContent).toContain('Install');
    });
  });

  it('re-enables button after install completes', async () => {
    const onInstall = vi.fn().mockResolvedValue(undefined);
    render(<BundleCard entry={makeEntry()} onInstall={onInstall} />);
    fireEvent.click(screen.getByRole('button', { name: /install/i }));

    await waitFor(() => {
      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('re-enables button even when onInstall rejects', async () => {
    const onInstall = vi.fn().mockRejectedValue(new Error('fail'));
    render(<BundleCard entry={makeEntry()} onInstall={onInstall} />);
    fireEvent.click(screen.getByRole('button', { name: /install/i }));

    await waitFor(() => {
      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
    });
  });
});
