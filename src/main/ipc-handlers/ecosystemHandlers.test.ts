/**
 * ecosystemHandlers.test.ts — Smoke tests for Wave 37 Phase B ecosystem IPC registrar.
 */

import { describe, expect, it } from 'vitest'

import { registerEcosystemHandlers } from './ecosystemHandlers'

describe('registerEcosystemHandlers', () => {
  it('returns the ecosystem:promptDiff channel name', () => {
    const channels = registerEcosystemHandlers()
    expect(channels).toContain('ecosystem:promptDiff')
  })

  it('returns an array (registration contract)', () => {
    const channels = registerEcosystemHandlers()
    expect(Array.isArray(channels)).toBe(true)
    expect(channels.length).toBeGreaterThan(0)
  })
})
