/**
 * ipc-handlers/config.ts - Config IPC handlers
 */

import { app, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import type { FSWatcher } from 'fs';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';

import { setSecureKey } from '../auth/secureKeyStore';
import { AppConfig, getConfig, getConfigValue, setConfigValue } from '../config';
import type { ContextLayerConfig } from '../contextLayer/contextLayerTypes';
import log from '../logger';
import { broadcastToWebClients } from '../web/webServer';
import { IMPORTABLE_KEYS } from './configHelpers';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;
type ConfigInvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

interface ConfigHandlerEntry {
  channel: string;
  handler: ConfigInvokeHandler;
}

let settingsFileWatcher: FSWatcher | null = null;
let settingsDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseConfigObject(
  raw: string,
  invalidJsonMessage: string,
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    if (invalidJsonMessage) {
      throw new Error(invalidJsonMessage);
    }
    return null;
  }
}

function applyImportableConfig(incoming: Record<string, unknown>): void {
  for (const key of IMPORTABLE_KEYS) {
    if (!(key in incoming)) {
      continue;
    }

    try {
      // eslint-disable-next-line security/detect-object-injection -- key comes from validated IMPORTABLE_KEYS whitelist
      setConfigValue(key, incoming[key] as AppConfig[typeof key]);
    } catch {
      // Skip keys that fail schema validation.
    }
  }
}

function notifyExternalConfigChange(updated: AppConfig): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }
    window.webContents.send('config:externalChange', updated);
  }
  broadcastToWebClients('config:externalChange', updated);
}

function registerHandlers(entries: ConfigHandlerEntry[], channels: string[]): void {
  for (const entry of entries) {
    ipcMain.handle(entry.channel, entry.handler);
    channels.push(entry.channel);
  }
}

// Returns config with secrets stripped. Cast to AppConfig so the renderer type
// contract is unchanged — webAccessToken and webAccessPassword are web-server
// fields never read by the renderer, and apiKeys are replaced with a mask.
function sanitizeConfig(config: AppConfig): AppConfig {
  const sanitized = { ...config };
  delete (sanitized as Record<string, unknown>).webAccessToken;
  delete (sanitized as Record<string, unknown>).webAccessPassword;
  if (sanitized.modelProviders) {
    sanitized.modelProviders = sanitized.modelProviders.map((p) => ({
      ...p,
      apiKey: p.apiKey ? '••••••••' : '',
    }));
  }
  return sanitized as AppConfig;
}

function sanitizeConfigValue(key: keyof AppConfig): unknown {
  if (key === 'webAccessToken' || key === 'webAccessPassword') return '';
  const value = getConfigValue(key);
  if (key === 'modelProviders' && Array.isArray(value)) {
    return (value as Array<Record<string, unknown>>).map((p) => ({
      ...p,
      apiKey: p.apiKey ? '••••••••' : '',
    }));
  }
  return value;
}

/** Redirect secrets to SecureKeyStore; return sanitized value for config. */
function interceptSecrets(key: string, value: unknown): unknown {
  if (key === 'webAccessToken' || key === 'webAccessPassword') {
    const sk = key === 'webAccessToken' ? 'web-access-token' : 'web-access-password';
    if (typeof value === 'string' && value) void setSecureKey(sk, value);
    return '';
  }
  if (key !== 'modelProviders' || !Array.isArray(value)) return value;
  return (value as Array<Record<string, unknown>>).map((p) => {
    if (!p.apiKey || typeof p.apiKey !== 'string' || p.apiKey === '••••••••') return p;
    void setSecureKey(`provider-key:${p.id}`, p.apiKey as string);
    return { ...p, apiKey: '' };
  });
}

function createCoreHandlers(): ConfigHandlerEntry[] {
  return [
    {
      channel: 'config:getAll',
      handler: () => sanitizeConfig(getConfig()),
    },
    {
      channel: 'config:get',
      handler: (_event, key) => sanitizeConfigValue(key as keyof AppConfig),
    },
    {
      channel: 'config:set',
      handler: (_event, key, value) => {
        try {
          const safeValue = interceptSecrets(key as string, value);
          setConfigValue(key as keyof AppConfig, safeValue as AppConfig[keyof AppConfig]);
          // Notify context layer controller on config change
          if (key === 'contextLayer') {
            import('../contextLayer/contextLayerController')
              .then(({ getContextLayerController }) => {
                const ctrl = getContextLayerController();
                if (ctrl) {
                  ctrl.onConfigChange(value as ContextLayerConfig).catch((err: unknown) => {
                    log.warn('onConfigChange failed:', err);
                  });
                }
              })
              .catch((err) => {
                log.warn('failed to import controller:', err);
              });
          }
          return { success: true };
        } catch (error) {
          return { success: false, error: toErrorMessage(error) };
        }
      },
    },
  ];
}

