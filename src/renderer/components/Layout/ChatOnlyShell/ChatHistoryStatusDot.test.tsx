/**
 * @vitest-environment jsdom
 *
 * ChatHistoryStatusDot — smoke tests (Wave 44 Phase B).
 *
 * Covers:
 *  - Renders without throwing for every status value.
 *  - data-status attribute reflects current status.
 *  - Pulse class present for running/submitting/verifying; absent for others.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { AgentChatThreadStatus } from '../../../types/electron';
import { ChatHistoryStatusDot } from './ChatHistoryStatusDot';

afterEach(() => cleanup());

const ALL_STATUSES: AgentChatThreadStatus[] = [
  'idle',
  'submitting',
  'running',
  'verifying',
  'needs_review',
  'complete',
  'failed',
  'cancelled',
];

describe('ChatHistoryStatusDot', () => {
  it('renders without throwing for all statuses', () => {
    for (const status of ALL_STATUSES) {
      const { unmount } = render(<ChatHistoryStatusDot status={status} />);
      expect(screen.getByTestId('status-dot')).toBeDefined();
      unmount();
    }
  });

  it('sets data-status attribute to the current status', () => {
    render(<ChatHistoryStatusDot status="running" />);
    expect(screen.getByTestId('status-dot').getAttribute('data-status')).toBe('running');
  });

  it('applies pulse class for running status', () => {
    render(<ChatHistoryStatusDot status="running" />);
    expect(screen.getByTestId('status-dot').className).toContain('chat-status-dot--pulse');
  });

  it('applies pulse class for submitting status', () => {
    render(<ChatHistoryStatusDot status="submitting" />);
    expect(screen.getByTestId('status-dot').className).toContain('chat-status-dot--pulse');
  });

  it('applies pulse class for verifying status', () => {
    render(<ChatHistoryStatusDot status="verifying" />);
    expect(screen.getByTestId('status-dot').className).toContain('chat-status-dot--pulse');
  });

  it('does NOT apply pulse class for idle status', () => {
    render(<ChatHistoryStatusDot status="idle" />);
    expect(screen.getByTestId('status-dot').className).not.toContain('chat-status-dot--pulse');
  });

  it('does NOT apply pulse class for complete status', () => {
    render(<ChatHistoryStatusDot status="complete" />);
    expect(screen.getByTestId('status-dot').className).not.toContain('chat-status-dot--pulse');
  });

  it('does NOT apply pulse class for failed status', () => {
    render(<ChatHistoryStatusDot status="failed" />);
    expect(screen.getByTestId('status-dot').className).not.toContain('chat-status-dot--pulse');
  });

  it('does NOT apply pulse class for needs_review status', () => {
    render(<ChatHistoryStatusDot status="needs_review" />);
    expect(screen.getByTestId('status-dot').className).not.toContain('chat-status-dot--pulse');
  });

  it('is aria-hidden (purely decorative)', () => {
    render(<ChatHistoryStatusDot status="idle" />);
    expect(screen.getByTestId('status-dot').getAttribute('aria-hidden')).toBe('true');
  });
});
