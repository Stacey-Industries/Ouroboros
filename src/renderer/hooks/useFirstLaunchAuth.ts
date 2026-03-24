/**
 * useFirstLaunchAuth.ts — Opens Settings to the Accounts tab on first launch
 * when no auth providers are connected, so users know they need to sign in.
 *
 * Fires once per install (persists `authOnboardingDismissed` to config).
 */

import { useEffect, useRef } from 'react';

import { OPEN_SETTINGS_PANEL_EVENT } from './appEventNames';
import { useAuth } from './useAuth';

const OPEN_DELAY_MS = 500;

function allUnauthenticated(
  states: { status: string }[],
): boolean {
  return (
    states.length > 0 &&
    states.every((s) => s.status === 'unauthenticated')
  );
}

async function shouldPrompt(): Promise<boolean> {
  if (!window.electronAPI?.config) return false;
  const dismissed = await window.electronAPI.config.get(
    'authOnboardingDismissed',
  );
  return !dismissed;
}

function openSettingsToAccounts(): void {
  window.dispatchEvent(
    new CustomEvent(OPEN_SETTINGS_PANEL_EVENT, {
      detail: { tab: 'accounts' },
    }),
  );
}

async function markDismissed(): Promise<void> {
  await window.electronAPI.config.set(
    'authOnboardingDismissed',
    true,
  );
}

export function useFirstLaunchAuth(): void {
  const { states, loading } = useAuth();
  const firedRef = useRef(false);

  useEffect(() => {
    if (loading || firedRef.current) return;
    if (!allUnauthenticated(states)) return;
    firedRef.current = true;

    void shouldPrompt().then((should) => {
      if (!should) return;
      setTimeout(() => {
        openSettingsToAccounts();
        void markDismissed();
      }, OPEN_DELAY_MS);
    });
  }, [states, loading]);
}
