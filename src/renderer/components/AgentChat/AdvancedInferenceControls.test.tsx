/**
 * @vitest-environment jsdom
 *
 * AdvancedInferenceControls.test.tsx — Unit tests for the advanced inference controls panel.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdvancedInferenceControls } from './AdvancedInferenceControls';
import type { ChatOverrides } from './ChatControlsBar';

afterEach(cleanup);

const BASE_OVERRIDES: ChatOverrides = {
  model: 'claude-sonnet-4-6',
  effort: 'medium',
  permissionMode: 'default',
};

describe('AdvancedInferenceControls', () => {
  it('renders a gear button', () => {
    render(
      <AdvancedInferenceControls overrides={BASE_OVERRIDES} onChange={vi.fn()} />,
    );
    const btn = screen.getByTitle('Advanced inference controls');
    expect(btn).toBeDefined();
  });

  it('panel is hidden by default', () => {
    render(
      <AdvancedInferenceControls overrides={BASE_OVERRIDES} onChange={vi.fn()} />,
    );
    expect(screen.queryByTestId('advanced-inference-panel')).toBeNull();
  });

  it('opens panel on gear button click', () => {
    render(
      <AdvancedInferenceControls overrides={BASE_OVERRIDES} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByTitle('Advanced inference controls'));
    expect(screen.getByTestId('advanced-inference-panel')).toBeDefined();
  });

  it('closes panel on second gear click', () => {
    render(
      <AdvancedInferenceControls overrides={BASE_OVERRIDES} onChange={vi.fn()} />,
    );
    const btn = screen.getByTitle('Advanced inference controls');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.queryByTestId('advanced-inference-panel')).toBeNull();
  });

  it('calls onChange with updated temperature when slider changes', () => {
    const onChange = vi.fn();
    render(
      <AdvancedInferenceControls overrides={BASE_OVERRIDES} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTitle('Advanced inference controls'));

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '0.7' } });

    expect(onChange).toHaveBeenCalledOnce();
    const called = onChange.mock.calls[0][0] as ChatOverrides;
    expect(called.temperature).toBeCloseTo(0.7, 2);
  });

  it('calls onChange with updated maxTokens', () => {
    const onChange = vi.fn();
    render(
      <AdvancedInferenceControls overrides={BASE_OVERRIDES} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTitle('Advanced inference controls'));

    const input = screen.getByPlaceholderText('Provider default');
    fireEvent.change(input, { target: { value: '4096' } });

    expect(onChange).toHaveBeenCalledOnce();
    const called = onChange.mock.calls[0][0] as ChatOverrides;
    expect(called.maxTokens).toBe(4096);
  });

  it('enables JSON mode when checkbox is checked', () => {
    const onChange = vi.fn();
    render(
      <AdvancedInferenceControls overrides={BASE_OVERRIDES} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTitle('Advanced inference controls'));

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onChange).toHaveBeenCalledOnce();
    const called = onChange.mock.calls[0][0] as ChatOverrides;
    expect(called.jsonSchema).toBeDefined();
  });

  it('calls onChange with stop sequences from comma-separated input', () => {
    const onChange = vi.fn();
    render(
      <AdvancedInferenceControls overrides={BASE_OVERRIDES} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTitle('Advanced inference controls'));

    const input = screen.getByPlaceholderText(/end\|/);
    fireEvent.change(input, { target: { value: '###, <end>' } });

    expect(onChange).toHaveBeenCalledOnce();
    const called = onChange.mock.calls[0][0] as ChatOverrides;
    expect(called.stopSequences).toEqual(['###', '<end>']);
  });

  it('reset button clears all inference overrides', () => {
    const onChange = vi.fn();
    const withOverrides: ChatOverrides = {
      ...BASE_OVERRIDES,
      temperature: 0.5,
      maxTokens: 1000,
      stopSequences: ['###'],
    };
    render(
      <AdvancedInferenceControls overrides={withOverrides} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTitle('Advanced inference controls'));

    fireEvent.click(screen.getByText('Reset overrides'));

    expect(onChange).toHaveBeenCalledOnce();
    const called = onChange.mock.calls[0][0] as ChatOverrides;
    expect(called.temperature).toBeUndefined();
    expect(called.maxTokens).toBeUndefined();
    expect(called.stopSequences).toBeUndefined();
    expect(called.jsonSchema).toBeUndefined();
  });

  it('shows accent dot indicator when overrides are active', () => {
    const withTemp: ChatOverrides = { ...BASE_OVERRIDES, temperature: 0.3 };
    render(
      <AdvancedInferenceControls overrides={withTemp} onChange={vi.fn()} />,
    );
    // The button should carry the accent class when overrides are set
    const btn = screen.getByTitle('Advanced inference controls');
    expect(btn.className).toContain('text-interactive-accent');
  });
});
