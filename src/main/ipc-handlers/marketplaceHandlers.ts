/**
 * marketplaceHandlers.ts — IPC handlers for the signed marketplace.
 *
 * Wave 37 Phase D.
 *
 * Channels:
 *   marketplace:listBundles  — paired-read,  short   — fetch manifest
 *   marketplace:install      — paired-write, normal  — fetch+verify+install by id
 *   marketplace:revokedIds   — paired-read,  short   — revocation list (best-effort)
 */

import { ipcMain } from 'electron';

import { getManifest, getRevokedIds, installById } from '../marketplace/marketplaceClient';

// ── Local helpers ─────────────────────────────────────────────────────────────

function fail(error: unknown): { success: false; error: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

// ── Handler registrars ────────────────────────────────────────────────────────

function registerListBundles(channels: string[]): void {
  ipcMain.handle('marketplace:listBundles', async () => {
    try {
      const result = await getManifest();
      if ('error' in result) return { success: false, error: result.error };
      return { success: true, bundles: result.bundles };
    } catch (err) {
      return fail(err);
    }
  });
  channels.push('marketplace:listBundles');
}

function registerInstall(channels: string[]): void {
  ipcMain.handle('marketplace:install', async (_event, args: { entryId: string }) => {
    try {
      const { entryId } = args;
      if (typeof entryId !== 'string' || entryId.trim() === '') {
        return { success: false, error: 'entryId is required' };
      }
      return await installById(entryId);
    } catch (err) {
      return fail(err);
    }
  });
  channels.push('marketplace:install');
}

function registerRevokedIds(channels: string[]): void {
  ipcMain.handle('marketplace:revokedIds', async () => {
    try {
      return await getRevokedIds();
    } catch {
      return { ids: [] };
    }
  });
  channels.push('marketplace:revokedIds');
}

// ── Public registrar ──────────────────────────────────────────────────────────

export function registerMarketplaceHandlers(): string[] {
  const channels: string[] = [];
  registerListBundles(channels);
  registerInstall(channels);
  registerRevokedIds(channels);
  return channels;
}
