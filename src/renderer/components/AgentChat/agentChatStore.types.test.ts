import { describe, expectTypeOf, it } from 'vitest';

import type { AgentChatActions, AgentChatStore, AgentChatThreadState } from './agentChatStore.types';

describe('agentChatStore.types', () => {
  it('AgentChatStore includes thread state fields', () => {
    expectTypeOf<AgentChatStore>().toMatchTypeOf<AgentChatThreadState>();
  });

  it('AgentChatStore includes action fields', () => {
    expectTypeOf<AgentChatStore>().toMatchTypeOf<AgentChatActions>();
  });

  it('action references are functions', () => {
    expectTypeOf<AgentChatActions['onSend']>().toBeFunction();
    expectTypeOf<AgentChatActions['onStop']>().toBeFunction();
    expectTypeOf<AgentChatActions['onDraftChange']>().toBeFunction();
  });
});
