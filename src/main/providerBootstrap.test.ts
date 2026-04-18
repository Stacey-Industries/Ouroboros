/**
 * Wave 36 Phase B — providerBootstrap smoke tests.
 *
 * Verifies that registerBuiltinProviders() registers a ClaudeSessionProvider
 * with id 'claude' in the registry without actually spawning anything.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before module imports
// ---------------------------------------------------------------------------

const mockProviderInstance = {
  id: 'claude',
  label: 'Claude (Anthropic)',
  binary: 'claude',
  checkAvailability: vi.fn(),
  spawn: vi.fn(),
  send: vi.fn(),
  cancel: vi.fn(),
  onEvent: vi.fn(),
}

vi.mock('./providers/claudeSessionProvider', () => {
  function ClaudeSessionProvider() { return mockProviderInstance }
  return { ClaudeSessionProvider }
})

vi.mock('./providers/providerRegistry', () => ({
  registerSessionProvider: vi.fn(),
}))

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { registerBuiltinProviders } from './providerBootstrap'
import { registerSessionProvider } from './providers/providerRegistry'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

describe('registerBuiltinProviders', () => {
  it('constructs a ClaudeSessionProvider and registers it', () => {
    registerBuiltinProviders()
    expect(registerSessionProvider).toHaveBeenCalledOnce()
    expect(registerSessionProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'claude' }),
    )
  })

  it('can be called multiple times without throwing', () => {
    expect(() => {
      registerBuiltinProviders()
      registerBuiltinProviders()
    }).not.toThrow()
  })
})
