/**
 * agentChatSelectors.test.ts — smoke tests for selector shape and isolation.
 *
 * These tests exercise the selector logic directly against the store instance
 * without a React render tree, using zustand's getState().
 */
import { describe, expect, it } from 'vitest';

import { createAgentChatStore } from './agentChatStore';
import type { AgentChatStore } from './agentChatStore.types';

/** Helper: run a selector against a store snapshot. */
function select<T>(
  store: ReturnType<typeof createAgentChatStore>,
  selector: (s: AgentChatStore) => T,
): T {
  return selector(store.getState());
}

describe('agentChatSelectors (selector shapes)', () => {
  it('thread selector returns all thread fields', () => {
    const store = createAgentChatStore();
    const thread = select(store, (s) => ({
      activeThread: s.activeThread,
      canSend: s.canSend,
      draft: s.draft,
      error: s.error,
      hasProject: s.hasProject,
      isLoading: s.isLoading,
      isSending: s.isSending,
      pendingUserMessage: s.pendingUserMessage,
    }));
    expect(thread).toMatchObject({
      activeThread: null,
      canSend: false,
      draft: '',
      error: null,
      hasProject: false,
      isLoading: false,
      isSending: false,
      pendingUserMessage: null,
    });
  });

  it('details selector returns all details fields', () => {
    const store = createAgentChatStore();
    const details = select(store, (s) => ({
      isDetailsOpen: s.isDetailsOpen,
      details: s.details,
      detailsError: s.detailsError,
      detailsIsLoading: s.detailsIsLoading,
    }));
    expect(details).toMatchObject({
      isDetailsOpen: false,
      details: null,
      detailsError: null,
      detailsIsLoading: false,
    });
  });

  it('context files selector returns all context fields', () => {
    const store = createAgentChatStore();
    const ctx = select(store, (s) => ({
      pinnedFiles: s.pinnedFiles,
      contextSummary: s.contextSummary,
      autocompleteResults: s.autocompleteResults,
      isAutocompleteOpen: s.isAutocompleteOpen,
      mentions: s.mentions,
      allFiles: s.allFiles,
      attachments: s.attachments,
    }));
    expect(ctx.pinnedFiles).toEqual([]);
    expect(ctx.mentions).toEqual([]);
    expect(ctx.attachments).toEqual([]);
  });

  it('model selector returns all model fields', () => {
    const store = createAgentChatStore();
    const model = select(store, (s) => ({
      chatOverrides: s.chatOverrides,
      settingsModel: s.settingsModel,
      codexSettingsModel: s.codexSettingsModel,
      defaultProvider: s.defaultProvider,
      modelProviders: s.modelProviders,
      codexModels: s.codexModels,
    }));
    expect(model.defaultProvider).toBe('claude-code');
    expect(model.modelProviders).toEqual([]);
  });

  it('queue selector returns queuedMessages', () => {
    const store = createAgentChatStore();
    const queue = select(store, (s) => ({ queuedMessages: s.queuedMessages }));
    expect(queue.queuedMessages).toEqual([]);
  });

  it('actions selector returns all action functions', () => {
    const store = createAgentChatStore();
    const actions = select(store, (s) => ({
      onSend: s.onSend,
      onStop: s.onStop,
      onDraftChange: s.onDraftChange,
      onEdit: s.onEdit,
      onRetry: s.onRetry,
      onBranch: s.onBranch,
      onRevert: s.onRevert,
      onOpenLinkedDetails: s.onOpenLinkedDetails,
      onOpenLinkedTask: s.onOpenLinkedTask,
      closeDetails: s.closeDetails,
      onRemoveFile: s.onRemoveFile,
      onAutocompleteQuery: s.onAutocompleteQuery,
      onSelectFile: s.onSelectFile,
      onCloseAutocomplete: s.onCloseAutocomplete,
      onOpenAutocomplete: s.onOpenAutocomplete,
      onAddMention: s.onAddMention,
      onRemoveMention: s.onRemoveMention,
      onAttachmentsChange: s.onAttachmentsChange,
      onChatOverridesChange: s.onChatOverridesChange,
      onSelectThread: s.onSelectThread,
      onEditQueuedMessage: s.onEditQueuedMessage,
      onDeleteQueuedMessage: s.onDeleteQueuedMessage,
      onSendQueuedMessageNow: s.onSendQueuedMessageNow,
    }));
    for (const [key, val] of Object.entries(actions)) {
      expect(typeof val, `${key} should be a function`).toBe('function');
    }
  });

  it('fine-grained draft selector reflects store state', () => {
    const store = createAgentChatStore();
    store.setState({ draft: 'hello world' });
    const draft = select(store, (s) => s.draft);
    expect(draft).toBe('hello world');
  });

  it('fine-grained canSend selector reflects store state', () => {
    const store = createAgentChatStore();
    store.setState({ canSend: true });
    expect(select(store, (s) => s.canSend)).toBe(true);
  });
});
