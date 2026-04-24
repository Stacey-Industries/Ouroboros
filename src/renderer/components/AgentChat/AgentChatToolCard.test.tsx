/**
 * AgentChatToolCard.test.tsx
 * @vitest-environment jsdom
 *
 * Tests for AgentChatToolCard: IDE-mode glass-card styling vs chat-only
 * flat-tinted-strip styling (Phase E — assistant gutter + flat tool cards).
 */

import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentChatToolCard } from './AgentChatToolCard';
import { WorkspaceVariantContext } from './WorkspaceVariantContext';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('./AgentChatSubToolList', () => ({
  AgentChatSubToolList: () => null,
}));

vi.mock('./AgentChatSubAgentTranscript', () => ({
  AgentChatSubAgentTranscript: () => <div data-testid="subagent-transcript" />,
}));

vi.mock('./AgentChatToolCardSupport', () => ({
  ToolHeader: ({ name }: { name: string }) => <div data-testid="tool-header">{name}</div>,
  ToolDetails: () => null,
}));

vi.mock('./AgentChatDiffPreview', () => ({
  AgentChatDiffPreview: () => null,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderCard(
  variant: 'ide' | 'chat-only',
  extraProps: Partial<React.ComponentProps<typeof AgentChatToolCard>> = {},
): HTMLElement {
  const { container } = render(
    <WorkspaceVariantContext.Provider value={variant}>
      <AgentChatToolCard name="Read" status="complete" {...extraProps} />
    </WorkspaceVariantContext.Provider>,
  );
  return container.firstElementChild as HTMLElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── IDE mode ──────────────────────────────────────────────────────────────────

describe('AgentChatToolCard — IDE mode', () => {
  it('applies glass-card class in IDE mode', () => {
    const el = renderCard('ide');
    expect(el.className).toContain('glass-card');
  });

  it('applies rounded-md border in IDE mode', () => {
    const el = renderCard('ide');
    expect(el.className).toContain('rounded-md');
    expect(el.className).toContain('border');
  });

  it('does NOT apply flat bg-surface-panel/50 in IDE mode', () => {
    const el = renderCard('ide');
    expect(el.className).not.toContain('bg-surface-panel');
  });
});

// ── Chat-only mode ────────────────────────────────────────────────────────────

describe('AgentChatToolCard — chat-only mode (Phase E flat strip)', () => {
  it('drops glass-card in chat-only mode', () => {
    const el = renderCard('chat-only');
    expect(el.className).not.toContain('glass-card');
  });

  it('applies flat tinted background in chat-only mode', () => {
    const el = renderCard('chat-only');
    expect(el.className).toContain('bg-surface-panel');
  });

  it('has no explicit border class in chat-only mode without error', () => {
    const el = renderCard('chat-only');
    // Should not contain border-border-semantic or the base border class
    expect(el.className).not.toContain('border-border-semantic');
    // The 'border' token should not appear unless it's the error path
    const hasPlainBorder = el.className.split(' ').some((cls) => cls === 'border');
    expect(hasPlainBorder).toBe(false);
  });

  it('applies error border class (not inline style) in chat-only error mode', () => {
    const el = renderCard('chat-only', { errorOutput: 'tool crashed' });
    expect(el.className).toContain('border-diff-del-border');
    // Must NOT use inline style for border in chat-only mode
    expect(el.style.borderColor).toBe('');
  });
});

// ── IDE error mode uses inline style (token fallback) ─────────────────────────

describe('AgentChatToolCard — IDE error mode', () => {
  it('applies inline borderColor style for error in IDE mode', () => {
    const el = renderCard('ide', { errorOutput: 'boom' });
    expect(el.style.borderColor).toBe('var(--diff-del-border)');
  });

  it('renders nested subagent transcript when present', () => {
    const el = renderCard('ide', {
      isCollapsed: false,
      subAgentTranscript: [
        {
          entryId: 'agent-1:text',
          subAgentId: 'agent-1',
          kind: 'text',
          content: 'child transcript',
        },
      ],
    });
    expect(el.querySelector('[data-testid="subagent-transcript"]')).not.toBeNull();
  });
});
