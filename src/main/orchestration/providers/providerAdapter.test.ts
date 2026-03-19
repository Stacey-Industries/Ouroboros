import { describe, expect, it } from 'vitest'

import type { ProviderProgressEvent } from '../types'
import {
  createProviderArtifact,
  createProviderSessionReference,
} from './providerAdapter'

describe('providerAdapter helpers', () => {
  it('builds provider session, artifact, and progress event payloads with the provider identity preserved', () => {
    const session = createProviderSessionReference('claude-code', { sessionId: 'provider-session-1', requestId: 'request-1' })
    const artifact = createProviderArtifact({ provider: 'claude-code', status: 'completed', session, submittedAt: 10, completedAt: 20, lastMessage: 'Done' })
    const progress: ProviderProgressEvent = { provider: 'claude-code', status: 'queued', message: 'Queued', timestamp: 15, session }

    expect(session).toEqual({ provider: 'claude-code', sessionId: 'provider-session-1', requestId: 'request-1' })
    expect(artifact).toEqual({ provider: 'claude-code', status: 'completed', session, submittedAt: 10, completedAt: 20, lastMessage: 'Done' })
    expect(progress).toEqual({ provider: 'claude-code', status: 'queued', message: 'Queued', timestamp: 15, session })
  })
})
