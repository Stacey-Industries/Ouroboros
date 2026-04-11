import { describe, expect, it } from 'vitest';

import { createAgentChatStore } from './agentChatStore';

describe('AgentChatWorkspace store integration', () => {
  it('createAgentChatStore returns a store with default state', () => {
    const store = createAgentChatStore();
    const state = store.getState();
    expect(state.activeThread).toBeNull();
    expect(state.canSend).toBe(false);
    expect(state.draft).toBe('');
    expect(state.isSending).toBe(false);
  });

  it('store.setState syncs thread state', () => {
    const store = createAgentChatStore();
    store.setState({ draft: 'hello', canSend: true });
    expect(store.getState().draft).toBe('hello');
    expect(store.getState().canSend).toBe(true);
  });

  it('store.setState syncs actions', () => {
    const store = createAgentChatStore();
    const fn = async () => { /* noop */ };
    store.setState({ onSend: fn });
    expect(store.getState().onSend).toBe(fn);
  });

  it('each createAgentChatStore call returns an independent instance', () => {
    const a = createAgentChatStore();
    const b = createAgentChatStore();
    a.setState({ draft: 'a' });
    b.setState({ draft: 'b' });
    expect(a.getState().draft).toBe('a');
    expect(b.getState().draft).toBe('b');
  });
});
