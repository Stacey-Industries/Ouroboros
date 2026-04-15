/**
 * InlineEventCard.test.tsx — Unit tests for InlineEventCard component.
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { InlineEventCardData } from './InlineEventCard';
import { InlineEventCard } from './InlineEventCard';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<InlineEventCardData> = {}): InlineEventCardData {
  return {
    id: 'evt-1',
    type: 'pre_tool_use',
    timestamp: new Date('2026-04-15T14:30:45.000Z').getTime(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InlineEventCard — rendering', () => {
  it('renders without crashing', () => {
    const { container } = render(<InlineEventCard event={makeEvent()} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('has role=status for screen readers', () => {
    render(<InlineEventCard event={makeEvent()} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('shows the default description for pre_tool_use', () => {
    render(<InlineEventCard event={makeEvent({ type: 'pre_tool_use' })} />);
    expect(screen.getByText('Tool invoked')).toBeTruthy();
  });

  it('shows the default description for post_tool_use_failure', () => {
    render(<InlineEventCard event={makeEvent({ type: 'post_tool_use_failure' })} />);
    expect(screen.getByText('Tool failed')).toBeTruthy();
  });

  it('shows the default description for notification', () => {
    render(<InlineEventCard event={makeEvent({ type: 'notification' })} />);
    expect(screen.getByText('Agent notification')).toBeTruthy();
  });

  it('shows the default description for session_start', () => {
    render(<InlineEventCard event={makeEvent({ type: 'session_start' })} />);
    expect(screen.getByText('Session started')).toBeTruthy();
  });

  it('shows the default description for session_end', () => {
    render(<InlineEventCard event={makeEvent({ type: 'session_end' })} />);
    expect(screen.getByText('Session ended')).toBeTruthy();
  });

  it('uses custom description when provided', () => {
    render(<InlineEventCard event={makeEvent({ description: 'Custom label' })} />);
    expect(screen.getByText('Custom label')).toBeTruthy();
  });

  it('converts underscored unknown types to spaced text', () => {
    render(<InlineEventCard event={makeEvent({ type: 'some_unknown_event' })} />);
    expect(screen.getByText('some unknown event')).toBeTruthy();
  });
});

describe('InlineEventCard — timestamp', () => {
  it('renders a formatted time string', () => {
    // Use a fixed UTC+0 timestamp and check locale-independent parts
    const ts = new Date('2026-04-15T10:05:03.000Z').getTime();
    render(<InlineEventCard event={makeEvent({ timestamp: ts })} />);
    // The timestamp text should match HH:MM:SS format somewhere in the card
    const card = screen.getByRole('status');
    expect(card.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});

describe('InlineEventCard — aria-label', () => {
  it('includes event description in aria-label', () => {
    render(<InlineEventCard event={makeEvent({ type: 'notification' })} />);
    const card = screen.getByRole('status');
    expect(card.getAttribute('aria-label')).toContain('Agent notification');
  });

  it('uses custom description in aria-label when provided', () => {
    render(<InlineEventCard event={makeEvent({ description: 'My custom event' })} />);
    const card = screen.getByRole('status');
    expect(card.getAttribute('aria-label')).toContain('My custom event');
  });
});
