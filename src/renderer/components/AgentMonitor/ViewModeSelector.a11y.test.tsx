/**
 * ViewModeSelector.a11y.test.tsx — axe-core accessibility smoke tests.
 * @vitest-environment jsdom
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils/axe';
import { ViewModeSelector } from './ViewModeSelector';

// ─── electronAPI stub ─────────────────────────────────────────────────────────

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { telemetry: { record: vi.fn().mockResolvedValue({ success: true }) } },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ViewModeSelector — a11y', () => {
  it('has no axe violations with verbose selected', async () => {
    const { container } = render(<ViewModeSelector value="verbose" onChange={vi.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations with normal selected', async () => {
    const { container } = render(<ViewModeSelector value="normal" onChange={vi.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe violations with summary selected', async () => {
    const { container } = render(<ViewModeSelector value="summary" onChange={vi.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
