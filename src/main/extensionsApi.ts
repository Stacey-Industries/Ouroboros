import fs from 'fs/promises';
import path from 'path';

import { getConfigValue, setConfigValue } from './config';
import {
  activateExtension,
  copyDir,
  deactivateExtension,
  extensions,
  getExtensionsDir,
  loadExtension,
  matchesActivationEvent,
  shouldActivateOnStartup,
} from './extensionsLifecycle';
import { appendLog } from './extensionsSandbox';
import {
  EXT_TO_LANGUAGE,
  type ExtensionActionResult,
  type ExtensionInfo,
  type ExtensionLogResult,
  type LoadedExtension,
} from './extensionsTypes';

function formatActivationEvents(events?: string[]): string {
  return (events ?? []).join(', ');
}

function setPendingState(ext: LoadedExtension, prefix: string): void {
  ext.status = 'pending';
  appendLog(ext, `${prefix} (events: ${formatActivationEvents(ext.manifest.activationEvents)})`);
}

function getDisabledExtensionNames(): string[] {
  return getConfigValue('disabledExtensions') ?? [];
}

function shouldDisableExtension(ext: LoadedExtension, globalEnabled: boolean): boolean {
  if (!globalEnabled) {
    return true;
  }
  return getDisabledExtensionNames().includes(ext.manifest.name);
}

function applyConfiguredEnabledState(ext: LoadedExtension, globalEnabled: boolean): void {
  if (!shouldDisableExtension(ext, globalEnabled)) {
    return;
  }
  ext.enabled = false;
  ext.status = 'inactive';
}

async function activateOrQueueExtension(
  ext: LoadedExtension,
  prefix: string,
): Promise<'active' | 'pending' | 'skipped'> {
  if (!ext.enabled || ext.status === 'error') {
    return 'skipped';
  }
  if (shouldActivateOnStartup(ext.manifest)) {
    await activateExtension(ext);
    return 'active';
  }
  setPendingState(ext, prefix);
  return 'pending';
}

async function readExtensionEntries(dir: string): Promise<string[] | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is derived from app.getPath('userData') + fixed suffix
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    console.error('[extensions] Failed to read extensions directory');
    return null;
  }
}

function getPendingExtensions(eventName: string): LoadedExtension[] {
  const pending: LoadedExtension[] = [];
  for (const ext of extensions.values()) {
    if (ext.status !== 'pending' || !ext.enabled) {
      continue;
    }
    const events = ext.manifest.activationEvents;
    if (!events) {
      continue;
    }
    if (events.some((pattern) => matchesActivationEvent(pattern, eventName))) {
      pending.push(ext);
    }
  }
  return pending;
}

async function updateDisabledExtensions(name: string, enabled: boolean): Promise<void> {
  const disabled = getDisabledExtensionNames();
  const nextDisabled = enabled
    ? disabled.filter((disabledName) => disabledName !== name)
    : disabled.includes(name)
      ? disabled
      : [...disabled, name];
  setConfigValue('disabledExtensions', nextDisabled);
}

function buildExtensionInfo(ext: LoadedExtension): ExtensionInfo {
  return {
    name: ext.manifest.name,
    version: ext.manifest.version,
    description: ext.manifest.description || '',
    author: ext.manifest.author || '',
    enabled: ext.enabled,
    status: ext.status,
    permissions: ext.manifest.permissions || [],
    activationEvents: ext.manifest.activationEvents || ['*'],
    errorMessage: ext.errorMessage,
  };
}

export async function dispatchActivationEvent(
  eventName: string,
  context?: Record<string, unknown>,
): Promise<void> {
  void context; // context is reserved for future extension activation use
  const pending = getPendingExtensions(eventName);
  if (pending.length === 0) {
    return;
  }

  console.log(
    `[extensions] Activation event "${eventName}" activating ${pending.length} extension(s): ${pending.map((ext) => ext.manifest.name).join(', ')}`,
  );

  for (const ext of pending) {
    appendLog(ext, `Triggered by activation event: ${eventName}`);
    await activateExtension(ext);
  }
}

export async function dispatchFileOpenEvent(filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  await dispatchActivationEvent(`onFileOpen:${fileName}`);
  const language = EXT_TO_LANGUAGE[path.extname(filePath).toLowerCase()];
  if (language) {
    await dispatchActivationEvent(`onLanguage:${language}`);
  }
}

