/**
 * AgentContextPacketSection.test.tsx — Smoke tests for the lean/full packet mode radio group.
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContextSettings } from './AgentContextPacketSection';
import { AgentContextPacketSection } from './AgentContextPacketSection';

function makeSettings(overrides: Partial<ContextSettings> = {}): ContextSettings {
  return {
    provenanceWeights: true,
    pagerank: true,
    pagerankSeeds: { pinned: 0.5, symbol: 0.3, user_edit: 0.2 },
    packetMode: 'full',
    ...overrides,
  };
}

afterEach(cleanup);

describe('AgentContextPacketSection', () => {
  it('renders Full and Lean buttons', () => {
    render(<AgentContextPacketSection contextSettings={makeSettings()} updateContext={vi.fn()} />);
    expect(screen.getByText('Full')).toBeDefined();
    expect(screen.getByText('Lean')).toBeDefined();
  });

  it('marks Full button as pressed when packetMode is full', () => {
    render(<AgentContextPacketSection contextSettings={makeSettings({ packetMode: 'full' })} updateContext={vi.fn()} />);
    expect(screen.getByText('Full').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Lean').getAttribute('aria-pressed')).toBe('false');
  });

  it('marks Lean button as pressed when packetMode is lean', () => {
    render(<AgentContextPacketSection contextSettings={makeSettings({ packetMode: 'lean' })} updateContext={vi.fn()} />);
    expect(screen.getByText('Lean').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Full').getAttribute('aria-pressed')).toBe('false');
  });

  it('defaults to full when packetMode is undefined', () => {
    const settings = makeSettings();
    delete settings.packetMode;
    render(<AgentContextPacketSection contextSettings={settings} updateContext={vi.fn()} />);
    expect(screen.getByText('Full').getAttribute('aria-pressed')).toBe('true');
  });

  it('calls updateContext with lean when Lean is clicked', () => {
    const updateContext = vi.fn();
    render(<AgentContextPacketSection contextSettings={makeSettings()} updateContext={updateContext} />);
    fireEvent.click(screen.getByText('Lean'));
    expect(updateContext).toHaveBeenCalledWith('packetMode', 'lean');
  });

  it('calls updateContext with full when Full is clicked', () => {
    const updateContext = vi.fn();
    render(<AgentContextPacketSection contextSettings={makeSettings({ packetMode: 'lean' })} updateContext={updateContext} />);
    fireEvent.click(screen.getByText('Full'));
    expect(updateContext).toHaveBeenCalledWith('packetMode', 'full');
  });
});
