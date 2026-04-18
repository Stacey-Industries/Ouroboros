/**
 * @vitest-environment jsdom
 *
 * DispatchBadge.test.tsx — Wave 34 Phase D.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

import type { DispatchJob } from '../../types/electron-dispatch';
import { DispatchBadge } from './DispatchBadge';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<DispatchJob> = {}): DispatchJob {
  return {
    id: 'job-1',
    status: 'queued',
    createdAt: '2026-04-17T00:00:00.000Z',
    request: { title: 'Deploy task', prompt: 'Deploy it', projectPath: '/projects/foo' },
    sessionId: 'pty-abc',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DispatchBadge', () => {
  it('renders nothing when no job matches sessionId', () => {
    const { container } = render(
      <DispatchBadge sessionId="pty-xyz" jobs={[makeJob({ sessionId: 'pty-abc' })]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when jobs list is empty', () => {
    const { container } = render(<DispatchBadge sessionId="pty-abc" jobs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Dispatched pill for queued status', () => {
    render(<DispatchBadge sessionId="pty-abc" jobs={[makeJob({ status: 'queued' })]} />);
    expect(screen.getByText('Dispatched')).toBeDefined();
  });

  it('renders Running pill for running status', () => {
    render(<DispatchBadge sessionId="pty-abc" jobs={[makeJob({ status: 'running' })]} />);
    expect(screen.getByText('Running')).toBeDefined();
  });

  it('renders Starting pill for starting status', () => {
    render(<DispatchBadge sessionId="pty-abc" jobs={[makeJob({ status: 'starting' })]} />);
    expect(screen.getByText('Starting')).toBeDefined();
  });

  it('renders Done pill for completed status', () => {
    render(<DispatchBadge sessionId="pty-abc" jobs={[makeJob({ status: 'completed' })]} />);
    expect(screen.getByText('Done')).toBeDefined();
  });

  it('renders Failed pill for failed status with error variant classes', () => {
    render(<DispatchBadge sessionId="pty-abc" jobs={[makeJob({ status: 'failed' })]} />);
    const badge = screen.getByText('Failed');
    expect(badge).toBeDefined();
    expect(badge.className).toContain('text-status-error');
  });

  it('renders Canceled pill for canceled status with error variant classes', () => {
    render(<DispatchBadge sessionId="pty-abc" jobs={[makeJob({ status: 'canceled' })]} />);
    const badge = screen.getByText('Canceled');
    expect(badge).toBeDefined();
    expect(badge.className).toContain('text-status-error');
  });

  it('applies accent-subtle classes for dispatched variant', () => {
    render(<DispatchBadge sessionId="pty-abc" jobs={[makeJob({ status: 'queued' })]} />);
    const badge = screen.getByText('Dispatched');
    expect(badge.className).toContain('bg-interactive-accent-subtle');
    expect(badge.className).toContain('text-interactive-accent');
  });

  it('shows job title in tooltip', () => {
    render(<DispatchBadge sessionId="pty-abc" jobs={[makeJob({ status: 'queued' })]} />);
    const badge = screen.getByText('Dispatched');
    expect(badge.getAttribute('title')).toContain('Deploy task');
  });

  it('matches the first job with matching sessionId when multiple jobs present', () => {
    const jobs = [
      makeJob({ id: 'job-1', sessionId: 'pty-other', status: 'failed' }),
      makeJob({ id: 'job-2', sessionId: 'pty-abc', status: 'completed' }),
    ];
    render(<DispatchBadge sessionId="pty-abc" jobs={jobs} />);
    expect(screen.getByText('Done')).toBeDefined();
    expect(screen.queryByText('Failed')).toBeNull();
  });
});
