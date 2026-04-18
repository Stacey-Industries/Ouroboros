/**
 * ProfileEditorProviderPicker.test.tsx
 *
 * @vitest-environment jsdom
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

// ─── electronAPI stub ─────────────────────────────────────────────────────────

function stubAvailability(map: Record<string, boolean>): void {
  Object.assign(window, {
    electronAPI: {
      providers: {
        checkAllAvailability: vi.fn().mockResolvedValue({
          success: true,
          availability: map,
        }),
      },
    },
  });
}

function stubAvailabilityFailure(): void {
  Object.assign(window, {
    electronAPI: {
      providers: {
        checkAllAvailability: vi.fn().mockRejectedValue(new Error('IPC error')),
      },
    },
  });
}

// ─── Subject ──────────────────────────────────────────────────────────────────

import { ProfileEditorProviderPicker } from './ProfileEditorProviderPicker';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProfileEditorProviderPicker', () => {
  beforeEach(() => {
    stubAvailability({ claude: true, codex: false, gemini: false });
  });

  it('renders all three provider options', () => {
    render(
      <ProfileEditorProviderPicker value="claude" onChange={vi.fn()} />,
    );
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.getByText('Gemini')).toBeTruthy();
  });

  it('marks the current value as checked', () => {
    render(
      <ProfileEditorProviderPicker value="codex" onChange={vi.fn()} />,
    );
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const codexRadio = radios.find((r) => r.value === 'codex');
    expect(codexRadio?.checked).toBe(true);
  });

  it('defaults to claude when value is undefined', () => {
    render(
      <ProfileEditorProviderPicker value={undefined} onChange={vi.fn()} />,
    );
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const claudeRadio = radios.find((r) => r.value === 'claude');
    expect(claudeRadio?.checked).toBe(true);
  });

  it('shows "available" badge for installed providers', async () => {
    stubAvailability({ claude: true, codex: false, gemini: false });
    render(
      <ProfileEditorProviderPicker value="claude" onChange={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('provider-badge-claude').textContent).toBe('available');
    });
  });

  it('shows "not installed" badge for unavailable providers', async () => {
    stubAvailability({ claude: true, codex: false, gemini: false });
    render(
      <ProfileEditorProviderPicker value="claude" onChange={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('provider-badge-codex').textContent).toBe('not installed');
    });
  });

  it('shows no badge when availability check throws', async () => {
    stubAvailabilityFailure();
    render(
      <ProfileEditorProviderPicker value="claude" onChange={vi.fn()} />,
    );
    // Give the async effect time to settle
    await waitFor(() => {
      expect(screen.queryByTestId('provider-badge-claude')).toBeNull();
    });
  });

  it('calls onChange with the selected provider id', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const onChange = vi.fn();
    render(
      <ProfileEditorProviderPicker value="claude" onChange={onChange} />,
    );
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    const codexRadio = radios.find((r) => r.value === 'codex')!;
    fireEvent.click(codexRadio);
    expect(onChange).toHaveBeenCalledWith('codex');
  });
});