export async function dispatchCommandEvent(commandId: string): Promise<void> {
  await dispatchActivationEvent(`onCommand:${commandId}`);
}

export async function initExtensions(): Promise<void> {
  const dir = getExtensionsDir();
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is derived from app.getPath('userData') + fixed suffix
  await fs.mkdir(dir, { recursive: true });

  const entries = await readExtensionEntries(dir);
  if (!entries) {
    return;
  }

  const globalEnabled = getConfigValue('extensionsEnabled') ?? true;
  let eagerCount = 0;
  let pendingCount = 0;

  for (const name of entries) {
    const ext = await loadExtension(path.join(dir, name));
    if (!ext) {
      continue;
    }

    applyConfiguredEnabledState(ext, globalEnabled);
    extensions.set(ext.manifest.name, ext);
    const state = await activateOrQueueExtension(ext, 'Pending activation');
    if (state === 'active') {
      eagerCount++;
    } else if (state === 'pending') {
      pendingCount++;
    }
  }

  console.log(
    `[extensions] Loaded ${extensions.size} extension(s): ${eagerCount} active, ${pendingCount} pending`,
  );
}

export function listExtensions(): ExtensionInfo[] {
  return Array.from(extensions.values()).map(buildExtensionInfo);
}

export async function enableExtension(name: string): Promise<ExtensionActionResult> {
  const ext = extensions.get(name);
  if (!ext) {
    return { success: false, error: `Extension "${name}" not found` };
  }

  ext.enabled = true;
  await updateDisabledExtensions(name, true);

  if (ext.status !== 'active') {
    await activateOrQueueExtension(ext, 'Enabled - pending activation');
  }

  return { success: true };
}

export async function disableExtension(name: string): Promise<ExtensionActionResult> {
  const ext = extensions.get(name);
  if (!ext) {
    return { success: false, error: `Extension "${name}" not found` };
  }

  ext.enabled = false;
  deactivateExtension(ext);
  await updateDisabledExtensions(name, false);
  return { success: true };
}

export async function installExtension(sourcePath: string): Promise<ExtensionActionResult> {
  try {
    const manifest = JSON.parse(
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- sourcePath is provided by trusted IPC caller
      await fs.readFile(path.join(sourcePath, 'manifest.json'), 'utf-8'),
    ) as { name?: string; version?: string; main?: string };
    if (!manifest.name || !manifest.version || !manifest.main) {
      return {
        success: false,
        error: 'Invalid manifest: missing required fields (name, version, main)',
      };
    }

    await fs.access(path.join(sourcePath, manifest.main));
    const destinationDir = path.join(getExtensionsDir(), manifest.name);
    await copyDir(sourcePath, destinationDir);

    const ext = await loadExtension(destinationDir);
    if (!ext) {
      return { success: false, error: 'Failed to load extension after install' };
    }

    extensions.set(ext.manifest.name, ext);
    const globalEnabled = getConfigValue('extensionsEnabled') ?? true;
    applyConfiguredEnabledState(ext, globalEnabled);
    await activateOrQueueExtension(ext, 'Installed - pending activation');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function uninstallExtension(name: string): Promise<ExtensionActionResult> {
  try {
    const ext = extensions.get(name);
    if (ext) {
      deactivateExtension(ext);
      extensions.delete(name);
    }

    await fs.rm(path.join(getExtensionsDir(), name), { recursive: true, force: true });
    await updateDisabledExtensions(name, true);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function forceActivateExtension(name: string): Promise<ExtensionActionResult> {
  const ext = extensions.get(name);
  if (!ext) {
    return { success: false, error: `Extension "${name}" not found` };
  }
  if (ext.status === 'active') {
    return { success: true };
  }
  if (!ext.enabled) {
    return { success: false, error: `Extension "${name}" is disabled` };
  }

  appendLog(ext, 'Manually activated via extensions:activate');
  await activateExtension(ext);
  return { success: ext.status === 'active', error: ext.errorMessage };
}

export function getExtensionLog(name: string): ExtensionLogResult {
  const ext = extensions.get(name);
  if (!ext) {
    return { success: false, error: `Extension "${name}" not found` };
  }
  return { success: true, log: [...ext.log] };
}

export function getExtensionsDirPath(): string {
  return getExtensionsDir();
}
