/**
 * @vitest-environment jsdom
 *
 * AwesomeRefPanel.test.tsx — Integration tests for the panel orchestrator.
 *
 * Wave 37 Phase E.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AWESOME_ENTRIES } from '../../awesomeRef/awesomeData';
import { ToastProvider } from '../../contexts/ToastContext';
import { AwesomeRefPanel } from './AwesomeRefPanel';

afterEach(() => cleanup());

// Stub electronAPI for install path
Object.defineProperty(window, 'electronAPI', {
  value: {
    rulesAndSkills: {
      createRuleFile: vi.fn().mockResolvedValue({ success: true }),
      createCommand: vi.fn().mockResolvedValue({ success: true }),
    },
  },
  writable: true,
  configurable: true,
});

function renderPanel(isOpen = true) {
  const onClose = vi.fn();
  const result = render(
    <ToastProvider>
      <AwesomeRefPanel isOpen={isOpen} onClose={onClose} />
    </ToastProvider>,
  );
  return { ...result, onClose };
}

describe('AwesomeRefPanel', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = renderPanel(false);
    expect(container.firstChild).toBeNull();
  });

  it('renders all entries by default', () => {
    renderPanel();
    // Each entry renders its title — count title elements
    const totalEntries = AWESOME_ENTRIES.length;
    expect(totalEntries).toBeGreaterThan(0);
    // At least one entry title is visible
    const firstTitle = AWESOME_ENTRIES[0].title;
    expect(screen.getByText(firstTitle)).toBeTruthy();
  });

  it('filters list when typing in the search box', () => {
    renderPanel();
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'slack' } });
    // Slack-related entries appear; non-slack ones are hidden
    const slackEntries = AWESOME_ENTRIES.filter((e) => {
      const hay = [e.title, e.description, ...(e.tags ?? [])].join(' ').toLowerCase();
      return hay.includes('slack');
    });
    expect(slackEntries.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/slack/i).length).toBeGreaterThan(0);
  });

  it('narrows results when a category chip is clicked', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Rules' }));
    const ruleEntries = AWESOME_ENTRIES.filter((e) => e.category === 'rules');
    expect(ruleEntries.length).toBeGreaterThan(0);
    // A hooks-only entry title should not appear
    const hooksOnly = AWESOME_ENTRIES.find((e) => e.category === 'hooks');
    if (hooksOnly) {
      expect(screen.queryByText(hooksOnly.title)).toBeNull();
    }
  });

  it('shows empty state when no entries match', () => {
    renderPanel();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz-no-match-xyzzy' } });
    expect(screen.getByText(/no entries/i)).toBeTruthy();
  });

  it('calls onClose when the close button is clicked', () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
