/**
 * concurrency.test.ts — Smoke tests for mapConcurrent + defaultConcurrency.
 */

import { describe, expect, it } from 'vitest'

import { defaultConcurrency, mapConcurrent } from './concurrency'

describe('defaultConcurrency', () => {
  it('is clamped into the [4, 16] range', () => {
    expect(defaultConcurrency).toBeGreaterThanOrEqual(4)
    expect(defaultConcurrency).toBeLessThanOrEqual(16)
  })
})

describe('mapConcurrent', () => {
  it('returns empty array for empty input without invoking fn', async () => {
    let called = 0
    const result = await mapConcurrent<number, number>([], async (x) => {
      called++
      return x
    })
    expect(result).toEqual([])
    expect(called).toBe(0)
  })

  it('preserves input order regardless of completion order', async () => {
    const result = await mapConcurrent([10, 20, 30, 40], async (value, index) => {
      // Earlier items finish later; reversed completion order.
      await new Promise((r) => setTimeout(r, (4 - index) * 5))
      return value * 2
    })
    expect(result).toEqual([20, 40, 60, 80])
  })

  it('caps the number of in-flight operations at the given limit', async () => {
    let inFlight = 0
    let peak = 0
    const items = Array.from({ length: 50 }, (_, i) => i)

    await mapConcurrent(
      items,
      async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight--
      },
      4,
    )

    expect(peak).toBeLessThanOrEqual(4)
    expect(peak).toBeGreaterThan(0)
  })

  it('clamps non-positive limits to at least 1', async () => {
    let peak = 0
    let inFlight = 0
    await mapConcurrent(
      [1, 2, 3],
      async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 2))
        inFlight--
      },
      0,
    )
    expect(peak).toBe(1)
  })

  it('passes index as the second argument', async () => {
    const result = await mapConcurrent(['a', 'b', 'c'], async (item, index) => `${index}:${item}`)
    expect(result).toEqual(['0:a', '1:b', '2:c'])
  })
})
