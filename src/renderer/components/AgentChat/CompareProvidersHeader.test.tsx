/**
 * CompareProvidersHeader.test.tsx — Wave 36 Phase F
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CompareProvidersHeader } from './CompareProvidersHeader';

afterEach(cleanup);

const PROVIDERS = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini' },
];

describe('CompareProvidersHeader', () => {
  it('renders prompt input', () => {
    render(
      <CompareProvidersHeader
        prompt=""
        onPromptChange={vi.fn()}
        providerIdA=""
        providerIdB=""
        onProviderAChange={vi.fn()}
        onProviderBChange={vi.fn()}
        providers={PROVIDERS}
        isRunning={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText(/prompt/i)).toBeTruthy();
  });

  it('disables Run button when prompt is empty', () => {
    render(
      <CompareProvidersHeader
        prompt=""
        onPromptChange={vi.fn()}
        providerIdA="claude"
        providerIdB="codex"
        onProviderAChange={vi.fn()}
        onProviderBChange={vi.fn()}
        providers={PROVIDERS}
        isRunning={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const runBtn = screen.getByRole('button', { name: /run/i });
    expect(runBtn.hasAttribute('disabled')).toBe(true);
  });

  it('disables Run button when provider A is not selected', () => {
    render(
      <CompareProvidersHeader
        prompt="test prompt"
        onPromptChange={vi.fn()}
        providerIdA=""
        providerIdB="codex"
        onProviderAChange={vi.fn()}
        onProviderBChange={vi.fn()}
        providers={PROVIDERS}
        isRunning={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const runBtn = screen.getByRole('button', { name: /run/i });
    expect(runBtn.hasAttribute('disabled')).toBe(true);
  });

  it('disables Run button when provider B is not selected', () => {
    render(
      <CompareProvidersHeader
        prompt="test prompt"
        onPromptChange={vi.fn()}
        providerIdA="claude"
        providerIdB=""
        onProviderAChange={vi.fn()}
        onProviderBChange={vi.fn()}
        providers={PROVIDERS}
        isRunning={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const runBtn = screen.getByRole('button', { name: /run/i });
    expect(runBtn.hasAttribute('disabled')).toBe(true);
  });

  it('enables Run button when prompt and both providers are set', () => {
    render(
      <CompareProvidersHeader
        prompt="hello"
        onPromptChange={vi.fn()}
        providerIdA="claude"
        providerIdB="codex"
        onProviderAChange={vi.fn()}
        onProviderBChange={vi.fn()}
        providers={PROVIDERS}
        isRunning={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const runBtn = screen.getByRole('button', { name: /run/i });
    expect(runBtn.hasAttribute('disabled')).toBe(false);
  });

  it('calls onRun when Run button is clicked', () => {
    const onRun = vi.fn();
    render(
      <CompareProvidersHeader
        prompt="hello"
        onPromptChange={vi.fn()}
        providerIdA="claude"
        providerIdB="codex"
        onProviderAChange={vi.fn()}
        onProviderBChange={vi.fn()}
        providers={PROVIDERS}
        isRunning={false}
        onRun={onRun}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('shows Cancel button while running', () => {
    render(
      <CompareProvidersHeader
        prompt="hello"
        onPromptChange={vi.fn()}
        providerIdA="claude"
        providerIdB="codex"
        onProviderAChange={vi.fn()}
        onProviderBChange={vi.fn()}
        providers={PROVIDERS}
        isRunning={true}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(
      <CompareProvidersHeader
        prompt="hello"
        onPromptChange={vi.fn()}
        providerIdA="claude"
        providerIdB="codex"
        onProviderAChange={vi.fn()}
        onProviderBChange={vi.fn()}
        providers={PROVIDERS}
        isRunning={true}
        onRun={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders provider dropdowns for A and B', () => {
    render(
      <CompareProvidersHeader
        prompt=""
        onPromptChange={vi.fn()}
        providerIdA=""
        providerIdB=""
        onProviderAChange={vi.fn()}
        onProviderBChange={vi.fn()}
        providers={PROVIDERS}
        isRunning={false}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBe(2);
  });
});
