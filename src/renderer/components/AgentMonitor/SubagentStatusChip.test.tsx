/**
 * SubagentStatusChip.test.tsx — Unit tests for SubagentStatusChip.
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SubagentStatusChip } from './SubagentStatusChip';

afterEach(() => cleanup());

describe('SubagentStatusChip — labels', () => {
  it('renders "running" label for running status', () => {
    render(<SubagentStatusChip status="running" />);
    expect(screen.getByText('running')).toBeTruthy();
  });

  it('renders "completed" label for completed status', () => {
    render(<SubagentStatusChip status="completed" />);
    expect(screen.getByText('completed')).toBeTruthy();
  });

  it('renders "cancelled" label for cancelled status', () => {
    render(<SubagentStatusChip status="cancelled" />);
    expect(screen.getByText('cancelled')).toBeTruthy();
  });

  it('renders "failed" label for failed status', () => {
    render(<SubagentStatusChip status="failed" />);
    expect(screen.getByText('failed')).toBeTruthy();
  });
});

describe('SubagentStatusChip — aria-label', () => {
  it('has aria-label containing the status', () => {
    render(<SubagentStatusChip status="running" />);
    const chip = screen.getByLabelText(/status: running/i);
    expect(chip).toBeTruthy();
  });

  it('has aria-label for completed', () => {
    render(<SubagentStatusChip status="completed" />);
    expect(screen.getByLabelText(/status: completed/i)).toBeTruthy();
  });

  it('has aria-label for failed', () => {
    render(<SubagentStatusChip status="failed" />);
    expect(screen.getByLabelText(/status: failed/i)).toBeTruthy();
  });
});

describe('SubagentStatusChip — styling', () => {
  it('applies success-subtle class for completed', () => {
    render(<SubagentStatusChip status="completed" />);
    const chip = screen.getByText('completed');
    expect(chip.className).toContain('bg-status-success-subtle');
  });

  it('applies error-subtle class for failed', () => {
    render(<SubagentStatusChip status="failed" />);
    const chip = screen.getByText('failed');
    expect(chip.className).toContain('bg-status-error-subtle');
  });

  it('applies warning-subtle class for cancelled', () => {
    render(<SubagentStatusChip status="cancelled" />);
    const chip = screen.getByText('cancelled');
    expect(chip.className).toContain('bg-status-warning-subtle');
  });
});
