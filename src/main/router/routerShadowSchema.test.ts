/**
 * routerShadowSchema.test.ts — smoke tests for the router-shadow schema constants.
 *
 * The substantive contract tests (dedup, drain dispatch, weightsVersion) live
 * in routerShadowDrainHandler.test.ts. This file just guards the exported
 * constants against accidental mutation.
 */

import { describe, expect, it } from 'vitest';

import {
  ROUTER_SHADOW_SCHEMA_VERSION,
  ROUTER_SHADOW_SURFACE,
  type RouterShadowRecord,
} from './routerShadowSchema';

describe('routerShadowSchema constants', () => {
  it('ROUTER_SHADOW_SURFACE is the expected string', () => {
    expect(ROUTER_SHADOW_SURFACE).toBe('router-shadow');
  });

  it('ROUTER_SHADOW_SCHEMA_VERSION is 1', () => {
    expect(ROUTER_SHADOW_SCHEMA_VERSION).toBe(1);
  });

  it('RouterShadowRecord shape is structurally correct', () => {
    // Compile-time check: assign a conforming object. If the type changes
    // incompatibly this will fail at tsc, not just at runtime.
    const record: RouterShadowRecord = {
      sessionId: 'sess-abc',
      prompt: 'hello',
      cwd: '/home/user/project',
      ts: Date.now(),
    };
    expect(record.sessionId).toBe('sess-abc');
    expect(record.prompt).toBe('hello');
    expect(typeof record.ts).toBe('number');
  });
});
