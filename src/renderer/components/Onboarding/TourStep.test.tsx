/**
 * TourStep.test.tsx
 * Wave 38 Phase B — unit tests for TourStep positioned overlay.
 *
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TourStep } from './TourStep';
import type { AnchorRect } from './useAnchorPosition';

afterEach(cleanup);

const anchoredRect: AnchorRect = {
  top: 100,
  left: 50,
  width: 200,
  height: 40,
  isCentered: false,
};

const centeredRect: AnchorRect = {
  top: 400,
  left: 640,
  width: 0,
  height: 0,
  isCentered: true,
};

const baseProps = {
  stepIndex: 0,
  totalSteps: 5,
  onNext: vi.fn(),
  onBack: vi.fn(),
  onSkip: vi.fn(),
  onDone: vi.fn(),
};

describe('TourStep', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
  });

  it('renders dialog role with step label', () => {
    render(<TourStep {...baseProps} anchorRect={anchoredRect} />);
    expect(screen.getByRole('dialog', { name: /Tour step 1 of 5/i })).toBeTruthy();
  });

  it('renders step content (title from i18n)', () => {
    render(<TourStep {...baseProps} anchorRect={anchoredRect} />);
    expect(screen.getByText('Welcome to Ouroboros')).toBeTruthy();
  });

  it('renders with centered rect without throwing', () => {
    render(<TourStep {...baseProps} anchorRect={centeredRect} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('positions card as fixed element', () => {
    const { container } = render(<TourStep {...baseProps} anchorRect={anchoredRect} />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.position).toBe('fixed');
  });

  it('uses high z-index', () => {
    const { container } = render(<TourStep {...baseProps} anchorRect={anchoredRect} />);
    const card = container.firstChild as HTMLElement;
    expect(Number(card.style.zIndex)).toBeGreaterThanOrEqual(1000);
  });

  it('passes navigation callbacks to content', async () => {
    const onNext = vi.fn();
    render(<TourStep {...baseProps} anchorRect={anchoredRect} onNext={onNext} stepIndex={1} />);
    const btn = screen.getByRole('button', { name: 'Next' });
    btn.click();
    expect(onNext).toHaveBeenCalledOnce();
  });
});
