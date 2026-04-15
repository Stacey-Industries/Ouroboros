/**
 * sessionStartup.ts — Startup wrapper for the session subsystem.
 *
 * Extracted so main.ts can initialise sessions with a single call without
 * inflating main.ts past its 300-line ESLint cap.
 */

import type { AppConfig } from '../config';
import { runSessionGc, SEVEN_DAYS_MS } from './sessionGc';
import { migrateWindowSessionsToSessions } from './sessionMigration';
import { closeSessionStore, initSessionStore } from './sessionStore';

export interface ConfigAccess {
  get: <K extends keyof AppConfig>(key: K) => AppConfig[K];
  set: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

let gcInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Initialise the session store and migrate windowSessions → sessionsData.
 * Called from main.ts after telemetry is up and before window creation.
 */
export async function initSessionServices(config: ConfigAccess): Promise<void> {
  initSessionStore();
  await migrateWindowSessionsToSessions(config.get, config.set);
  // Run GC once at startup, then weekly.
  void runSessionGc(Date.now());
  gcInterval = setInterval(() => { void runSessionGc(Date.now()); }, SEVEN_DAYS_MS);
}

/** Mirror of closeSessionStore for use in the will-quit cleanup chain. */
export function closeSessionServices(): void {
  if (gcInterval) {
    clearInterval(gcInterval);
    gcInterval = null;
  }
  closeSessionStore();
}
