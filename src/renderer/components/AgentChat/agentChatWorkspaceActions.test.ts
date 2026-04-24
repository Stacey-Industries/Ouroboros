/**
 * agentChatWorkspaceActions.test.ts — Smoke tests for workspace action hooks.
 */
import { describe, expect, it, vi } from 'vitest';

import { buildAgentChatWorkspaceModel } from './agentChatWorkspaceActions';

// Minimal stub for BuildWorkspaceModelArgs
function makeArgs(overrides: Record<string, unknown> = {}): Parameters<typeof buildAgentChatWorkspaceModel>[0] {
  return {
    activeThread: null,
    activeThreadId: null,
    attachments: [],
    setAttachments: vi.fn(),
    chatOverrides: {},
    setChatOverrides: vi.fn(),
    settingsModel: 'claude-3-5-sonnet-20241022',
    codexSettingsModel: '',
    defaultProvider: 'claude-code',
    modelProviders: [],
    codexModels: [],
    codexAppServerTransport: false,
    closeDetails: vi.fn(),
    details: null,
    detailsError: null,
    detailsIsLoading: false,
    draft: '',
    error: null,
    isLoading: false,
    isDetailsOpen: false,
    isSending: false,
    pendingUserMessage: null,
    openConversationDetails: vi.fn(),
    openDetailsInOrchestration: vi.fn(),
    projectRoot: '/project',
    reloadThreads: vi.fn(),
    setContextFilePaths: vi.fn(),
    setMentionRanges: vi.fn(),
    setDraft: vi.fn(),
    threads: [],
    queuedMessages: [],
    editQueuedMessage: vi.fn(),
    deleteQueuedMessage: vi.fn(),
    sendQueuedMessageNow: vi.fn(),
    commands: [],
    branchFromMessage: vi.fn(),
    deleteThread: vi.fn(),
    editAndResend: vi.fn(),
    openLinkedDetails: vi.fn(),
    retryMessage: vi.fn(),
    revertMessage: vi.fn(),
    selectThread: vi.fn(),
    sendMessage: vi.fn(),
    startNewChat: vi.fn(),
    stopTask: vi.fn(),
    ...overrides,
  } as Parameters<typeof buildAgentChatWorkspaceModel>[0];
}

describe('buildAgentChatWorkspaceModel', () => {
  it('sets canSend=false when draft is empty', () => {
    const model = buildAgentChatWorkspaceModel(makeArgs({ draft: '' }));
    expect(model.canSend).toBe(false);
  });

  it('sets canSend=true when draft has content and projectRoot is set', () => {
    const model = buildAgentChatWorkspaceModel(makeArgs({ draft: 'hello', projectRoot: '/p' }));
    expect(model.canSend).toBe(true);
  });

  it('sets canSend=false when isSending is true', () => {
    const model = buildAgentChatWorkspaceModel(makeArgs({ draft: 'hello', projectRoot: '/p', isSending: true }));
    expect(model.canSend).toBe(false);
  });

  it('sets hasProject=true when projectRoot is set', () => {
    const model = buildAgentChatWorkspaceModel(makeArgs({ projectRoot: '/p' }));
    expect(model.hasProject).toBe(true);
  });

  it('sets hasProject=false when projectRoot is null', () => {
    const model = buildAgentChatWorkspaceModel(makeArgs({ projectRoot: null }));
    expect(model.hasProject).toBe(false);
  });

  it('defaults commands to empty array when not provided', () => {
    const model = buildAgentChatWorkspaceModel(makeArgs({ commands: undefined }));
    expect(model.commands).toEqual([]);
  });
});
