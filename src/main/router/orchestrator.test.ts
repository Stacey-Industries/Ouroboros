import { describe, expect, it } from 'vitest';

import { logRoutingDecision, routePromptSync } from './orchestrator';
import { DEFAULT_ROUTER_SETTINGS } from './routerTypes';

describe('orchestrator — routePromptSync', () => {
  it('returns null when router is disabled', () => {
    const r = routePromptSync('what do you think?', undefined, {
      enabled: false,
      layer1Enabled: true,
      layer2Enabled: false,
      layer3Enabled: false,
      layer2ConfidenceThreshold: 0.6,
      paranoidMode: false,
    });
    expect(r).toBeNull();
  });

  it('returns OPUS in paranoid mode regardless of prompt', () => {
    const r = routePromptSync('yes', undefined, {
      enabled: true,
      layer1Enabled: true,
      layer2Enabled: false,
      layer3Enabled: false,
      layer2ConfidenceThreshold: 0.6,
      paranoidMode: true,
    });
    expect(r?.tier).toBe('OPUS');
    expect(r?.model).toBe('claude-opus-4-6');
  });

  it('routes slash commands via rule engine', () => {
    const r = routePromptSync('/user:review the auth module');
    expect(r).toMatchObject({
      tier: 'OPUS',
      routedBy: 'rule',
      rule: 'CMD',
      confidence: 1,
    });
  });

  it('routes judgment questions to OPUS', () => {
    const r = routePromptSync('What do you think about this approach?');
    expect(r?.tier).toBe('OPUS');
    expect(r?.routedBy).toBe('rule');
  });

  it('routes confirmations to HAIKU', () => {
    const r = routePromptSync('yes');
    expect(r?.tier).toBe('HAIKU');
    expect(r?.model).toBe('claude-haiku-4-5-20251001');
  });

  it('routes ambiguous prompts via classifier when threshold is low enough', () => {
    const r = routePromptSync('Fix the CSS padding on the sidebar', undefined, {
      ...DEFAULT_ROUTER_SETTINGS,
      layer2ConfidenceThreshold: 0.3, // low threshold so classifier always returns
    });
    expect(r).not.toBeNull();
    expect(r!.routedBy).toBe('classifier');
    expect(['HAIKU', 'SONNET', 'OPUS']).toContain(r!.tier);
  });

  it('returns null for ambiguous prompts when Layer 2 disabled', () => {
    const r = routePromptSync('Fix the CSS padding on the sidebar', undefined, {
      ...DEFAULT_ROUTER_SETTINGS,
      layer2Enabled: false,
    });
    expect(r).toBeNull();
  });

  it('includes latencyMs in the result', () => {
    const r = routePromptSync('/user:explain what this does');
    expect(r?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('logRoutingDecision does not throw', () => {
    const decision = routePromptSync('yes');
    expect(() => logRoutingDecision('yes', decision)).not.toThrow();
    expect(() => logRoutingDecision('test', null)).not.toThrow();
  });
});
