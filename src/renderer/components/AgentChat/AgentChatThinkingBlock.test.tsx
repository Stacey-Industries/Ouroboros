/**
 * AgentChatThinkingBlock.test.tsx — Integration tests verifying the thinking
 * block reads verb/spinner data from config rather than hardcoded values.
 *
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentChatThinkingBlock } from './AgentChatThinkingBlock';

// ── Mock useConfig ────────────────────────────────────────────────────────────

const mockConfig = vi.fn();

vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => mockConfig(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(theming?: Record<string, unknown>) {
  return { config: { theming: theming ?? {} }, set: vi.fn() };
}

const defaultProps = {
  content: 'some thought content',
  isStreaming: false,
  collapsed: false,
  onToggleCollapse: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentChatThinkingBlock — static (not streaming)', () => {
  it('renders "Thought" label when not streaming', () => {
    mockConfig.mockReturnValue(makeConfig());
    render(<AgentChatThinkingBlock {...defaultProps} />);
    expect(screen.getByText(/Thought/)).toBeTruthy();
  });

  it('renders duration badge when duration is provided', () => {
    mockConfig.mockReturnValue(makeConfig());
    render(<AgentChatThinkingBlock {...defaultProps} duration={5} />);
    expect(screen.getByText('5s')).toBeTruthy();
  });

  it('renders "<1s" when duration is 0', () => {
    mockConfig.mockReturnValue(makeConfig());
    render(<AgentChatThinkingBlock {...defaultProps} duration={0} />);
    expect(screen.getByText('<1s')).toBeTruthy();
  });
});

describe('AgentChatThinkingBlock — streaming label reads from config', () => {
  it('shows streaming label element when isStreaming=true', () => {
    mockConfig.mockReturnValue(makeConfig());
    render(<AgentChatThinkingBlock {...defaultProps} isStreaming />);
    expect(screen.getByTestId('thinking-streaming-label')).toBeTruthy();
  });

  it('uses verbOverride when set', () => {
    mockConfig.mockReturnValue(makeConfig({ verbOverride: 'ruminating' }));
    render(<AgentChatThinkingBlock {...defaultProps} isStreaming />);
    const label = screen.getByTestId('thinking-streaming-label');
    expect(label.textContent).toMatch(/ruminating/);
  });

  it('uses custom thinkingVerbs list when no verbOverride', () => {
    mockConfig.mockReturnValue(makeConfig({ thinkingVerbs: ['pondering', 'musing'] }));
    render(<AgentChatThinkingBlock {...defaultProps} isStreaming />);
    const label = screen.getByTestId('thinking-streaming-label');
    // First verb in list is shown initially
    expect(label.textContent).toMatch(/pondering/);
  });

  it('falls back to DEFAULT_THINKING_VERBS when config has empty thinkingVerbs', () => {
    mockConfig.mockReturnValue(makeConfig({ thinkingVerbs: [] }));
    render(<AgentChatThinkingBlock {...defaultProps} isStreaming />);
    const label = screen.getByTestId('thinking-streaming-label');
    // "thinking" is the first default verb
    expect(label.textContent).toMatch(/thinking/);
  });

  it('ignores verbOverride when it is an empty string', () => {
    mockConfig.mockReturnValue(makeConfig({ verbOverride: '  ', thinkingVerbs: ['cogitating'] }));
    render(<AgentChatThinkingBlock {...defaultProps} isStreaming />);
    const label = screen.getByTestId('thinking-streaming-label');
    expect(label.textContent).toMatch(/cogitating/);
  });
});

describe('AgentChatThinkingBlock — collapse behaviour', () => {
  it('does not collapse while streaming', () => {
    mockConfig.mockReturnValue(makeConfig());
    render(<AgentChatThinkingBlock {...defaultProps} isStreaming collapsed />);
    const collapseDiv = document.querySelector('[data-collapsed]');
    expect(collapseDiv?.getAttribute('data-collapsed')).toBe('false');
  });

  it('collapses when not streaming and collapsed=true', () => {
    mockConfig.mockReturnValue(makeConfig());
    render(<AgentChatThinkingBlock {...defaultProps} collapsed />);
    const collapseDiv = document.querySelector('[data-collapsed]');
    expect(collapseDiv?.getAttribute('data-collapsed')).toBe('true');
  });
});
