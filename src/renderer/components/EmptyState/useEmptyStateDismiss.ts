/**
 * useEmptyStateDismiss.ts — dismiss state management for empty-state prompts.
 * Wave 38 Phase C.
 *
 * Two dismiss modes:
 *   1. Session-only (no dismissKey) — React state only; resets on reload.
 *   2. Persistent (dismissKey provided) — writes config.platform.dismissedEmptyStates[key].
 */
import { useCallback, useEffect, useState } from 'react';

import { useConfig } from '../../hooks/useConfig';

export interface UseEmptyStateDismissOptions {
  /** When provided, dismiss persists to config; otherwise session-only. */
  dismissKey?: string;
}

export interface UseEmptyStateDismissReturn {
  isDismissed: boolean;
  dismiss: () => void;
}

function readPersistedDismiss(
  config: ReturnType<typeof useConfig>['config'],
  dismissKey: string,
): boolean {
  return config?.platform?.dismissedEmptyStates?.[dismissKey] === true;
}

function buildUpdatedPlatform(
  config: ReturnType<typeof useConfig>['config'],
  dismissKey: string,
): NonNullable<ReturnType<typeof useConfig>['config']>['platform'] {
  const current = config?.platform ?? {};
  const existing = current.dismissedEmptyStates ?? {};
  return { ...current, dismissedEmptyStates: { ...existing, [dismissKey]: true } };
}

/**
 * useEmptyStateDismiss — session + optional persistent dismiss for empty states.
 */
export function useEmptyStateDismiss(
  opts: UseEmptyStateDismissOptions,
): UseEmptyStateDismissReturn {
  const { dismissKey } = opts;
  const { config, set } = useConfig();

  const persistedInitial = dismissKey ? readPersistedDismiss(config, dismissKey) : false;
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [persistedDismissed, setPersistedDismissed] = useState(persistedInitial);

  // Keep persistent state in sync when config changes externally.
  useEffect(() => {
    if (!dismissKey) return;
    setPersistedDismissed(readPersistedDismiss(config, dismissKey));
  }, [config, dismissKey]);

  const dismiss = useCallback(() => {
    setSessionDismissed(true);
    if (!dismissKey) return;
    setPersistedDismissed(true);
    const updated = buildUpdatedPlatform(config, dismissKey);
    void set('platform', updated);
  }, [config, set, dismissKey]);

  const isDismissed = dismissKey ? persistedDismissed : sessionDismissed;

  return { isDismissed, dismiss };
}
