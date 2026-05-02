/**
 * internalMcpRoutingPolicy.test.ts — Wave 51 Phase C, Wave 53l Phase B.
 *
 * Pure-function matrix coverage for `decideInternalMcpRouting`. Wave 53l
 * Phase B replaced the per-spawn `routeInternalMcp` opt-in with the
 * `ouroborosExcludedFromMultiplex` exclusion check — same shape, inverted
 * semantics: route-through-codemode is the default when codemode is on,
 * and exclusion is the per-server escape hatch.
 *
 * Wave 79: `internalMcp.transport` config key removed. Transport guard
 * tests deleted — the standalone is always stdio; no branching needed.
 */

import { describe, expect, it } from 'vitest';

import {
  decideInternalMcpRouting,
  downgradeOnCodemodeFailure,
  type RoutingInputs,
} from './internalMcpRoutingPolicy';

function inputs(overrides: Partial<RoutingInputs> = {}): RoutingInputs {
  return {
    codemodeEnabled: false,
    ouroborosExcludedFromMultiplex: false,
    internalMcpScope: 'task-gated',
    taskNeedsGraphTools: true,
    ...overrides,
  };
}

describe('decideInternalMcpRouting — scope=never', () => {
  it('returns omit regardless of other inputs (codemode off)', () => {
    expect(decideInternalMcpRouting(inputs({ internalMcpScope: 'never' }))).toBe('omit');
  });

  it('returns omit even with codemode on + graph task', () => {
    expect(
      decideInternalMcpRouting(
        inputs({
          internalMcpScope: 'never',
          codemodeEnabled: true,
          taskNeedsGraphTools: true,
        }),
      ),
    ).toBe('omit');
  });
});

describe('decideInternalMcpRouting — scope=task-gated', () => {
  it('omits when task does not need graph tools', () => {
    expect(
      decideInternalMcpRouting(
        inputs({ internalMcpScope: 'task-gated', taskNeedsGraphTools: false }),
      ),
    ).toBe('omit');
  });

  it('omits even with codemode on when task does not need graph tools', () => {
    expect(
      decideInternalMcpRouting(
        inputs({
          internalMcpScope: 'task-gated',
          taskNeedsGraphTools: false,
          codemodeEnabled: true,
        }),
      ),
    ).toBe('omit');
  });

  it('direct-inject when task needs tools but codemode off', () => {
    expect(decideInternalMcpRouting(inputs({ taskNeedsGraphTools: true }))).toBe('direct-inject');
  });

  it('routes through codemode by default when codemode on', () => {
    expect(
      decideInternalMcpRouting(
        inputs({
          taskNeedsGraphTools: true,
          codemodeEnabled: true,
        }),
      ),
    ).toBe('route-through-codemode');
  });

  it('direct-inject when ouroboros is in excludeFromMultiplex', () => {
    expect(
      decideInternalMcpRouting(
        inputs({
          taskNeedsGraphTools: true,
          codemodeEnabled: true,
          ouroborosExcludedFromMultiplex: true,
        }),
      ),
    ).toBe('direct-inject');
  });
});

describe('decideInternalMcpRouting — scope=always', () => {
  it('direct-inject when codemode is off', () => {
    expect(
      decideInternalMcpRouting(inputs({ internalMcpScope: 'always', taskNeedsGraphTools: false })),
    ).toBe('direct-inject');
  });

  it('routes through codemode when codemode on (regardless of task signal)', () => {
    expect(
      decideInternalMcpRouting(
        inputs({
          internalMcpScope: 'always',
          taskNeedsGraphTools: false,
          codemodeEnabled: true,
        }),
      ),
    ).toBe('route-through-codemode');
  });

  it('direct-inject when codemode on but ouroboros excluded', () => {
    expect(
      decideInternalMcpRouting(
        inputs({
          internalMcpScope: 'always',
          codemodeEnabled: true,
          ouroborosExcludedFromMultiplex: true,
        }),
      ),
    ).toBe('direct-inject');
  });
});

describe('decideInternalMcpRouting — full matrix smoke', () => {
  const cases: Array<{ name: string; in: Partial<RoutingInputs>; want: string }> = [
    {
      name: 'never + codemode off → omit',
      in: { internalMcpScope: 'never' },
      want: 'omit',
    },
    {
      name: 'task-gated + casual + codemode off → omit',
      in: { internalMcpScope: 'task-gated', taskNeedsGraphTools: false },
      want: 'omit',
    },
    {
      name: 'task-gated + code + codemode off → direct-inject',
      in: { internalMcpScope: 'task-gated', taskNeedsGraphTools: true },
      want: 'direct-inject',
    },
    {
      name: 'always + codemode off → direct-inject',
      in: { internalMcpScope: 'always', taskNeedsGraphTools: false },
      want: 'direct-inject',
    },
    {
      name: 'task-gated + code + codemode on → routed (default)',
      in: {
        internalMcpScope: 'task-gated',
        taskNeedsGraphTools: true,
        codemodeEnabled: true,
      },
      want: 'route-through-codemode',
    },
    {
      name: 'task-gated + code + codemode on + ouroboros excluded → direct-inject',
      in: {
        internalMcpScope: 'task-gated',
        taskNeedsGraphTools: true,
        codemodeEnabled: true,
        ouroborosExcludedFromMultiplex: true,
      },
      want: 'direct-inject',
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(decideInternalMcpRouting(inputs(c.in))).toBe(c.want);
    });
  }
});

describe('downgradeOnCodemodeFailure', () => {
  it('downgrades route-through-codemode to direct-inject', () => {
    expect(downgradeOnCodemodeFailure('route-through-codemode')).toBe('direct-inject');
  });

  it('preserves direct-inject as-is', () => {
    expect(downgradeOnCodemodeFailure('direct-inject')).toBe('direct-inject');
  });

  it('preserves omit (intentional gate, not a failure mode)', () => {
    expect(downgradeOnCodemodeFailure('omit')).toBe('omit');
  });
});
