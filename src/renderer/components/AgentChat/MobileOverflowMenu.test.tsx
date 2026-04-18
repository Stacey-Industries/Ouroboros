/**
 * @vitest-environment jsdom
 *
 * MobileOverflowMenu — smoke tests
 *
 * Covers:
 *   1. Renders null on desktop/tablet (no ⋯ button).
 *   2. Renders the ⋯ trigger button on phone.
 *   3. Tapping the trigger opens the popover listing all actions.
 *   4. Clicking an action fires the callback and closes the popover.
 *   5. Pressing Escape closes the popover.
 *   6. Tapping outside closes the popover.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('../../hooks/useViewportBreakpoint', () => ({
  useViewportBreakpoint: vi.fn(),
}));

import { useViewportBreakpoint } from '../../hooks/useViewportBreakpoint';
import { MobileOverflowMenu } from './MobileOverflowMenu';

const mockBreakpoint = useViewportBreakpoint as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ACTIONS = [
  { label: 'Copy', onClick: vi.fn() },
  { label: 'Branch', onClick: vi.fn() },
  { label: 'Delete', onClick: vi.fn(), danger: true as const },
];

describe('MobileOverflowMenu', () => {
  describe('non-phone viewports', () => {
    it('renders nothing on desktop', () => {
      mockBreakpoint.mockReturnValue('desktop');
      const { container } = render(<MobileOverflowMenu actions={ACTIONS} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing on tablet', () => {
      mockBreakpoint.mockReturnValue('tablet');
      const { container } = render(<MobileOverflowMenu actions={ACTIONS} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('phone viewport', () => {
    beforeEach(() => {
      mockBreakpoint.mockReturnValue('phone');
    });

    it('renders the ⋯ trigger button', () => {
      const { container } = render(<MobileOverflowMenu actions={ACTIONS} />);
      const btn = container.querySelector('button[aria-label="More actions"]');
      expect(btn).not.toBeNull();
    });

    it('popover is not open initially', () => {
      render(<MobileOverflowMenu actions={ACTIONS} />);
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('clicking trigger opens the popover with all action labels', async () => {
      const { container } = render(<MobileOverflowMenu actions={ACTIONS} />);
      const trigger = container.querySelector(
        'button[aria-label="More actions"]',
      ) as HTMLButtonElement;
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeDefined();
      });
      expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeDefined();
      expect(screen.getByRole('menuitem', { name: 'Branch' })).toBeDefined();
      expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeDefined();
    });

    it('clicking an action fires its callback and closes the popover', async () => {
      const onCopy = vi.fn();
      const { container } = render(
        <MobileOverflowMenu actions={[{ label: 'Copy', onClick: onCopy }]} />,
      );
      const trigger = container.querySelector(
        'button[aria-label="More actions"]',
      ) as HTMLButtonElement;
      fireEvent.click(trigger);

      await waitFor(() => screen.getByRole('menu'));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));

      expect(onCopy).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.queryByRole('menu')).toBeNull();
      });
    });

    it('pressing Escape closes the popover', async () => {
      const { container } = render(<MobileOverflowMenu actions={ACTIONS} />);
      const trigger = container.querySelector(
        'button[aria-label="More actions"]',
      ) as HTMLButtonElement;
      fireEvent.click(trigger);
      await waitFor(() => screen.getByRole('menu'));

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByRole('menu')).toBeNull();
      });
    });

    it('pointerdown outside closes the popover', async () => {
      const { container } = render(<MobileOverflowMenu actions={ACTIONS} />);
      const trigger = container.querySelector(
        'button[aria-label="More actions"]',
      ) as HTMLButtonElement;
      fireEvent.click(trigger);
      await waitFor(() => screen.getByRole('menu'));

      // Fire on a completely separate element
      const outside = document.createElement('div');
      document.body.appendChild(outside);
      fireEvent.pointerDown(outside);
      document.body.removeChild(outside);

      await waitFor(() => {
        expect(screen.queryByRole('menu')).toBeNull();
      });
    });
  });
});
