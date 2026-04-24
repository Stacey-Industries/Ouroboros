/**
 * @vitest-environment jsdom
 *
 * AgentChatWorkspace.storeSync.test.ts — smoke tests for useWorkspaceStoreSync.
 *
 * We test the observable behaviour: after the hook runs, the zustand store must
 * contain the expected state values. The private buildReadonlyActions /
 * buildWriteActions helpers are covered indirectly through readOnly=true/false.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createAgentChatStore } from './agentChatStore';
import type { WorkspaceStoreSyncArgs } from './AgentChatWorkspace.storeSync';
import { useWorkspaceStoreSync } from './AgentChatWorkspace.storeSync';

// ── Minimal fakes ─────────────────────────────────────────────────────────────

function makeModel(
  overrides: Partial<WorkspaceStoreSyncArgs['model']> = {},
): WorkspaceStoreSyncArgs['model'] {
  return {
    activeThread: null,
    activeThreadId: null,
    attachments: [],
    setAttachments: vi.fn(),
    branchFromMessage: vi.fn(),
    canSend: true,
    chatOverrides: { model: 'opus[1m]', effort: 'medium', permissionMode: 'default' },
    setChatOverrides: vi.fn(),
    closeDetails: vi.fn(),
    codexAppServerTransport: false,
    codexModels: [],
    codexSettingsModel: '',
    commands: [],
    defaultProvider: 'claude-code',
    deleteQueuedMessage: vi.fn(),
    deleteThread: vi.fn(),
    details: null,
    detailsError: null,
    detailsIsLoading: false,
    draft: 'hello',
    editAndResend: vi.fn(),
    editQueuedMessage: vi.fn(),
    error: null,
    hasProject: true,
    isDetailsOpen: false,
    isLoading: false,
    isSending: false,
    modelProviders: [],
    openConversationDetails: vi.fn(),
    openDetailsInOrchestration: vi.fn(),
    openLinkedDetails: vi.fn(),
    pendingUserMessage: null,
    projectRoot: '/proj',
    queuedMessages: [],
    reloadThreads: vi.fn(),
    retryMessage: vi.fn(),
    revertMessage: vi.fn(),
    selectThread: vi.fn(),
    sendMessage: vi.fn(),
    sendQueuedMessageNow: vi.fn(),
    setContextFilePaths: vi.fn(),
    setDraft: vi.fn(),
    setMentionRanges: vi.fn(),
    settingsModel: 'claude-3-opus',
    startNewChat: vi.fn(),
    stopTask: vi.fn(),
    threads: [],
    ...overrides,
  } as unknown as WorkspaceStoreSyncArgs['model'];
}

function makeContext(): WorkspaceStoreSyncArgs['context'] {
  return {
    pinnedFiles: [],
    contextSummary: null,
    autocompleteResults: [],
    isAutocompleteOpen: false,
    mentions: [],
    allFiles: [],
    filePaths: [],
    addFile: vi.fn(),
    removeFile: vi.fn(),
    setAutocompleteQuery: vi.fn(),
    closeAutocomplete: vi.fn(),
    openAutocomplete: vi.fn(),
    addMention: vi.fn(),
    removeMention: vi.fn(),
  } as unknown as WorkspaceStoreSyncArgs['context'];
}

function makeSlashCmd(): WorkspaceStoreSyncArgs['slashCmd'] {
  return {
    onClearChat: vi.fn(),
    onNewThread: vi.fn(),
    onRemember: vi.fn(),
    onOpenMemories: vi.fn(),
    onSpec: vi.fn(),
    commands: [],
    researchEnabled: true,
  } as unknown as WorkspaceStoreSyncArgs['slashCmd'];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useWorkspaceStoreSync', () => {
  it('syncs slashCommandContext to the store', () => {
    const store = createAgentChatStore();
    const slashCmd = makeSlashCmd();
    const args: WorkspaceStoreSyncArgs = {
      store,
      model: makeModel(),
      context: makeContext(),
      slashCmd,
      readOnly: false,
    };
    renderHook(() => useWorkspaceStoreSync(args));
    expect(store.getState().slashCommandContext).toBe(slashCmd);
  });

  it('syncs model state fields to the store', () => {
    const store = createAgentChatStore();
    const model = makeModel({ draft: 'typed text', hasProject: true, settingsModel: 'sonnet' });
    const args: WorkspaceStoreSyncArgs = {
      store,
      model,
      context: makeContext(),
      slashCmd: makeSlashCmd(),
      readOnly: false,
    };
    renderHook(() => useWorkspaceStoreSync(args));
    const state = store.getState();
    expect(state.draft).toBe('typed text');
    expect(state.hasProject).toBe(true);
    expect(state.settingsModel).toBe('sonnet');
  });

  it('clears draft and blocks canSend when readOnly=true', () => {
    const store = createAgentChatStore();
    const model = makeModel({ draft: 'some text', canSend: true });
    const args: WorkspaceStoreSyncArgs = {
      store,
      model,
      context: makeContext(),
      slashCmd: makeSlashCmd(),
      readOnly: true,
    };
    renderHook(() => useWorkspaceStoreSync(args));
    const state = store.getState();
    expect(state.draft).toBe('');
    expect(state.canSend).toBe(false);
  });

  it('wires model send/stop actions in write mode', () => {
    const store = createAgentChatStore();
    const sendMessage = vi.fn();
    const stopTask = vi.fn();
    const model = makeModel({ sendMessage, stopTask });
    const args: WorkspaceStoreSyncArgs = {
      store,
      model,
      context: makeContext(),
      slashCmd: makeSlashCmd(),
      readOnly: false,
    };
    renderHook(() => useWorkspaceStoreSync(args));
    const state = store.getState();
    expect(state.onSend).toBe(sendMessage);
    expect(state.onStop).toBe(stopTask);
  });

  it('replaces send/stop with noops in readOnly mode', () => {
    const store = createAgentChatStore();
    const sendMessage = vi.fn();
    const stopTask = vi.fn();
    const model = makeModel({ sendMessage, stopTask });
    const args: WorkspaceStoreSyncArgs = {
      store,
      model,
      context: makeContext(),
      slashCmd: makeSlashCmd(),
      readOnly: true,
    };
    renderHook(() => useWorkspaceStoreSync(args));
    const state = store.getState();
    // noops — not the model's real functions
    expect(state.onSend).not.toBe(sendMessage);
    expect(state.onStop).not.toBe(stopTask);
    // but they are still callable
    expect(typeof state.onSend).toBe('function');
    expect(typeof state.onStop).toBe('function');
  });

  it('wires context file/autocomplete actions to the store', () => {
    const store = createAgentChatStore();
    const removeFile = vi.fn();
    const addFile = vi.fn();
    const context = { ...makeContext(), removeFile, addFile };
    const args: WorkspaceStoreSyncArgs = {
      store,
      model: makeModel(),
      context: context as unknown as WorkspaceStoreSyncArgs['context'],
      slashCmd: makeSlashCmd(),
      readOnly: false,
    };
    renderHook(() => useWorkspaceStoreSync(args));
    expect(store.getState().onRemoveFile).toBe(removeFile);
    expect(store.getState().onSelectFile).toBe(addFile);
  });
});
