/**
 * ResearchIndicator.test.tsx — Smoke tests for the ambient research indicator.
 *
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ResearchIndicator } from './ResearchIndicator';

afterEach(cleanup);

describe('ResearchIndicator', () => {
  it('renders without crashing', () => {
    render(<ResearchIndicator topic="next.js" />);
    expect(screen.getByTestId('research-indicator')).toBeTruthy();
  });

  it('displays the topic text', () => {
    render(<ResearchIndicator topic="prisma relations" />);
    expect(screen.getByText('prisma relations')).toBeTruthy();
  });

  it('shows a "Researching" label', () => {
    render(<ResearchIndicator topic="react hooks" />);
    const el = screen.getByTestId('research-indicator');
    expect(el.textContent).toMatch(/researching/i);
  });

  it('updates when topic prop changes', () => {
    const { rerender } = render(<ResearchIndicator topic="first topic" />);
    expect(screen.getByText('first topic')).toBeTruthy();
    rerender(<ResearchIndicator topic="second topic" />);
    expect(screen.getByText('second topic')).toBeTruthy();
  });
});
