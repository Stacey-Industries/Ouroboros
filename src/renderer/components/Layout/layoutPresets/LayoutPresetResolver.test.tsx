/**
 * LayoutPresetResolver.test.tsx — provider + hook behaviour (Wave 17)
 *
 * @vitest-environment jsdom
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LayoutPresetResolverProvider, useLayoutPreset } from './LayoutPresetResolver';
import { chatPrimaryPreset, idePrimaryPreset } from './presets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TestConsumer(): React.ReactElement {
  const preset = useLayoutPreset();
  return <div data-testid="preset-id">{preset.id}</div>;
}

function renderWithProvider(props: { sessionPresetId?: string }): void {
  render(
    <LayoutPresetResolverProvider sessionPresetId={props.sessionPresetId}>
      <TestConsumer />
    </LayoutPresetResolverProvider>,
  );
}

// ---------------------------------------------------------------------------
// electronAPI mock helpers
// ---------------------------------------------------------------------------

function mockElectronAPI(config: Record<string, unknown>): void {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      config: {
        getAll: vi.fn().mockResolvedValue(config),
      },
    },
    writable: true,
    configurable: true,
  });
}

function clearElectronAPI(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).electronAPI;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LayoutPresetResolverProvider', () => {
  afterEach(() => {
    cleanup();
    clearElectronAPI();
    vi.restoreAllMocks();
  });

  it('renders children', () => {
    renderWithProvider({});
    expect(screen.getByTestId('preset-id')).toBeDefined();
  });

  it('returns ide-primary when no electronAPI is present', async () => {
    // no electronAPI → flag defaults to false → ide-primary
    clearElectronAPI();
    renderWithProvider({});
    await waitFor(() => {
      expect(screen.getByTestId('preset-id').textContent).toBe('ide-primary');
    });
  });

  it('returns ide-primary when flag is off, even if sessionPresetId is set', async () => {
    mockElectronAPI({ layout: { presets: { v2: false } } });
    renderWithProvider({ sessionPresetId: 'chat-primary' });
    await waitFor(() => {
      expect(screen.getByTestId('preset-id').textContent).toBe('ide-primary');
    });
  });

  it('returns ide-primary when flag is absent in config', async () => {
    mockElectronAPI({});
    renderWithProvider({ sessionPresetId: 'chat-primary' });
    await waitFor(() => {
      expect(screen.getByTestId('preset-id').textContent).toBe('ide-primary');
    });
  });

  it('returns ide-primary when flag is on but no sessionPresetId provided', async () => {
    mockElectronAPI({ layout: { presets: { v2: true } } });
    renderWithProvider({});
    await waitFor(() => {
      expect(screen.getByTestId('preset-id').textContent).toBe(idePrimaryPreset.id);
    });
  });

  it('resolves correct preset when flag is on and valid sessionPresetId provided', async () => {
    mockElectronAPI({ layout: { presets: { v2: true } } });
    renderWithProvider({ sessionPresetId: 'chat-primary' });
    await waitFor(() => {
      expect(screen.getByTestId('preset-id').textContent).toBe(chatPrimaryPreset.id);
    });
  });

  it('falls back to ide-primary when flag is on but sessionPresetId is unknown', async () => {
    mockElectronAPI({ layout: { presets: { v2: true } } });
    renderWithProvider({ sessionPresetId: 'nonexistent-preset' });
    await waitFor(() => {
      expect(screen.getByTestId('preset-id').textContent).toBe('ide-primary');
    });
  });

  it('falls back to ide-primary when getAll rejects', async () => {
    Object.defineProperty(window, 'electronAPI', {
      value: {
        config: { getAll: vi.fn().mockRejectedValue(new Error('ipc error')) },
      },
      writable: true,
      configurable: true,
    });
    renderWithProvider({ sessionPresetId: 'chat-primary' });
    await waitFor(() => {
      expect(screen.getByTestId('preset-id').textContent).toBe('ide-primary');
    });
  });
});

describe('useLayoutPreset (default context value)', () => {
  beforeEach(() => clearElectronAPI());
  afterEach(() => cleanup());

  it('returns ide-primary as the context default outside a provider', () => {
    // Calling the hook outside a provider returns the createContext default.
    function Bare(): React.ReactElement {
      const preset = useLayoutPreset();
      return <span data-testid="bare">{preset.id}</span>;
    }
    render(<Bare />);
    expect(screen.getByTestId('bare').textContent).toBe('ide-primary');
  });
});
