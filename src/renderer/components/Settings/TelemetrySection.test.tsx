/**
 * @vitest-environment jsdom
 *
 * TelemetrySection.test.tsx — Wave 53 Phase B smoke tests for the telemetry
 * opt-out / remote-placeholder Settings panel.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../types/electron';
import { TelemetrySection } from './TelemetrySection';

function makeDraft(telemetry?: AppConfig['telemetry']): AppConfig {
  return { telemetry } as unknown as AppConfig;
}

describe('TelemetrySection', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders local telemetry as enabled when key is absent (Wave 53 default flip)', () => {
    render(<TelemetrySection draft={makeDraft(undefined)} onChange={vi.fn()} />);
    const localToggle = screen.getByRole('switch', { name: /Enable local telemetry/ });
    expect(localToggle.getAttribute('aria-checked')).toBe('true');
  });

  it('renders local telemetry as disabled when explicitly opted out', () => {
    render(<TelemetrySection draft={makeDraft({ structured: false })} onChange={vi.fn()} />);
    const localToggle = screen.getByRole('switch', { name: /Enable local telemetry/ });
    expect(localToggle.getAttribute('aria-checked')).toBe('false');
  });

  it('toggling local telemetry calls onChange with the patched key', () => {
    const onChange = vi.fn();
    render(<TelemetrySection draft={makeDraft({ structured: true })} onChange={onChange} />);
    const localToggle = screen.getByRole('switch', { name: /Enable local telemetry/ });
    fireEvent.click(localToggle);
    expect(onChange).toHaveBeenCalledWith('telemetry', { structured: false });
  });

  it('renders remote-transmit toggle as disabled and unchecked', () => {
    render(<TelemetrySection draft={makeDraft(undefined)} onChange={vi.fn()} />);
    const remoteToggle = screen.getByRole('switch', {
      name: /Transmit telemetry to remote/,
    });
    expect(remoteToggle.getAttribute('aria-checked')).toBe('false');
    expect((remoteToggle as HTMLButtonElement).disabled).toBe(true);
  });

  it('makes the privacy stance explicit: "data never leaves your machine"', () => {
    render(<TelemetrySection draft={makeDraft(undefined)} onChange={vi.fn()} />);
    expect(screen.getByText(/never leaves your machine/i)).toBeTruthy();
  });
});
