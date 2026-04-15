/**
 * @vitest-environment jsdom
 *
 * InspectorDecisionTab.test.tsx — Smoke tests for the Wave 24 scaffold.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InspectorDecisionTab } from './InspectorDecisionTab';

describe('InspectorDecisionTab', () => {
  it('renders the Wave 24 placeholder message', () => {
    render(<InspectorDecisionTab />);
    expect(screen.getByText(/Context decisions available in Wave 24/i)).toBeTruthy();
  });

  it('renders without crashing', () => {
    const { container } = render(<InspectorDecisionTab />);
    expect(container.firstChild).toBeTruthy();
  });
});
