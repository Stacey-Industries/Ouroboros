/**
 * FirstRunTour.test.tsx
 * Wave 38 Phase B — unit tests for FirstRunTourGate and FirstRunTour.
 *
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock useConfig ────────────────────────────────────────────────────────────

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockConfig = vi.fn();

vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => mockConfig(),
}));

// ── Mock useAnchorPosition (always centered — no DOM anchors in tests) ────────

vi.mock('./useAnchorPosition', () => ({
  useAnchorPosition: () => ({
    top: 400,
    left: 640,
    width: 0,
    height: 0,
    isCentered: true,
  }),
}));

// ── Import under test (after mocks are hoisted) ───────────────────────────────

import { FirstRunTour, FirstRunTourGate } from './FirstRunTour';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
});

// ── Helper config factories ───────────────────────────────────────────────────

function configNotCompleted(): void {
  mockConfig.mockReturnValue({
    config: { platform: { onboarding: { completed: false } } },
    isLoading: false,
    set: mockSet,
  });
}

function configCompleted(): void {
  mockConfig.mockReturnValue({
    config: { platform: { onboarding: { completed: true } } },
    isLoading: false,
    set: mockSet,
  });
}

function configLoading(): void {
  mockConfig.mockReturnValue({ config: null, isLoading: true, set: mockSet });
}

function configNoPlatform(): void {
  mockConfig.mockReturnValue({ config: {}, isLoading: false, set: mockSet });
}

// ── Gate tests ────────────────────────────────────────────────────────────────

describe('FirstRunTourGate', () => {
  it('renders tour when onboarding.completed is false', () => {
    configNotCompleted();
    render(<FirstRunTourGate />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('renders tour when platform is absent (first launch)', () => {
    configNoPlatform();
    render(<FirstRunTourGate />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('renders nothing when onboarding.completed is true', () => {
    configCompleted();
    render(<FirstRunTourGate />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders nothing while config is loading', () => {
    configLoading();
    render(<FirstRunTourGate />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// ── Tour navigation tests ─────────────────────────────────────────────────────

describe('FirstRunTour', () => {
  beforeEach(configNotCompleted);

  it('starts on step 1 (Welcome to Ouroboros)', () => {
    render(<FirstRunTour />);
    expect(screen.getByText('Welcome to Ouroboros')).toBeTruthy();
    expect(screen.getByText('1 / 5')).toBeTruthy();
  });

  it('navigates to step 2 on Next click', () => {
    render(<FirstRunTour />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Your Sessions')).toBeTruthy();
    expect(screen.getByText('2 / 5')).toBeTruthy();
  });

  it('navigates back from step 2 to step 1', () => {
    render(<FirstRunTour />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Welcome to Ouroboros')).toBeTruthy();
  });

  it('calls set with completed:true when Skip is clicked', async () => {
    render(<FirstRunTour />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(
        'platform',
        expect.objectContaining({ onboarding: expect.objectContaining({ completed: true }) }),
      );
    });
  });

  it('calls set with completed:true when Done is clicked on last step', async () => {
    render(<FirstRunTour />);
    // Advance to last step (step 5)
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    }
    expect(screen.getByText('Settings')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(
        'platform',
        expect.objectContaining({ onboarding: expect.objectContaining({ completed: true }) }),
      );
    });
  });

  it('dismisses and calls set when Escape is pressed', async () => {
    render(<FirstRunTour />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(
        'platform',
        expect.objectContaining({ onboarding: expect.objectContaining({ completed: true }) }),
      );
    });
  });

  it('hides the dialog after Skip', async () => {
    render(<FirstRunTour />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
