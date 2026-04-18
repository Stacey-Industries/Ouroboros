/**
 * TourStepContent.test.tsx
 * Wave 38 Phase B — unit tests for TourStepContent.
 *
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TourStepContent } from './TourStepContent';

afterEach(cleanup);

const baseProps = {
  totalSteps: 5,
  onNext: vi.fn(),
  onBack: vi.fn(),
  onSkip: vi.fn(),
  onDone: vi.fn(),
};

describe('TourStepContent', () => {
  it('renders i18n title and body for step 1', () => {
    render(<TourStepContent {...baseProps} stepIndex={0} />);
    expect(screen.getByText('Welcome to Ouroboros')).toBeTruthy();
    expect(screen.getByText(/AI-powered IDE/)).toBeTruthy();
  });

  it('renders i18n title and body for step 4 (command palette)', () => {
    render(<TourStepContent {...baseProps} stepIndex={3} />);
    expect(screen.getByText('Command Palette')).toBeTruthy();
    expect(screen.getByText(/Cmd\+Shift\+P/)).toBeTruthy();
  });

  it('shows Next button (not Done) on non-last step', () => {
    render(<TourStepContent {...baseProps} stepIndex={0} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('shows Done button on last step', () => {
    render(<TourStepContent {...baseProps} stepIndex={4} />);
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('hides Back button on first step', () => {
    render(<TourStepContent {...baseProps} stepIndex={0} />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('shows Back button on non-first step', () => {
    render(<TourStepContent {...baseProps} stepIndex={2} />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('calls onNext when Next is clicked', () => {
    const onNext = vi.fn();
    render(<TourStepContent {...baseProps} onNext={onNext} stepIndex={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('calls onBack when Back is clicked', () => {
    const onBack = vi.fn();
    render(<TourStepContent {...baseProps} onBack={onBack} stepIndex={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('calls onSkip when Skip tour is clicked', () => {
    const onSkip = vi.fn();
    render(<TourStepContent {...baseProps} onSkip={onSkip} stepIndex={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('calls onDone when Done is clicked on last step', () => {
    const onDone = vi.fn();
    render(<TourStepContent {...baseProps} onDone={onDone} stepIndex={4} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('shows step counter', () => {
    render(<TourStepContent {...baseProps} stepIndex={2} />);
    expect(screen.getByText('3 / 5')).toBeTruthy();
  });
});
