import { describe, expect, it } from 'vitest'

import {
  StaticProviderAdapterRegistry,
  createProviderArtifact,
  createProviderProgressEvent,
  createProviderSessionReference,
  type ProviderAdapter,
} from './providerAdapter'

type TestProvider = 'claude-code' | 'codex'

function createCapabilities(provider: TestProvider) {
  return provider === 'claude-code'
    ? {
      provider,
      supportsStreaming: true,
      supportsResume: true,
      supportsStructuredEdits: false,
      supportsToolUse: true,
      supportsContextCaching: false,
      maxContextHint: null,
      requiresTerminalSession: true,
      requiresHookEvents: true,
    }
    : {
      provider,
      supportsStreaming: false,
      supportsResume: false,
      supportsStructuredEdits: false,
      supportsToolUse: false,
      supportsContextCaching: false,
      maxContextHint: null,
      requiresTerminalSession: false,
      requiresHookEvents: false,
    }
}

function createAdapter(provider: TestProvider): ProviderAdapter {
  const session = createProviderSessionReference(provider, { sessionId: `${provider}-session` })
  const status = provider === 'claude-code' ? 'streaming' : 'completed'

  return {
    provider,
    getCapabilities: () => createCapabilities(provider),
    submitTask: async () => ({ artifact: createProviderArtifact({ provider, status, session, submittedAt: provider === 'claude-code' ? 1 : 2, completedAt: status === 'completed' ? 2 : undefined }), session }),
    resumeTask: async () => ({ artifact: createProviderArtifact({ provider, status, session, submittedAt: provider === 'claude-code' ? 1 : 2, completedAt: status === 'completed' ? 2 : undefined }), session }),
    cancelTask: async () => undefined,
  }
}

function registerPayloadIdentityTest(): void {
  it('builds provider session, artifact, and progress event payloads with the provider identity preserved', () => {
    const session = createProviderSessionReference('codex', { sessionId: 'provider-session-1', requestId: 'request-1' })
    const artifact = createProviderArtifact({ provider: 'codex', status: 'completed', session, submittedAt: 10, completedAt: 20, lastMessage: 'Done' })
    const progress = createProviderProgressEvent({ provider: 'codex', status: 'queued', message: 'Queued', timestamp: 15, session })

    expect(session).toEqual({ provider: 'codex', sessionId: 'provider-session-1', requestId: 'request-1' })
    expect(artifact).toEqual({ provider: 'codex', status: 'completed', session, submittedAt: 10, completedAt: 20, lastMessage: 'Done' })
    expect(progress).toEqual({ provider: 'codex', status: 'queued', message: 'Queued', timestamp: 15, session })
  })
}

function registerRegistryLookupTest(): void {
  it('returns adapters by provider and preserves registration order in list()', () => {
    const claudeAdapter = createAdapter('claude-code')
    const codexAdapter = createAdapter('codex')
    const registry = new StaticProviderAdapterRegistry([claudeAdapter, codexAdapter])

    expect(registry.get('claude-code')).toBe(claudeAdapter)
    expect(registry.get('codex')).toBe(codexAdapter)
    expect(registry.list()).toEqual([claudeAdapter, codexAdapter])
  })
}

describe('providerAdapter helpers', () => {
  registerPayloadIdentityTest()
  registerRegistryLookupTest()
})
