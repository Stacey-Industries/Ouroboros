/**
 * Wave 36 Phase A — providerRegistry tests.
 *
 * Each test imports the registry fresh via vi.resetModules() + dynamic import
 * so module-level Map state doesn't bleed between tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionProvider } from './sessionProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockProvider(id: string, label = `Provider ${id}`): SessionProvider {
  return {
    id,
    label,
    binary: id,
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
    spawn: vi.fn().mockResolvedValue({
      id: `h-${id}`,
      providerId: id,
      ptySessionId: `pty-${id}`,
      startedAt: Date.now(),
      status: 'starting',
    }),
    send: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn().mockReturnValue(() => undefined),
  };
}

// Re-import registry fresh for each test to reset module-level Map.
type RegistryModule = typeof import('./providerRegistry');

let registry: RegistryModule;

beforeEach(async () => {
  vi.resetModules();
  registry = await import('./providerRegistry');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getDefaultProviderId', () => {
  it('returns "claude"', () => {
    expect(registry.getDefaultProviderId()).toBe('claude');
  });
});

describe('registerSessionProvider + getSessionProvider', () => {
  it('retrieves a registered provider by id', () => {
    const p = makeMockProvider('claude');
    registry.registerSessionProvider(p);
    expect(registry.getSessionProvider('claude')).toBe(p);
  });

  it('returns null for an unknown id', () => {
    expect(registry.getSessionProvider('unknown')).toBeNull();
  });

  it('replaces an existing provider on duplicate id', () => {
    const first = makeMockProvider('claude', 'First');
    const second = makeMockProvider('claude', 'Second');
    registry.registerSessionProvider(first);
    registry.registerSessionProvider(second);
    expect(registry.getSessionProvider('claude')).toBe(second);
  });
});

describe('listSessionProviders', () => {
  it('returns empty array when nothing is registered', () => {
    expect(registry.listSessionProviders()).toHaveLength(0);
  });

  it('returns all registered providers in insertion order', () => {
    const claude = makeMockProvider('claude');
    const codex = makeMockProvider('codex');
    const gemini = makeMockProvider('gemini');
    registry.registerSessionProvider(claude);
    registry.registerSessionProvider(codex);
    registry.registerSessionProvider(gemini);

    const list = registry.listSessionProviders();
    expect(list).toHaveLength(3);
    expect(list[0]).toBe(claude);
    expect(list[1]).toBe(codex);
    expect(list[2]).toBe(gemini);
  });

  it('reflects replacement in the list (same length, new reference)', () => {
    const first = makeMockProvider('claude', 'First');
    const second = makeMockProvider('claude', 'Second');
    registry.registerSessionProvider(first);
    registry.registerSessionProvider(second);

    const list = registry.listSessionProviders();
    expect(list).toHaveLength(1);
    expect(list[0]).toBe(second);
  });

  it('returns a snapshot — mutations do not affect the registry', () => {
    registry.registerSessionProvider(makeMockProvider('claude'));
    const list = registry.listSessionProviders() as SessionProvider[];
    list.splice(0, 1);
    expect(registry.listSessionProviders()).toHaveLength(1);
  });
});
