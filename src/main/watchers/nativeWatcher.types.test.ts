import { describe, expect, it } from 'vitest'

import type {
  WatchCallback,
  WatchEvent,
  WatchEventType,
  WatchOptions,
  WatchSubscription,
} from './nativeWatcher.types'

describe('nativeWatcher.types', () => {
  it('allows WatchEvent values with the three documented types', () => {
    const create: WatchEvent = { type: 'create', path: '/tmp/a' }
    const update: WatchEvent = { type: 'update', path: '/tmp/b' }
    const del: WatchEvent = { type: 'delete', path: '/tmp/c' }
    expect([create.type, update.type, del.type]).toEqual(['create', 'update', 'delete'])
  })

  it('accepts an ignore glob list in WatchOptions', () => {
    const opts: WatchOptions = { ignore: ['**/node_modules/**', '**/.git/**'] }
    expect(opts.ignore?.length).toBe(2)
  })

  it('allows WatchOptions with no ignore list', () => {
    const opts: WatchOptions = {}
    expect(opts.ignore).toBeUndefined()
  })

  it('treats WatchCallback as a function accepting a WatchEvent', () => {
    const received: WatchEvent[] = []
    const cb: WatchCallback = (e) => received.push(e)
    cb({ type: 'create', path: '/tmp/x' })
    expect(received).toEqual([{ type: 'create', path: '/tmp/x' }])
  })

  it('describes WatchSubscription as having an async close()', async () => {
    let closed = false
    const sub: WatchSubscription = {
      close: async () => {
        closed = true
      },
    }
    await sub.close()
    expect(closed).toBe(true)
  })

  it('accepts all three literal WatchEventType values', () => {
    const values: WatchEventType[] = ['create', 'update', 'delete']
    expect(values).toHaveLength(3)
  })
})