async function exportConfigFile(
  window: BrowserWindow,
): Promise<{ success: boolean; cancelled?: boolean; filePath?: string; error?: string }> {
  try {
    const result = await dialog.showSaveDialog(window, {
      title: 'Export Settings',
      defaultPath: 'agent-ide-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: true, cancelled: true };
    }

    const sanitized = sanitizeConfig(getConfig());
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from native save dialog
    await fs.writeFile(result.filePath, JSON.stringify(sanitized, null, 2), 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

async function importConfigFile(
  window: BrowserWindow,
): Promise<{ success: boolean; cancelled?: boolean; config?: AppConfig; error?: string }> {
  try {
    const result = await dialog.showOpenDialog(window, {
      title: 'Import Settings',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, cancelled: true };
    }

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from native open dialog
    const raw = await fs.readFile(result.filePaths[0], 'utf-8');
    const incoming = parseConfigObject(raw, 'File is not valid JSON.');
    if (!incoming) {
      return { success: false, error: 'Settings file must be a JSON object.' };
    }

    applyImportableConfig(incoming);
    return { success: true, config: getConfig() };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

async function writeSettingsFile(settingsFilePath: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from app.getPath('userData')
  await fs.writeFile(settingsFilePath, JSON.stringify(getConfig(), null, 2), 'utf-8');
}

async function syncExternalSettings(settingsFilePath: string): Promise<void> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from app.getPath('userData')
    const raw = await fs.readFile(settingsFilePath, 'utf-8');
    const incoming = parseConfigObject(raw, '');
    if (!incoming) {
      return;
    }

    applyImportableConfig(incoming);
    notifyExternalConfigChange(getConfig());
  } catch {
    // Ignore parse errors from in-progress edits.
  }
}

function startSettingsFileWatcher(settingsFilePath: string): void {
  if (settingsFileWatcher) {
    return;
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from app.getPath('userData')
    settingsFileWatcher = fsSync.watch(settingsFilePath, (eventType) => {
      if (eventType !== 'change') {
        return;
      }
      // Debounce: Windows fires 'change' twice per save; coalesce within 50ms.
      if (settingsDebounceTimer !== null) {
        clearTimeout(settingsDebounceTimer);
      }
      settingsDebounceTimer = setTimeout(() => {
        settingsDebounceTimer = null;
        void syncExternalSettings(settingsFilePath);
      }, 50);
    });
  } catch (err) {
    // settings.json should exist after first write; log and skip if not.
    log.warn('[config] startSettingsFileWatcher: failed to watch', settingsFilePath, err);
    setTimeout(() => {
      startSettingsFileWatcher(settingsFilePath);
    }, 1000);
  }
}

function createDialogHandlers(
  senderWindow: SenderWindow,
  settingsFilePath: string,
): ConfigHandlerEntry[] {
  return [
    {
      channel: 'config:export',
      handler: (event) => exportConfigFile(senderWindow(event)),
    },
    {
      channel: 'config:import',
      handler: (event) => importConfigFile(senderWindow(event)),
    },
    {
      channel: 'config:openSettingsFile',
      handler: async () => {
        try {
          await writeSettingsFile(settingsFilePath);
          startSettingsFileWatcher(settingsFilePath);
          await shell.openPath(settingsFilePath);
          return { success: true, filePath: settingsFilePath };
        } catch (error) {
          return { success: false, error: toErrorMessage(error) };
        }
      },
    },
  ];
}

export function registerConfigHandlers(senderWindow: SenderWindow): string[] {
  const channels: string[] = [];
  const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');

  registerHandlers(createCoreHandlers(), channels);
  registerHandlers(createDialogHandlers(senderWindow, settingsFilePath), channels);

  return channels;
}

export function cleanupConfigWatcher(): void {
  if (settingsDebounceTimer !== null) {
    clearTimeout(settingsDebounceTimer);
    settingsDebounceTimer = null;
  }

  if (!settingsFileWatcher) {
    return;
  }

  settingsFileWatcher.close();
  settingsFileWatcher = null;
}
