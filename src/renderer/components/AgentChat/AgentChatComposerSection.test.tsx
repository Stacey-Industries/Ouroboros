/**
 * AgentChatComposerSection.test.tsx — Tests for the ComposerSection research intercept.
 *
 * Strategy: mock AgentChatComposer (heavy, requires xterm + Monaco deps) and
 * researchCommands (IPC). The tests exercise the useResearchIntercept path via
 * the onSubmit prop that ComposerSection forwards to AgentChatComposer.
 *
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Heavy dep mocks ──────────────────────────────────────────────────────────

vi.mock('./AgentChatComposer', () => ({
  AgentChatComposer: (props: {
    onSubmit: () => Promise<void>;
    canSend: boolean;
    isSending: boolean;
    draft: string;
  }) => (
    <div data-testid="mock-composer" data-can-send={String(props.canSend)} data-is-sending={String(props.isSending)}>
      <button
        data-testid="submit-btn"
        onClick={() => void props.onSubmit()}
        disabled={!props.canSend}
        type="button"
      >
        Send
      </button>
      <span data-testid="draft-value">{props.draft}</span>
    </div>
  ),
}));

vi.mock('./researchCommands', () => ({
  parseResearchCommand: vi.fn(),
  runResearchAndPin: vi.fn(),
  buildFollowupPrompt: vi.fn(),
}));

vi.mock('./ComposerProfile', () => ({
  ComposerProfile: () => null,
}));

vi.mock('./McpChatToggles', () => ({
  McpChatToggles: () => null,
}));

vi.mock('./ToolToggles', () => ({
  ToolToggles: () => null,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { ComposerSection } from './AgentChatComposerSection';
import {
  buildFollowupPrompt,
  parseResearchCommand,
  runResearchAndPin,
} from './researchCommands';

// ─── electronAPI mock ─────────────────────────────────────────────────────────

const mockElectronAPI = {
  sessionCrud: {
    list: vi.fn().mockResolvedValue({ success: true, sessions: [] }),
    onChanged: vi.fn(() => vi.fn()),
    setProfile: vi.fn().mockResolvedValue({ success: true }),
  },
  profileCrud: {
    list: vi.fn().mockResolvedValue({ success: true, profiles: [] }),
  },
};

// ─── Minimal props factory ────────────────────────────────────────────────────

function makeProps(overrides?: Partial<Parameters<typeof ComposerSection>[0]>) {
  const onSend = vi.fn().mockResolvedValue(undefined);
  const onDraftChange = vi.fn();
  return {
    activeThread: null,
    canSend: true,
    hasProject: true,
    draft: '/research next.js',
    isSending: false,
    onDraftChange,
    onSend,
    threadModelUsage: undefined,
    streamingTokenUsage: undefined,
    activeSessionId: 'sess-1',
    slashCommandContext: { researchEnabled: true },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: mockElectronAPI,
    writable: true,
    configurable: true,
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ComposerSection — pass-through (no research match)', () => {
  beforeEach(() => {
    vi.mocked(parseResearchCommand).mockReturnValue(null);
  });

  it('renders the mock composer', () => {
    render(<ComposerSection {...makeProps({ draft: 'hello' })} />);
    expect(screen.getByTestId('mock-composer')).toBeTruthy();
  });

  it('calls onSend directly when draft does not match a research command', async () => {
    const props = makeProps({ draft: 'hello world' });
    render(<ComposerSection {...props} />);
    screen.getByTestId('submit-btn').click();
    await vi.waitFor(() => expect(props.onSend).toHaveBeenCalledTimes(1));
    expect(runResearchAndPin).not.toHaveBeenCalled();
  });

  it('does not show ResearchIndicator when not researching', () => {
    render(<ComposerSection {...makeProps()} />);
    expect(screen.queryByTestId('research-indicator')).toBeNull();
  });
});

describe('ComposerSection — research intercept', () => {
  beforeEach(() => {
    vi.mocked(parseResearchCommand).mockReturnValue({
      cmd: 'research',
      topic: 'next.js',
    });
    vi.mocked(runResearchAndPin).mockResolvedValue({ success: true, artifactId: 'art-1' });
    vi.mocked(buildFollowupPrompt).mockReturnValue('');
  });

  it('calls runResearchAndPin with correct sessionId and topic', async () => {
    const props = makeProps();
    render(<ComposerSection {...props} />);
    screen.getByTestId('submit-btn').click();
    await vi.waitFor(() => expect(runResearchAndPin).toHaveBeenCalledTimes(1));
    expect(runResearchAndPin).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      topic: 'next.js',
    });
  });

  it('clears the draft before running research', async () => {
    const props = makeProps();
    render(<ComposerSection {...props} />);
    screen.getByTestId('submit-btn').click();
    await vi.waitFor(() => expect(props.onDraftChange).toHaveBeenCalledWith(''));
  });

  it('does not call onSend for plain /research (no followup)', async () => {
    const props = makeProps();
    render(<ComposerSection {...props} />);
    screen.getByTestId('submit-btn').click();
    await vi.waitFor(() => expect(runResearchAndPin).toHaveBeenCalled());
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('calls onSend after research when followup prompt is non-empty', async () => {
    vi.mocked(parseResearchCommand).mockReturnValue({
      cmd: 'spec-with-research',
      topic: 'next.js server actions',
    });
    vi.mocked(buildFollowupPrompt).mockReturnValue('Generate a spec for: next.js server actions');
    const props = makeProps({ draft: '/spec-with-research next.js server actions' });
    render(<ComposerSection {...props} />);
    screen.getByTestId('submit-btn').click();
    await vi.waitFor(() => expect(props.onSend).toHaveBeenCalledTimes(1));
    expect(props.onDraftChange).toHaveBeenCalledWith('Generate a spec for: next.js server actions');
  });

  it('falls through to onSend when activeSessionId is absent', async () => {
    const props = makeProps({ activeSessionId: null });
    render(<ComposerSection {...props} />);
    screen.getByTestId('submit-btn').click();
    await vi.waitFor(() => expect(props.onSend).toHaveBeenCalledTimes(1));
    expect(runResearchAndPin).not.toHaveBeenCalled();
  });

  it('falls through when researchEnabled is false', async () => {
    const props = makeProps({ slashCommandContext: { researchEnabled: false } });
    render(<ComposerSection {...props} />);
    screen.getByTestId('submit-btn').click();
    await vi.waitFor(() => expect(props.onSend).toHaveBeenCalledTimes(1));
    expect(runResearchAndPin).not.toHaveBeenCalled();
  });
});
