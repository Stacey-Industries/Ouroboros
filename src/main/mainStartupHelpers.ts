/**
 * mainStartupHelpers.ts — Bootstrap helpers extracted from mainStartup.ts
 * to keep that file under the 300-line ESLint limit.
 */

import { app, crashReporter } from 'electron';

import log from './logger';
import { closeEditProvenance as closeEP } from './orchestration/editProvenance';
import { migrateLegacyJsonl, purgeOlderThan } from './orchestration/jsonlRetention';

export function bootstrapCrashReporter(): void {
  crashReporter.start({
    uploadToServer: false,
    compress: true,
  });
}

export function bootstrapApp(): void {
  // Must be called before app.ready fires.
  app.setName('Ouroboros');

  // Suppress GPU errors in dev. Must precede app.ready.
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  if (!app.isPackaged) {
    app.commandLine.appendSwitch('no-sandbox');
  }
}

/** Close edit provenance store on app shutdown. */
export function closeEditProvenance(): void {
  closeEP();
}

/**
 * Schedule JSONL migration + 30-day retention purge via setImmediate so it
 * does not block window creation (Wave 29.5 M2).
 */
export function scheduleJsonlRetentionPurge(userDataPath: string): void {
  const basenames = ['context-decisions', 'context-outcomes', 'research-outcomes', 'corrections'];
  setImmediate(() => {
    for (const base of basenames) {
      migrateLegacyJsonl(userDataPath, base)
        .then(() => purgeOlderThan(userDataPath, base, 30))
        .then((n) => {
          if (n > 0) console.warn(`[jsonlRetention] purged ${n} old files for ${base}`);
        })
        .catch((err) => log.error('[jsonlRetention] purge error', err));
    }
  });
}
