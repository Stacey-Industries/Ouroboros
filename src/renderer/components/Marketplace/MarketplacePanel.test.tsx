/**
 * @vitest-environment jsdom
 *
 * MarketplacePanel.test.tsx — renderer-side marketplace panel tests.
 *
 * window.electronAPI is mocked. ToastContext is provided via a lightweight stub.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mock factories ────────────────────────────────────────────────────

const { mockToast, mockListBundles, mockInstall } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockListBundles: vi.fn(),
  mockInstall: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../contexts/ToastContext', () => ({
  useToastContext: () => ({ toast: mockToast }),
}));

vi.mock('../Layout/MobileBottomSheet', () => ({
  MobileBottomSheet: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div data-testid="mobile-bottom-sheet">{children}</div> : null,
}));

// ── Subject ───────────────────────────────────────────────────────────────────

import { MarketplacePanel } from './MarketplacePanel';

// ── Window stub ───────────────────────────────────────────────────────────────

Object.defineProperty(window, 'electronAPI', {
  writable: true,
  value: {
    marketplace: {
      listBundles: (...a: unknown[]) => mockListBundles(...a),
      install: (...a: unknown[]) => mockInstall(...a),
      revokedIds: () => Promise.resolve({ ids: [] }),
    },
  },
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTRY = {
  id: 'test-theme',
  title: 'Test Theme',
  description: 'A test theme bundle',
  author: 'Author',
  kind: 'theme' as const,
  version: '1.0.0',
  signature: 'sig==',
  downloadUrl: 'https://example.com/test-theme.json',
};

// ── Setup ─────────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MarketplacePanel — closed', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <MarketplacePanel isOpen={false} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('MarketplacePanel — loading state', () => {
  beforeEach(() => {
    mockListBundles.mockReturnValue(new Promise(() => {}));
  });

  it('shows loading indicator while fetching', async () => {
    render(<MarketplacePanel isOpen onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/Loading marketplace/i)).toBeDefined();
    });
  });
});

describe('MarketplacePanel — bundle list', () => {
  beforeEach(() => {
    mockListBundles.mockResolvedValue({ success: true, bundles: [ENTRY] });
  });

  it('renders bundle title after manifest loads', async () => {
    render(<MarketplacePanel isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Test Theme')).toBeDefined());
  });

  it('renders author and kind badge', async () => {
    render(<MarketplacePanel isOpen onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Author')).toBeDefined();
      expect(screen.getByText('theme')).toBeDefined();
    });
  });

  it('calls install IPC and shows success toast on install click', async () => {
    mockInstall.mockResolvedValue({ success: true });
    render(<MarketplacePanel isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Test Theme')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /install/i }));

    await waitFor(() => {
      expect(mockInstall).toHaveBeenCalledWith({ entryId: 'test-theme' });
      expect(mockToast).toHaveBeenCalledWith(
        expect.stringContaining('installed'),
        'success',
      );
    });
  });

  it('shows signature-invalid error toast when signature rejected', async () => {
    mockInstall.mockResolvedValue({ success: false, error: 'invalid-signature' });
    render(<MarketplacePanel isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Test Theme')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /install/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.stringContaining('Signature invalid'),
        'error',
      );
    });
  });

  it('shows generic error toast for other install failures', async () => {
    mockInstall.mockResolvedValue({ success: false, error: 'rules-install-not-wired' });
    render(<MarketplacePanel isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Test Theme')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /install/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith('rules-install-not-wired', 'error');
    });
  });
});

describe('MarketplacePanel — offline state', () => {
  beforeEach(() => {
    mockListBundles.mockResolvedValue({ success: false, error: 'offline' });
  });

  it('renders offline indicator when manifest fetch fails', async () => {
    render(<MarketplacePanel isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Offline/i)).toBeDefined());
  });

  it('shows retry button when offline', async () => {
    render(<MarketplacePanel isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeDefined());
  });
});

describe('MarketplacePanel — close button', () => {
  beforeEach(() => {
    mockListBundles.mockResolvedValue({ success: true, bundles: [] });
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<MarketplacePanel isOpen onClose={onClose} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /close/i })).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
