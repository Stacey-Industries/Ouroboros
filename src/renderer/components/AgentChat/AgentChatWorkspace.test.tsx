/**
 * AgentChatWorkspace.test.tsx — Wave 23 Phase C
 * @vitest-environment jsdom
 *
 * Smoke tests for the TOGGLE_SIDE_CHAT_EVENT wiring and SideChatDrawer
 * integration added in Phase C.  Heavy dependencies (useAgentChatWorkspace,
 * useAgentChatContext, etc.) are fully mocked so these tests run without
 * Electron or a real SQLite store.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOGGLE_SIDE_CHAT_EVENT } from '../../hooks/appEventNames';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('./useAgentChatWorkspace', () => ({
  useAgentChatWorkspace: () => ({
    activeThread: null,
    activeThreadId: 'thread-1',
    threads: [],
    draft: '',
    setDraft: vi.fn(),
    canSend: false,
    hasProject: true,
    isLoading: false,
    isSending: false,
    error: null,
    pendingUserMessage: null,
    isDetailsOpen: false,
    details: null,
    detailsError: null,
    detailsIsLoading: false,
    chatOverrides: {},
    setChatOverrides: vi.fn(),
    settingsModel: '',
    codexSettingsModel: '',
    defaultProvider: 'claude-code',
    modelProviders: [],
    codexModels: [],
    attachments: [],
    setAttachments: vi.fn(),
    queuedMessages: [],
    commands: [],
    branchFromMessage: vi.fn(),
    closeDetails: vi.fn(),
    deleteThread: vi.fn(),
    editAndResend: vi.fn(),
    editQueuedMessage: vi.fn(),
    deleteQueuedMessage: vi.fn(),
    sendQueuedMessageNow: vi.fn(),
    openConversationDetails: vi.fn(),
    openDetailsInOrchestration: vi.fn(),
    openLinkedDetails: vi.fn(),
    reloadThreads: vi.fn(),
    retryMessage: vi.fn(),
    revertMessage: vi.fn(),
    selectThread: vi.fn(),
    sendMessage: vi.fn(),
    setContextFilePaths: vi.fn(),
    setMentionRanges: vi.fn(),
    startNewChat: vi.fn(),
    stopTask: vi.fn(),
  }),
}));

vi.mock('./useAgentChatContext', () => ({
  useAgentChatContext: () => ({
    pinnedFiles: [],
    contextSummary: null,
    autocompleteResults: [],
    isAutocompleteOpen: false,
    mentions: [],
    allFiles: [],
    filePaths: [],
    attachments: [],
    removeFile: vi.fn(),
    setAutocompleteQuery: vi.fn(),
    addFile: vi.fn(),
    closeAutocomplete: vi.fn(),
    openAutocomplete: vi.fn(),
    addMention: vi.fn(),
    removeMention: vi.fn(),
  }),
  buildMentionRanges: () => [],
}));

vi.mock('./AgentChatConversation', () => ({
  AgentChatConversation: () => <div data-testid="conversation" />,
}));

vi.mock('./DensityContext', () => ({
  DensityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => ({ config: {} }),
}));

vi.mock('../../hooks/useStreamCompletionNotifications', () => ({
  useStreamCompletionNotifications: vi.fn(),
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToastContext: () => ({ toast: vi.fn() }),
}));

// ── electronAPI stub ──────────────────────────────────────────────────────────

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      agentChat: {
        forkThread: vi.fn().mockResolvedValue({ success: true, thread: { id: 'side-1' } }),
        createMemory: vi.fn().mockResolvedValue({ success: true }),
      },
      spec: {
        scaffold: vi.fn().mockResolvedValue({ success: true, files: [], slug: 'test' }),
      },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(cleanup);

// ── Import component after mocks ──────────────────────────────────────────────

const { AgentChatWorkspace } = await import('./AgentChatWorkspace');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentChatWorkspace — Phase C side-chat wiring', () => {
  it('renders the conversation pane without the drawer by default', () => {
    render(<AgentChatWorkspace projectRoot="/proj" />);
    expect(screen.getByTestId('conversation')).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the side-chat drawer when TOGGLE_SIDE_CHAT_EVENT fires', async () => {
    render(<AgentChatWorkspace projectRoot="/proj" />);
    fireEvent(window, new CustomEvent(TOGGLE_SIDE_CHAT_EVENT));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });
  });

  it('closes the drawer on a second toggle', async () => {
    render(<AgentChatWorkspace projectRoot="/proj" />);

    fireEvent(window, new CustomEvent(TOGGLE_SIDE_CHAT_EVENT));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());

    fireEvent(window, new CustomEvent(TOGGLE_SIDE_CHAT_EVENT));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes the drawer when the header close button is clicked', async () => {
    render(<AgentChatWorkspace projectRoot="/proj" />);
    fireEvent(window, new CustomEvent(TOGGLE_SIDE_CHAT_EVENT));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());

    fireEvent.click(screen.getByLabelText('Close side chat drawer'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes the drawer when Escape is pressed', async () => {
    render(<AgentChatWorkspace projectRoot="/proj" />);
    fireEvent(window, new CustomEvent(TOGGLE_SIDE_CHAT_EVENT));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined());

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('calls forkThread when drawer opens with no existing side chats', async () => {
    render(<AgentChatWorkspace projectRoot="/proj" />);
    fireEvent(window, new CustomEvent(TOGGLE_SIDE_CHAT_EVENT));
    await waitFor(() => {
      expect(window.electronAPI.agentChat.forkThread).toHaveBeenCalledWith(
        expect.objectContaining({ sourceThreadId: 'thread-1', isSideChat: true }),
      );
    });
  });
});
