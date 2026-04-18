/**
 * SystemPromptPane.test.tsx — jsdom smoke tests for the orchestrator pane.
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemPromptPane } from './SystemPromptPane';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockListSessions = vi.fn();
const mockGetSystemPrompt = vi.fn();
const mockWriteText = vi.fn();

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      pty: { listSessions: mockListSessions },
      sessions: { getSystemPrompt: mockGetSystemPrompt },
    },
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mockWriteText },
  });
  mockWriteText.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

const SESSION_ID = 'aaaa-1111-bbbb-2222';
const SESSIONS = [{ id: SESSION_ID, cwd: '/home/user/project' }];
const PROMPT_TEXT = 'You are a helpful assistant.';

describe('SystemPromptPane — heading', () => {
  it('renders the section heading', async () => {
    mockListSessions.mockResolvedValue([]);
    await act(async () => {
      render(<SystemPromptPane />);
    });
    expect(screen.getByText('System Prompt (read-only)')).toBeDefined();
  });

  it('renders the description text', async () => {
    mockListSessions.mockResolvedValue([]);
    await act(async () => {
      render(<SystemPromptPane />);
    });
    expect(screen.getByText(/resolved system prompt/i)).toBeDefined();
  });
});

describe('SystemPromptPane — not-yet-captured state', () => {
  beforeEach(() => {
    mockListSessions.mockResolvedValue(SESSIONS);
    mockGetSystemPrompt.mockResolvedValue({
      success: false,
      reason: 'not-yet-captured',
    });
  });

  it('shows not-yet-captured message after session selected', async () => {
    await act(async () => {
      render(<SystemPromptPane />);
    });
    expect(
      screen.getByText(/send a message in this session to populate/i),
    ).toBeDefined();
  });
});

describe('SystemPromptPane — prompt available', () => {
  beforeEach(() => {
    mockListSessions.mockResolvedValue(SESSIONS);
    mockGetSystemPrompt.mockResolvedValue({
      success: true,
      text: PROMPT_TEXT,
      capturedAt: Date.now(),
    });
  });

  it('renders the prompt text when available', async () => {
    await act(async () => {
      render(<SystemPromptPane />);
    });
    expect(screen.getByText(PROMPT_TEXT)).toBeDefined();
  });

  it('renders the copy button', async () => {
    await act(async () => {
      render(<SystemPromptPane />);
    });
    expect(screen.getByRole('button', { name: /copy/i })).toBeDefined();
  });

  it('copy button calls clipboard API', async () => {
    await act(async () => {
      render(<SystemPromptPane />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    });
    expect(mockWriteText).toHaveBeenCalledWith(PROMPT_TEXT);
  });
});

describe('SystemPromptPane — unknown-session state', () => {
  beforeEach(() => {
    mockListSessions.mockResolvedValue(SESSIONS);
    mockGetSystemPrompt.mockResolvedValue({
      success: false,
      reason: 'unknown-session',
    });
  });

  it('shows unavailable message for unknown-session reason', async () => {
    await act(async () => {
      render(<SystemPromptPane />);
    });
    expect(screen.getByText(/unavailable/i)).toBeDefined();
  });
});

describe('SystemPromptPane — no sessions', () => {
  it('shows no active sessions message when list is empty', async () => {
    mockListSessions.mockResolvedValue([]);
    await act(async () => {
      render(<SystemPromptPane />);
    });
    expect(screen.getByText(/no active sessions/i)).toBeDefined();
  });
});
