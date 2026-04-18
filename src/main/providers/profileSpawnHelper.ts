/**
 * Wave 36 Phase E — profile-aware session spawn helper.
 *
 * Routes a spawn request through the SessionProvider registry based on
 * `profile.providerId`. Falls back to 'claude' when the field is absent.
 *
 * Existing call sites that invoke `spawnAgentPty` directly (without a profile)
 * are NOT affected — this helper is only used on the profile-aware paths.
 *
 * Usage:
 *   const handle = await spawnForProfile(profile, spawnOpts);
 */

import type { Profile } from '@shared/types/profile';

import log from '../logger';
import { getDefaultProviderId, getSessionProvider } from './providerRegistry';
import type { ProfileSnapshot, SessionHandle, SpawnOptions } from './sessionProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Spawn options without the profile field — the helper injects it. */
export type ProfileSpawnOptions = Omit<SpawnOptions, 'profile'>;

/**
 * Extract the `ProfileSnapshot` shape from a `Profile`.
 * `ProfileSnapshot.permissionMode` uses 'allow'|'deny'|'prompt' — the profile
 * field uses 'normal'|'plan'|'bypass'. Providers only see the snapshot shape,
 * so we drop the permissionMode field here (adapters build CLI args separately).
 */
function toProfileSnapshot(profile: Profile): ProfileSnapshot {
  return { id: profile.id, model: profile.model, tools: profile.enabledTools };
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Resolve a session provider from `profile.providerId` (defaulting to 'claude')
 * and spawn a session with the given options.
 *
 * Throws:
 * - When the resolved provider id is not registered in the registry.
 * - When the provider's own `spawn()` rejects.
 */
export async function spawnForProfile(
  profile: Profile,
  opts: ProfileSpawnOptions,
): Promise<SessionHandle> {
  const providerId = profile.providerId ?? getDefaultProviderId();
  const provider = getSessionProvider(providerId);
  if (!provider) {
    throw new Error(
      `[spawnForProfile] Unknown provider: "${providerId}". ` +
      `Register it via registerSessionProvider() before spawning.`,
    );
  }
  log.info(`[spawnForProfile] session=${opts.sessionId} provider=${providerId}`);
  return provider.spawn({ ...opts, profile: toProfileSnapshot(profile) });
}
