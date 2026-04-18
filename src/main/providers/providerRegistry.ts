/**
 * Wave 36 Phase A — SessionProvider registry.
 *
 * Module-level Map backing the registry. Tests isolate state via
 * `vi.resetModules()` rather than a public `clear()` API — intentional.
 */

import type { SessionProvider } from './sessionProvider';

const DEFAULT_PROVIDER_ID = 'claude';

const registry = new Map<string, SessionProvider>();

/**
 * Register a `SessionProvider`. If a provider with the same `id` already
 * exists it is replaced (last-write-wins).
 */
export function registerSessionProvider(provider: SessionProvider): void {
  registry.set(provider.id, provider);
}

/**
 * Retrieve a registered provider by id.
 * Returns `null` when the id is unknown — callers must handle the absent case.
 */
export function getSessionProvider(id: string): SessionProvider | null {
  return registry.get(id) ?? null;
}

/**
 * List all registered providers in insertion order.
 * Returns a readonly snapshot — mutations to the returned array have no effect.
 */
export function listSessionProviders(): readonly SessionProvider[] {
  return Array.from(registry.values());
}

/** The id of the built-in default provider. Always `'claude'`. */
export function getDefaultProviderId(): string {
  return DEFAULT_PROVIDER_ID;
}
