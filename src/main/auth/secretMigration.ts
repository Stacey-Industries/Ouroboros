/**
 * secretMigration.ts — One-time migration of plaintext secrets from
 * electron-store to the encrypted SecureKeyStore.
 *
 * Runs at startup after app.whenReady(). Migrates:
 * - modelProviders[].apiKey → SecureKeyStore key "provider-key:<id>"
 * - webAccessToken → SecureKeyStore key "web-access-token"
 * - webAccessPassword → SecureKeyStore key "web-access-password"
 *
 * After migration, plaintext values are cleared from config.json.
 */

import type { AppConfig, ModelProvider } from '../config';
import { getConfigValue, setConfigValue } from '../config';
import log from '../logger';
import { isSecureStorageAvailable, migrateFromPlaintext, warmCache } from './secureKeyStore';

const MIGRATION_MARKER_KEY = '_secrets_migrated';

export async function migrateSecretsIfNeeded(): Promise<void> {
  // Always warm the cache so sync reads work later
  await warmCache();

  if (!isSecureStorageAvailable()) {
    log.warn(
      '[SecretMigration] safeStorage unavailable — skipping. ' +
        'Secrets remain in plaintext config.',
    );
    return;
  }

  const alreadyMigrated = getConfigValue(MIGRATION_MARKER_KEY as keyof AppConfig);
  if (alreadyMigrated) return;

  log.info('[SecretMigration] Starting plaintext secret migration...');
  let migrated = 0;

  migrated += await migrateProviderKeys();
  migrated += await migrateWebToken();
  migrated += await migrateWebPassword();

  setConfigValue(MIGRATION_MARKER_KEY as keyof AppConfig, true as never);
  log.info(`[SecretMigration] Complete. ${migrated} secret(s) migrated.`);
}

async function migrateProviderKeys(): Promise<number> {
  const providers = (getConfigValue('modelProviders') ?? []) as ModelProvider[];
  const toMigrate = providers.filter((p) => p.apiKey && p.apiKey !== '••••••••');
  if (toMigrate.length === 0) return 0;

  await Promise.all(toMigrate.map((p) => migrateFromPlaintext(`provider-key:${p.id}`, p.apiKey)));

  const cleaned = providers.map((p) =>
    toMigrate.some((m) => m.id === p.id) ? { ...p, apiKey: '' } : p,
  );
  setConfigValue('modelProviders', cleaned as never);
  log.info(`[SecretMigration] Migrated ${toMigrate.length} provider key(s)`);
  return toMigrate.length;
}

async function migrateWebToken(): Promise<number> {
  const token = getConfigValue('webAccessToken') as string;
  if (!token) return 0;

  await migrateFromPlaintext('web-access-token', token);
  setConfigValue('webAccessToken', '' as never);
  log.info('[SecretMigration] Migrated webAccessToken');
  return 1;
}

async function migrateWebPassword(): Promise<number> {
  const password = getConfigValue('webAccessPassword') as string;
  if (!password) return 0;

  await migrateFromPlaintext('web-access-password', password);
  setConfigValue('webAccessPassword', '' as never);
  log.info('[SecretMigration] Migrated webAccessPassword');
  return 1;
}
