/**
 * @vitest-environment jsdom
 *
 * RulesTabToggle.test.tsx — Smoke tests for the rule-toggle helper components.
 *
 * Verifies:
 *   - RuleRowToggle renders with correct role/aria-checked for enabled/disabled state.
 *   - RuleRowToggle calls onToggle when clicked.
 *   - DisabledPill renders the label text.
 *   - RestoreAllButton renders and fires callback on click.
 *   - hasAnyDisabled returns correct boolean for mixed rule arrays.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DisabledPill, hasAnyDisabled, RestoreAllButton, RuleRowToggle } from './RulesTabToggle';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── RuleRowToggle ─────────────────────────────────────────────────────────────

describe('RuleRowToggle — enabled state', () => {
  it('renders a switch button with aria-checked=true when enabled', () => {
    render(<RuleRowToggle enabled onToggle={() => undefined} />);
    const btn = screen.getByRole('switch');
    expect(btn.getAttribute('aria-checked')).toBe('true');
  });

  it('has aria-label indicating disable action when enabled', () => {
    render(<RuleRowToggle enabled onToggle={() => undefined} />);
    expect(screen.getByRole('switch').getAttribute('aria-label')).toBe('Disable rule');
  });
});

describe('RuleRowToggle — disabled state', () => {
  it('renders a switch button with aria-checked=false when not enabled', () => {
    render(<RuleRowToggle enabled={false} onToggle={() => undefined} />);
    const btn = screen.getByRole('switch');
    expect(btn.getAttribute('aria-checked')).toBe('false');
  });

  it('has aria-label indicating enable action when disabled', () => {
    render(<RuleRowToggle enabled={false} onToggle={() => undefined} />);
    expect(screen.getByRole('switch').getAttribute('aria-label')).toBe('Enable rule');
  });
});

describe('RuleRowToggle — interaction', () => {
  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<RuleRowToggle enabled onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

// ── DisabledPill ──────────────────────────────────────────────────────────────

describe('DisabledPill', () => {
  it('renders the "off this session" label', () => {
    render(<DisabledPill />);
    expect(screen.getByText('off this session')).toBeDefined();
  });
});

// ── RestoreAllButton ──────────────────────────────────────────────────────────

describe('RestoreAllButton', () => {
  it('renders a button with "Restore all" text', () => {
    render(<RestoreAllButton onRestore={() => undefined} />);
    expect(screen.getByRole('button', { name: /restore all/i })).toBeDefined();
  });

  it('calls onRestore when clicked', () => {
    const onRestore = vi.fn();
    render(<RestoreAllButton onRestore={onRestore} />);
    fireEvent.click(screen.getByRole('button', { name: /restore all/i }));
    expect(onRestore).toHaveBeenCalledOnce();
  });
});

// ── hasAnyDisabled ────────────────────────────────────────────────────────────

describe('hasAnyDisabled', () => {
  const base = { scope: 'global' as const, filePath: '/f', content: '', description: '' };

  it('returns false for an empty array', () => {
    expect(hasAnyDisabled([])).toBe(false);
  });

  it('returns false when no rules are disabled', () => {
    expect(
      hasAnyDisabled([
        { ...base, id: 'a', disabled: false },
        { ...base, id: 'b' },
      ]),
    ).toBe(false);
  });

  it('returns true when at least one rule has disabled=true', () => {
    expect(
      hasAnyDisabled([
        { ...base, id: 'a' },
        { ...base, id: 'b', disabled: true },
      ]),
    ).toBe(true);
  });

  it('treats undefined disabled as not disabled', () => {
    expect(hasAnyDisabled([{ ...base, id: 'a', disabled: undefined }])).toBe(false);
  });
});
