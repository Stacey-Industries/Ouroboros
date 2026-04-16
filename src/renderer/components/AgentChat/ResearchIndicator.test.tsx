/**
 * ResearchIndicator.test.tsx — Smoke tests for the ambient research indicator.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

  it('renders the spinner element', () => {
    render(<ResearchIndicator topic="tailwind" />);
    expect(screen.getByTestId('research-spinner')).toBeTruthy();
  });

  it('renders a Cancel button', () => {
    render(<ResearchIndicator topic="react" />);
    expect(screen.getByTestId('research-cancel-btn')).toBeTruthy();
  });

  it('calls onCancel prop and fires DOM event when Cancel is clicked', () => {
    const onCancel = vi.fn();
    const dispatched: Event[] = [];
    window.addEventListener('agent-ide:cancel-research', (e) => dispatched.push(e));

    render(<ResearchIndicator topic="react" onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('research-cancel-btn'));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe('agent-ide:cancel-research');
  });

  it('fires DOM cancel event even without onCancel prop', () => {
    const dispatched: Event[] = [];
    window.addEventListener('agent-ide:cancel-research', (e) => dispatched.push(e));

    render(<ResearchIndicator topic="prisma" />);
    fireEvent.click(screen.getByTestId('research-cancel-btn'));

    expect(dispatched).toHaveLength(1);
  });
});
