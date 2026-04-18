/**
 * Wave 36 Phase D — providerBootstrap unit tests (updated).
 *
 * Verifies that registerBuiltinProviders populates the registry with Claude,
 * Codex, and Gemini providers. Uses vi.resetModules() between tests to isolate
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

vi.mock('./geminiSessionProvider', () => ({
  GeminiSessionProvider: vi.fn(function (this: Record<string, unknown>) {
    this.id = 'gemini'
    this.label = 'Gemini (Google)'
    this.binary = 'gemini'
  }),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ClaudeSessionProvider } from './claudeSessionProvider'
import { CodexSessionProvider } from './codexSessionProvider'
import { GeminiSessionProvider } from './geminiSessionProvider'

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
  it('registers Claude, Codex, and Gemini providers into the registry', async () => {
    // Reset modules so the registry map starts empty for this test.
    vi.resetModules()
    const { registerBuiltinProviders } = await import('./providerBootstrap')
    const { listSessionProviders } = await import('./providerRegistry')

    registerBuiltinProviders()

    const providers = listSessionProviders()
    const ids = providers.map((p) => p.id)
    expect(ids).toContain('claude')
    expect(ids).toContain('codex')
    expect(ids).toContain('gemini')
  })

  it('constructs exactly one instance of each builtin provider', async () => {
    vi.resetModules()
    const { registerBuiltinProviders } = await import('./providerBootstrap')

    registerBuiltinProviders()

    expect(ClaudeSessionProvider).toHaveBeenCalledOnce()
    expect(CodexSessionProvider).toHaveBeenCalledOnce()
    expect(GeminiSessionProvider).toHaveBeenCalledOnce()
  })

  it('calling twice replaces providers (last-write-wins registry semantics)', async () => {
    vi.resetModules()
    const { registerBuiltinProviders } = await import('./providerBootstrap')
    const { listSessionProviders } = await import('./providerRegistry')

    registerBuiltinProviders()
    registerBuiltinProviders()

    // Should still have exactly 3 providers — no duplicates.
    const providers = listSessionProviders()
    const ids = providers.map((p) => p.id)
    expect(ids.filter((id) => id === 'claude')).toHaveLength(1)
    expect(ids.filter((id) => id === 'codex')).toHaveLength(1)
    expect(ids.filter((id) => id === 'gemini')).toHaveLength(1)
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

  it('registered Gemini provider has the expected shape', async () => {
    vi.resetModules()
    const { registerBuiltinProviders } = await import('./providerBootstrap')
    const { getSessionProvider } = await import('./providerRegistry')

    registerBuiltinProviders()

    const gemini = getSessionProvider('gemini')
    expect(gemini).not.toBeNull()
    expect(gemini?.id).toBe('gemini')
    expect(gemini?.binary).toBe('gemini')
  })
})
