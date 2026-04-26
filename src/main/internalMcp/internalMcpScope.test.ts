import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({ getConfigValue: vi.fn() }));

import { getConfigValue } from '../config';
import { resolveInternalMcpScope } from './internalMcpScope';

const mockGet = vi.mocked(getConfigValue);

function configure(map: Record<string, unknown>) {
  mockGet.mockImplementation((key: string) => (key in map ? map[key as keyof typeof map] : undefined));
}

describe('resolveInternalMcpScope', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('returns false when internalMcpEnabled=false', () => {
    configure({ internalMcpEnabled: false, internalMcpScope: 'always' });
    const result = resolveInternalMcpScope({ goalShape: 'code' });
    expect(result.shouldInjectOuroboros).toBe(false);
    expect(result.reason).toContain('internalMcpEnabled');
  });

  it('scope=always injects regardless of goal shape', () => {
    configure({ internalMcpEnabled: true, internalMcpScope: 'always' });
    expect(resolveInternalMcpScope({ goalShape: 'casual' }).shouldInjectOuroboros).toBe(true);
    expect(resolveInternalMcpScope({ goalShape: 'code' }).shouldInjectOuroboros).toBe(true);
  });

  it('scope=never blocks regardless of goal shape', () => {
    configure({ internalMcpEnabled: true, internalMcpScope: 'never' });
    expect(resolveInternalMcpScope({ goalShape: 'code' }).shouldInjectOuroboros).toBe(false);
  });

  it('scope=task-gated skips casual goals', () => {
    configure({ internalMcpEnabled: true, internalMcpScope: 'task-gated' });
    const r = resolveInternalMcpScope({ goalShape: 'casual' });
    expect(r.shouldInjectOuroboros).toBe(false);
    expect(r.reason).toContain('casual');
  });

  it('scope=task-gated injects code goals', () => {
    configure({ internalMcpEnabled: true, internalMcpScope: 'task-gated' });
    expect(resolveInternalMcpScope({ goalShape: 'code' }).shouldInjectOuroboros).toBe(true);
  });

  it('scope=task-gated injects unknown goals (safe default)', () => {
    configure({ internalMcpEnabled: true, internalMcpScope: 'task-gated' });
    expect(resolveInternalMcpScope({ goalShape: 'unknown' }).shouldInjectOuroboros).toBe(true);
  });

  it('default scope (unset) is task-gated', () => {
    configure({ internalMcpEnabled: true });
    expect(resolveInternalMcpScope({ goalShape: 'casual' }).shouldInjectOuroboros).toBe(false);
    expect(resolveInternalMcpScope({ goalShape: 'code' }).shouldInjectOuroboros).toBe(true);
  });

  it('forceInclude overrides task-gating', () => {
    configure({ internalMcpEnabled: true, internalMcpScope: 'task-gated' });
    const r = resolveInternalMcpScope({ goalShape: 'casual', forceInclude: true });
    expect(r.shouldInjectOuroboros).toBe(true);
  });

  it('forceExclude overrides scope=always', () => {
    configure({ internalMcpEnabled: true, internalMcpScope: 'always' });
    const r = resolveInternalMcpScope({ goalShape: 'code', forceExclude: true });
    expect(r.shouldInjectOuroboros).toBe(false);
  });

  it('internalMcpEnabled:false beats forceInclude', () => {
    configure({ internalMcpEnabled: false });
    const r = resolveInternalMcpScope({ goalShape: 'code', forceInclude: true });
    expect(r.shouldInjectOuroboros).toBe(false);
  });
});
