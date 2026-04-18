/**
 * Wave 36 Phase C — providerBootstrap unit tests.
 *
 * Verifies that registerBuiltinProviders populates the registry with both the
 * Claude and Codex providers. Uses vi.resetModules() between tests to isolate
 * the module-level registry map.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./claudeSessionProvider', () => ({
  ClaudeSessionProvider: vi.fn(function (this: Record<string, unknown>) {
    this.id = 'claude'
    this.label = 'Claude (Anthropic)'
    this.binary = 'claude'
  }),
}))

vi.mock('./codexSessionProvider', () => ({
  CodexSessionProvider: vi.fn(function (this: Record<string, unknown>) {
    this.id = 'codex'
    this.label = 'Codex (OpenAI)'
    this.binary = 'codex'
  }),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ClaudeSessionProvider } from './claudeSessionProvider'
import { CodexSessionProvider } from './codexSessionProvider'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerBuiltinProviders', () => {
  it('registers both Claude and Codex providers into the registry', async () => {
    // Reset modules so the registry map starts empty for this test.
    vi.resetModules()
    const { registerBuiltinProviders } = await import('./providerBootstrap')
    const { listSessionProviders } = await import('./providerRegistry')

    registerBuiltinProviders()

    const providers = listSessionProviders()
    const ids = providers.map((p) => p.id)
    expect(ids).toContain('claude')
    expect(ids).toContain('codex')
  })

  it('constructs exactly one ClaudeSessionProvider and one CodexSessionProvider', async () => {
    vi.resetModules()
    const { registerBuiltinProviders } = await import('./providerBootstrap')

    registerBuiltinProviders()

    expect(ClaudeSessionProvider).toHaveBeenCalledOnce()
    expect(CodexSessionProvider).toHaveBeenCalledOnce()
  })

  it('calling twice replaces providers (last-write-wins registry semantics)', async () => {
    vi.resetModules()
    const { registerBuiltinProviders } = await import('./providerBootstrap')
    const { listSessionProviders } = await import('./providerRegistry')

    registerBuiltinProviders()
    registerBuiltinProviders()

    // Should still have exactly 2 providers — no duplicates.
    const providers = listSessionProviders()
    const ids = providers.map((p) => p.id)
    expect(ids.filter((id) => id === 'claude')).toHaveLength(1)
    expect(ids.filter((id) => id === 'codex')).toHaveLength(1)
  })

  it('registered Claude provider has the expected shape', async () => {
    vi.resetModules()
    const { registerBuiltinProviders } = await import('./providerBootstrap')
    const { getSessionProvider } = await import('./providerRegistry')

    registerBuiltinProviders()

    const claude = getSessionProvider('claude')
    expect(claude).not.toBeNull()
    expect(claude?.id).toBe('claude')
    expect(claude?.binary).toBe('claude')
  })

  it('registered Codex provider has the expected shape', async () => {
    vi.resetModules()
    const { registerBuiltinProviders } = await import('./providerBootstrap')
    const { getSessionProvider } = await import('./providerRegistry')

    registerBuiltinProviders()

    const codex = getSessionProvider('codex')
    expect(codex).not.toBeNull()
    expect(codex?.id).toBe('codex')
    expect(codex?.binary).toBe('codex')
  })
})
