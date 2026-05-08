/**
 * FlowSearchBar.test.tsx — Render and interaction tests for FlowSearchBar.
 * @vitest-environment jsdom
 *
 * Wave 85 Phase 6. Covers:
 *   - Renders input and Search button
 *   - Submit fires resolveNaturalLanguage IPC
 *   - High-confidence result calls onResolve directly
 *   - Low-confidence result shows disambiguation dropdown
 *   - Selecting a disambiguation item calls onResolve and clears the list
 *   - Error message renders on failure
 *   - Empty input disables the submit button
 *
 * window.electronAPI.flowTracer.resolveNaturalLanguage is mocked.
 * No @testing-library/jest-dom — uses standard DOM assertions.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  FlowTracerResolveNaturalLanguageResponse,
  SymbolRef,
} from '../../../shared/types/flowTracer';
import { FlowSearchBar } from './FlowSearchBar';

// ---------------------------------------------------------------------------
// Mock window.electronAPI
// ---------------------------------------------------------------------------

const mockResolveNaturalLanguage = vi.fn<
  [string],
  Promise<FlowTracerResolveNaturalLanguageResponse>
>();

// Assign onto the existing jsdom window rather than replacing it wholesale.
// vi.stubGlobal('window', {...}) nukes document/location/etc; property assignment preserves them.
Object.defineProperty(window, 'electronAPI', {
  value: {
    flowTracer: {
      resolveNaturalLanguage: mockResolveNaturalLanguage,
    },
  },
  writable: true,
  configurable: true,
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HIGH_CONF_RESPONSE: FlowTracerResolveNaturalLanguageResponse = {
  success: true,
  result: {
    matches: [
      {
        symbol: 'handleSubmit',
        file: 'src/renderer/components/AgentChat/Composer.tsx',
        line: 42,
        confidence: 0.93,
        reason: 'Primary submit handler',
      },
    ],
    confidence: 0.93,
  },
};

const LOW_CONF_RESPONSE: FlowTracerResolveNaturalLanguageResponse = {
  success: true,
  result: {
    matches: [
      {
        symbol: 'handleSubmit',
        file: 'src/renderer/components/AgentChat/Composer.tsx',
        line: 42,
        confidence: 0.72,
        reason: 'Possibly the submit handler',
      },
      {
        symbol: 'handleSend',
        file: 'src/renderer/components/AgentChat/ChatInput.tsx',
        line: 18,
        confidence: 0.65,
        reason: 'Alternative send handler',
      },
    ],
    confidence: 0.72,
  },
};

const ERROR_RESPONSE: FlowTracerResolveNaturalLanguageResponse = {
  success: false,
  error: 'CLI subprocess failed',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderBar(onResolve?: (ep: SymbolRef) => void) {
  const handler = onResolve ?? vi.fn();
  const { container } = render(<FlowSearchBar onResolve={handler} />);
  return { handler, container };
}

function typeInSearch(text: string) {
  const input = screen.getByRole('searchbox');
  fireEvent.change(input, { target: { value: text } });
  return input;
}

function submitForm(container: HTMLElement) {
  const form = container.querySelector('form');
  if (!form) throw new Error('No <form> found in rendered output');
  fireEvent.submit(form);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => mockResolveNaturalLanguage.mockReset());
afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('FlowSearchBar — rendering', () => {
  it('renders a search input', () => {
    renderBar();
    expect(screen.getByRole('searchbox')).toBeTruthy();
  });

  it('renders a Search button', () => {
    renderBar();
    expect(screen.getByRole('button', { name: /search/i })).toBeTruthy();
  });

  it('Search button is disabled when input is empty', () => {
    renderBar();
    const btn = screen.getByRole('button', { name: /search/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('Search button is enabled when input has text', () => {
    renderBar();
    typeInSearch('send message');
    const btn = screen.getByRole('button', { name: /search/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('respects the disabled prop', () => {
    render(<FlowSearchBar onResolve={vi.fn()} disabled />);
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    const btn = screen.getByRole('button', { name: /search/i }) as HTMLButtonElement;
    expect(input.disabled).toBe(true);
    expect(btn.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Submit → high-confidence resolve
// ---------------------------------------------------------------------------

describe('FlowSearchBar — high-confidence resolve', () => {
  it('calls resolveNaturalLanguage on form submit', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(HIGH_CONF_RESPONSE);
    const { container } = renderBar();
    typeInSearch('when I send a chat message');
    submitForm(container);
    await waitFor(() =>
      expect(mockResolveNaturalLanguage).toHaveBeenCalledWith('when I send a chat message'),
    );
  });

  it('calls onResolve with top match on high-confidence result', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(HIGH_CONF_RESPONSE);
    const { handler, container } = renderBar();
    typeInSearch('send chat');
    submitForm(container);
    await waitFor(() =>
      expect(handler).toHaveBeenCalledWith({
        symbol: 'handleSubmit',
        file: 'src/renderer/components/AgentChat/Composer.tsx',
        line: 42,
      }),
    );
  });

  it('does not show disambiguation list on high-confidence result', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(HIGH_CONF_RESPONSE);
    const { container } = renderBar();
    typeInSearch('send chat');
    submitForm(container);
    await waitFor(() => expect(mockResolveNaturalLanguage).toHaveBeenCalled());
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Submit → disambiguation
// ---------------------------------------------------------------------------

describe('FlowSearchBar — disambiguation', () => {
  it('renders disambiguation list on low-confidence result', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(LOW_CONF_RESPONSE);
    const { container } = renderBar();
    typeInSearch('vague query');
    submitForm(container);
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeTruthy());
  });

  it('lists all candidate symbols in the dropdown', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(LOW_CONF_RESPONSE);
    const { container } = renderBar();
    typeInSearch('vague');
    submitForm(container);
    await waitFor(() => expect(screen.queryByText('handleSubmit')).toBeTruthy());
    expect(screen.queryByText('handleSend')).toBeTruthy();
  });

  it('calls onResolve when user picks a disambiguation option', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(LOW_CONF_RESPONSE);
    const { handler, container } = renderBar();
    typeInSearch('vague');
    submitForm(container);
    await waitFor(() => expect(screen.queryByText('handleSend')).toBeTruthy());
    fireEvent.click(screen.getByText('handleSend').closest('button')!);
    expect(handler).toHaveBeenCalledWith({
      symbol: 'handleSend',
      file: 'src/renderer/components/AgentChat/ChatInput.tsx',
      line: 18,
    });
  });

  it('hides disambiguation list after a pick', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(LOW_CONF_RESPONSE);
    const { container } = renderBar();
    typeInSearch('vague');
    submitForm(container);
    await waitFor(() => expect(screen.queryByText('handleSubmit')).toBeTruthy());
    fireEvent.click(screen.getByText('handleSubmit').closest('button')!);
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('FlowSearchBar — error state', () => {
  it('shows error message on failure response', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(ERROR_RESPONSE);
    const { container } = renderBar();
    typeInSearch('error query');
    submitForm(container);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('CLI subprocess failed');
  });

  it('clears error when user starts retyping', async () => {
    mockResolveNaturalLanguage.mockResolvedValueOnce(ERROR_RESPONSE);
    const { container } = renderBar();
    typeInSearch('error query');
    submitForm(container);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeTruthy());
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'error query more' } });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
