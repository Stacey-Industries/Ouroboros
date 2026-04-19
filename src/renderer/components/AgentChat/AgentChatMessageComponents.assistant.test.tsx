/**
 * AgentChatMessageComponents.assistant.test.tsx
 * @vitest-environment jsdom
 *
 * Tests for AssistantMessage: raw toggle, collapse/expand, density classes,
 * and copy action wiring (via MessageActions).
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgentChatMessageRecord } from '../../types/electron';
import { AssistantMessage } from './AgentChatMessageComponents.assistant';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSetMessageCollapsed = vi.fn().mockResolvedValue({ success: true });
const mockToast = vi.fn();

vi.mock('../../contexts/ToastContext', () => ({
  useToastContext: () => ({ toast: mockToast }),
}));

vi.mock('./DensityContext', () => ({
  useDensity: () => ({ density: 'comfortable', setDensity: vi.fn() }),
}));

Object.assign(globalThis, {
  window: Object.assign(typeof window !== 'undefined' ? window : {}, {
    electronAPI: {
      agentChat: { setMessageCollapsed: mockSetMessageCollapsed },
    },
  }),
});

Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<AgentChatMessageRecord> = {}): AgentChatMessageRecord {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    role: 'assistant',
    content: 'Hello **world**',
    createdAt: Date.now(),
    ...overrides,
  };
}

const noop = async (): Promise<void> => undefined;

function renderAssistant(msg: AgentChatMessageRecord): ReturnType<typeof render> {
  return render(
    <AssistantMessage
      message={msg}
      onOpenLinkedDetails={noop}
      onBranch={vi.fn()}
      onRevert={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Raw toggle ────────────────────────────────────────────────────────────────

describe('AssistantMessage — raw toggle', () => {
  it('renders rendered markdown by default (no <pre>)', () => {
    const { container } = renderAssistant(makeMessage());
    expect(container.querySelector('pre')).toBeNull();
  });

  it('shows raw <pre> after clicking Raw button', () => {
    const { container } = renderAssistant(makeMessage({ content: '**bold** text' }));
    const rawBtn = screen.getByTitle('Show raw markdown');
    fireEvent.click(rawBtn);
    const pre = container.querySelector('pre');
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toContain('**bold** text');
  });

  it('toggles back to rendered after second click', () => {
    const { container } = renderAssistant(makeMessage());
    const rawBtn = screen.getByTitle('Show raw markdown');
    fireEvent.click(rawBtn);
    expect(container.querySelector('pre')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Show rendered markdown'));
    expect(container.querySelector('pre')).toBeNull();
  });
});

// ── Collapse/expand ───────────────────────────────────────────────────────────

describe('AssistantMessage — collapse/expand', () => {
  it('shows content expanded by default when collapsedByDefault is false', () => {
    renderAssistant(makeMessage({ content: 'short', collapsedByDefault: false }));
    expect(screen.getByText('short')).toBeTruthy();
  });

  it('hides content when collapsedByDefault is true', () => {
    const longContent = 'x'.repeat(4001);
    renderAssistant(makeMessage({ content: longContent, collapsedByDefault: true }));
    expect(screen.queryByText(longContent)).toBeNull();
  });

  it('shows "Show content" button when collapsed', () => {
    const longContent = 'x'.repeat(4001);
    renderAssistant(makeMessage({ content: longContent, collapsedByDefault: true }));
    expect(screen.getByText('Show content')).toBeTruthy();
  });

  it('expands after clicking "Show content"', () => {
    const longContent = 'x'.repeat(4001);
    renderAssistant(makeMessage({ content: longContent, collapsedByDefault: true }));
    fireEvent.click(screen.getByText('Show content'));
    expect(screen.getByText('Collapse')).toBeTruthy();
  });

  it('calls setMessageCollapsed IPC on toggle', () => {
    const longContent = 'x'.repeat(4001);
    renderAssistant(makeMessage({ id: 'msg-42', content: longContent, collapsedByDefault: true }));
    fireEvent.click(screen.getByText('Show content'));
    expect(mockSetMessageCollapsed).toHaveBeenCalledWith('msg-42', expect.any(String), false);
  });

  it('shows collapse button only for long messages (>=4000 chars)', () => {
    renderAssistant(makeMessage({ content: 'short message' }));
    expect(screen.queryByText('Collapse')).toBeNull();
    expect(screen.queryByText('Show content')).toBeNull();
  });
});

// ── Copy actions (via MessageActions) ────────────────────────────────────────

describe('AssistantMessage — copy actions', () => {
  it('renders Copy MD and Copy Plain buttons', () => {
    renderAssistant(makeMessage());
    expect(screen.getByTitle('Copy as Markdown')).toBeTruthy();
    expect(screen.getByTitle('Copy as plain text')).toBeTruthy();
  });
});
