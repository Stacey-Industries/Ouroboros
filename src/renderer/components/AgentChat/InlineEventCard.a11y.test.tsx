/**
 * InlineEventCard.a11y.test.tsx — axe-core accessibility smoke tests.
 * @vitest-environment jsdom
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { axe } from '../../../test-utils/axe';
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

describe('InlineEventCard — a11y', () => {
  it('has no axe violations for pre_tool_use', async () => {
    const { container } = render(<InlineEventCard event={makeEvent({ type: 'pre_tool_use' })} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations for post_tool_use_failure', async () => {
    const { container } = render(
      <InlineEventCard event={makeEvent({ type: 'post_tool_use_failure' })} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations for notification', async () => {
    const { container } = render(<InlineEventCard event={makeEvent({ type: 'notification' })} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
