/**
 * ProfileDiffCard.test.tsx — Smoke tests for ProfileDiffCard.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '../../types/electron';
import { ProfileDiffCard } from './ProfileDiffCard';

afterEach(cleanup);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE: Profile = {
  id: 'p-a',
  name: 'Reviewer',
  model: 'claude-opus-4-6',
  effort: 'high',
  permissionMode: 'plan',
  enabledTools: ['Read', 'Grep', 'Glob'],
  temperature: 0.7,
  maxTokens: 4096,
  builtIn: true,
  createdAt: 0,
  updatedAt: 0,
};

const OTHER: Profile = {
  id: 'p-b',
  name: 'Scaffolder',
  model: 'claude-sonnet-4-6',
  effort: 'medium',
  permissionMode: 'normal',
  enabledTools: ['Read', 'Write', 'Edit', 'Bash'],
  temperature: 0.5,
  maxTokens: 8192,
  builtIn: false,
  createdAt: 1000,
  updatedAt: 1000,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProfileDiffCard', () => {
  it('returns null when profiles are identical', () => {
    const { container } = render(
      <ProfileDiffCard oldProfile={BASE} newProfile={BASE} onDismiss={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders profile names in the header', () => {
    render(<ProfileDiffCard oldProfile={BASE} newProfile={OTHER} onDismiss={vi.fn()} />);
    expect(screen.getByText('Reviewer')).toBeTruthy();
    expect(screen.getByText('Scaffolder')).toBeTruthy();
  });

  it('shows model diff row when models differ', () => {
    render(<ProfileDiffCard oldProfile={BASE} newProfile={OTHER} onDismiss={vi.fn()} />);
    expect(screen.getByText('Model')).toBeTruthy();
    expect(screen.getByText('claude-opus-4-6')).toBeTruthy();
    expect(screen.getByText('claude-sonnet-4-6')).toBeTruthy();
  });

  it('shows effort diff row when effort differs', () => {
    render(<ProfileDiffCard oldProfile={BASE} newProfile={OTHER} onDismiss={vi.fn()} />);
    expect(screen.getByText('Effort')).toBeTruthy();
    expect(screen.getByText('high')).toBeTruthy();
    expect(screen.getByText('medium')).toBeTruthy();
  });

  it('shows permission diff row when permission mode differs', () => {
    render(<ProfileDiffCard oldProfile={BASE} newProfile={OTHER} onDismiss={vi.fn()} />);
    expect(screen.getByText('Permission')).toBeTruthy();
    expect(screen.getByText('plan')).toBeTruthy();
    expect(screen.getByText('normal')).toBeTruthy();
  });

  it('shows tools-added row for new tools', () => {
    // OTHER adds Write, Edit, Bash; removes Grep, Glob
    render(<ProfileDiffCard oldProfile={BASE} newProfile={OTHER} onDismiss={vi.fn()} />);
    expect(screen.getByText('Tools added')).toBeTruthy();
  });

  it('shows tools-removed row for removed tools', () => {
    render(<ProfileDiffCard oldProfile={BASE} newProfile={OTHER} onDismiss={vi.fn()} />);
    expect(screen.getByText('Tools removed')).toBeTruthy();
  });

  it('shows temperature diff when it changes', () => {
    render(<ProfileDiffCard oldProfile={BASE} newProfile={OTHER} onDismiss={vi.fn()} />);
    expect(screen.getByText('Temperature')).toBeTruthy();
    expect(screen.getByText('0.7')).toBeTruthy();
    expect(screen.getByText('0.5')).toBeTruthy();
  });

  it('shows maxTokens diff when it changes', () => {
    render(<ProfileDiffCard oldProfile={BASE} newProfile={OTHER} onDismiss={vi.fn()} />);
    expect(screen.getByText('Max tokens')).toBeTruthy();
    expect(screen.getByText('4096')).toBeTruthy();
    expect(screen.getByText('8192')).toBeTruthy();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<ProfileDiffCard oldProfile={BASE} newProfile={OTHER} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss profile diff'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('omits unchanged fields', () => {
    const sameModel: Profile = { ...OTHER, model: BASE.model };
    render(<ProfileDiffCard oldProfile={BASE} newProfile={sameModel} onDismiss={vi.fn()} />);
    // Model row should not appear since model is same
    expect(screen.queryByText('Model')).toBeNull();
  });

  it('renders MCP added row when new MCP servers are added', () => {
    const withMcp: Profile = { ...OTHER, mcpServers: ['github'] };
    render(<ProfileDiffCard oldProfile={BASE} newProfile={withMcp} onDismiss={vi.fn()} />);
    expect(screen.getByText('MCP added')).toBeTruthy();
    expect(screen.getByText('github')).toBeTruthy();
  });
});
