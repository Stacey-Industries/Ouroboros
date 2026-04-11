/**
 * agentChatStore.test.ts — smoke tests for the per-workspace zustand store.
 */
import { describe, expect, it } from 'vitest';

import { createAgentChatStore } from './agentChatStore';

describe('createAgentChatStore', () => {
  it('creates a store with default thread state', () => {
    const store = createAgentChatStore();
    const state = store.getState();
    expect(state.activeThread).toBeNull();
    expect(state.canSend).toBe(false);
    expect(state.draft).toBe('');
    expect(state.error).toBeNull();
    expect(state.hasProject).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.isSending).toBe(false);
    expect(state.pendingUserMessage).toBeNull();
  });

  it('creates a store with default details state', () => {
    const store = createAgentChatStore();
    const state = store.getState();
    expect(state.isDetailsOpen).toBe(false);
    expect(state.details).toBeNull();
    expect(state.detailsError).toBeNull();
    expect(state.detailsIsLoading).toBe(false);
  });

  it('creates a store with default context files state', () => {
    const store = createAgentChatStore();
    const state = store.getState();
    expect(state.pinnedFiles).toEqual([]);
    expect(state.contextSummary).toBeNull();
    expect(state.autocompleteResults).toEqual([]);
    expect(state.isAutocompleteOpen).toBe(false);
    expect(state.mentions).toEqual([]);
    expect(state.allFiles).toEqual([]);
    expect(state.attachments).toEqual([]);
  });

  it('creates a store with default model state', () => {
    const store = createAgentChatStore();
    const state = store.getState();
    expect(state.settingsModel).toBe('');
    expect(state.codexSettingsModel).toBe('');
    expect(state.defaultProvider).toBe('claude-code');
    expect(state.modelProviders).toEqual([]);
    expect(state.codexModels).toEqual([]);
  });

  it('creates a store with default queue and slash state', () => {
    const store = createAgentChatStore();
    const state = store.getState();
    expect(state.queuedMessages).toEqual([]);
    expect(state.slashCommandContext).toBeNull();
  });

  it('actions are no-op functions initially', () => {
    const store = createAgentChatStore();
    const state = store.getState();
    expect(typeof state.onSend).toBe('function');
    expect(typeof state.onStop).toBe('function');
    expect(typeof state.onDraftChange).toBe('function');
    expect(typeof state.closeDetails).toBe('function');
  });

  it('each createAgentChatStore call returns an independent instance', () => {
    const storeA = createAgentChatStore();
    const storeB = createAgentChatStore();
    storeA.setState({ draft: 'hello' });
    expect(storeB.getState().draft).toBe('');
  });

  it('setState merges correctly', () => {
    const store = createAgentChatStore();
    store.setState({ draft: 'test draft', hasProject: true });
    const state = store.getState();
    expect(state.draft).toBe('test draft');
    expect(state.hasProject).toBe(true);
    expect(state.canSend).toBe(false); // unchanged
  });

  it('actions can be replaced via setState', () => {
    const store = createAgentChatStore();
    const newOnSend = async (): Promise<void> => { /* real impl */ };
    store.setState({ onSend: newOnSend });
    expect(store.getState().onSend).toBe(newOnSend);
  });
});
