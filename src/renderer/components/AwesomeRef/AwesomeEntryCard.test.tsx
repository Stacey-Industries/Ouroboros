/**
 * @vitest-environment jsdom
 *
 * AwesomeEntryCard.test.tsx — Unit tests for the entry card component.
 *
 * Wave 37 Phase E.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AwesomeEntry } from '../../awesomeRef/awesomeData';
import { AwesomeEntryCard } from './AwesomeEntryCard';

afterEach(() => cleanup());

const baseEntry: AwesomeEntry = {
  id: 'test-entry',
  category: 'rules',
  title: 'Test Rule',
  description: 'A test rule entry.',
  author: 'test-author',
  content: 'rule content here',
  tags: ['test', 'rule'],
};

const entryWithInstall: AwesomeEntry = {
  ...baseEntry,
  id: 'test-entry-install',
  installAction: { kind: 'rule', payload: { scope: 'global', name: 'test-rule', content: '' } },
};

describe('AwesomeEntryCard', () => {
  it('renders title and description', () => {
    render(<AwesomeEntryCard entry={baseEntry} onInstall={vi.fn()} />);
    expect(screen.getByText('Test Rule')).toBeTruthy();
    expect(screen.getByText('A test rule entry.')).toBeTruthy();
  });

  it('renders author when present', () => {
    render(<AwesomeEntryCard entry={baseEntry} onInstall={vi.fn()} />);
    expect(screen.getByText('test-author')).toBeTruthy();
  });

  it('renders category badge', () => {
    render(<AwesomeEntryCard entry={baseEntry} onInstall={vi.fn()} />);
    expect(screen.getByText('rules')).toBeTruthy();
  });

  it('shows copy button', () => {
    render(<AwesomeEntryCard entry={baseEntry} onInstall={vi.fn()} />);
    expect(screen.getByRole('button', { name: /copy/i })).toBeTruthy();
  });

  it('calls clipboard writeText on copy click', async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeMock },
      writable: true,
      configurable: true,
    });

    render(<AwesomeEntryCard entry={baseEntry} onInstall={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(writeMock).toHaveBeenCalledWith(baseEntry.content);
  });

  it('does NOT show install button when installAction is absent', () => {
    render(<AwesomeEntryCard entry={baseEntry} onInstall={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /install/i })).toBeNull();
  });

  it('shows install button when installAction is present', () => {
    render(<AwesomeEntryCard entry={entryWithInstall} onInstall={vi.fn()} />);
    expect(screen.getByRole('button', { name: /install/i })).toBeTruthy();
  });

  it('calls onInstall with the entry when install button clicked', () => {
    const onInstall = vi.fn();
    render(<AwesomeEntryCard entry={entryWithInstall} onInstall={onInstall} />);
    fireEvent.click(screen.getByRole('button', { name: /install/i }));
    expect(onInstall).toHaveBeenCalledWith(entryWithInstall);
  });

  it('shows hook manual-placement note for hook installAction', () => {
    const hookEntry: AwesomeEntry = {
      ...baseEntry,
      category: 'hooks',
      installAction: { kind: 'hook', payload: { eventType: 'PostToolUse' } },
    };
    render(<AwesomeEntryCard entry={hookEntry} onInstall={vi.fn()} />);
    // Hook entries show instructions button, not a direct install
    expect(screen.getByRole('button', { name: /how to install/i })).toBeTruthy();
  });
});
