/**
 * ThreadSearchModal.test.tsx
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThreadSearchModal } from './ThreadSearchModal';

// ── electronAPI mock ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'electronAPI', {
    value: {
      agentChat: {
        searchThreads: vi.fn().mockResolvedValue({ success: true, results: [] }),
      },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function dispatchOpenSearch(): void {
  window.dispatchEvent(new CustomEvent('agent-ide:open-thread-search'));
}

function dispatchOpenThread(threadId = 't1'): void {
  window.dispatchEvent(new CustomEvent('agent-ide:open-thread', { detail: { threadId } }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ThreadSearchModal', () => {
  describe('visibility', () => {
    it('renders nothing when closed', () => {
      const { container } = render(<ThreadSearchModal />);
      expect(container.firstChild).toBeNull();
    });

    it('opens when agent-ide:open-thread-search is dispatched', () => {
      render(<ThreadSearchModal />);
      act(() => dispatchOpenSearch());
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('shows the search input when open', () => {
      render(<ThreadSearchModal />);
      act(() => dispatchOpenSearch());
      expect(screen.getByPlaceholderText('Search threads...')).toBeTruthy();
    });

    it('closes when Escape is pressed in the input', () => {
      render(<ThreadSearchModal />);
      act(() => dispatchOpenSearch());
      const input = screen.getByPlaceholderText('Search threads...');
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes when backdrop is clicked', () => {
      render(<ThreadSearchModal />);
      act(() => dispatchOpenSearch());
      // The backdrop is the first child of the dialog — aria-hidden div
      const dialog = screen.getByRole('dialog');
      const backdrop = dialog.querySelector('[aria-hidden="true"]');
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop!);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes when agent-ide:open-thread fires', () => {
      render(<ThreadSearchModal />);
      act(() => dispatchOpenSearch());
      expect(screen.getByRole('dialog')).toBeTruthy();
      act(() => dispatchOpenThread());
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('toggle behaviour', () => {
    it('can be opened and closed multiple times', () => {
      render(<ThreadSearchModal />);

      act(() => dispatchOpenSearch());
      expect(screen.getByRole('dialog')).toBeTruthy();

      act(() => dispatchOpenThread());
      expect(screen.queryByRole('dialog')).toBeNull();

      act(() => dispatchOpenSearch());
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('has role=dialog and aria-modal=true when open', () => {
      render(<ThreadSearchModal />);
      act(() => dispatchOpenSearch());
      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
    });

    it('has accessible label when open', () => {
      render(<ThreadSearchModal />);
      act(() => dispatchOpenSearch());
      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-label')).toBeTruthy();
    });
  });

  describe('cleanup', () => {
    it('removes event listeners on unmount', () => {
      const { unmount } = render(<ThreadSearchModal />);
      unmount();
      // Dispatching after unmount should not throw
      expect(() => act(() => dispatchOpenSearch())).not.toThrow();
    });
  });
});
