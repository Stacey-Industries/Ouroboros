import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import vm from 'vm';

import { getConfigValue } from './config';
import {
  activateExtensionViaHost,
  deactivateExtensionViaHost,
} from './extensionHost/extensionHostProxy';
import { appendLog, buildSandboxAPI, getSafeSandboxGlobals } from './extensionsSandbox';
import { type ExtensionManifest, type LoadedExtension, VALID_PERMISSIONS } from './extensionsTypes';
import log from './logger';

export const extensions = new Map<string, LoadedExtension>();

let extensionsDir = '';

export function getExtensionsDir(): string {
  if (!extensionsDir) {
    extensionsDir = path.join(app.getPath('userData'), 'extensions');
  }
  return extensionsDir;
}

export function shouldActivateOnStartup(manifest: ExtensionManifest): boolean {
  const events = manifest.activationEvents;
  if (!events || events.length === 0) {
    return true;
  }
  return events.some((eventName) => eventName === '*' || eventName === 'onStartup');
}

function getEventType(eventName: string): string {
  const colonIndex = eventName.indexOf(':');
  return colonIndex === -1 ? eventName : eventName.slice(0, colonIndex);
}

function getEventArgument(eventName: string): string | null {
  const colonIndex = eventName.indexOf(':');
  return colonIndex === -1 ? null : eventName.slice(colonIndex + 1);
}

function globMatch(pattern: string, value: string): boolean {
  let regexSource = '^';
  for (const character of pattern) {
    if (character === '*') {
      regexSource += '[^/\\\\]*';
    } else if ('.+?^${}()|[]\\'.includes(character)) {
      regexSource += `\\${character}`;
    } else {
      regexSource += character;
    }
  }
  regexSource += '$';

  try {
    // eslint-disable-next-line security/detect-non-literal-regexp -- regexSource built char-by-char from validated pattern
    return new RegExp(regexSource, 'i').test(value);
  } catch {
    return pattern === value;
  }
}

export function matchesActivationEvent(pattern: string, firedEvent: string): boolean {
  if (pattern === firedEvent) {
    return true;
  }

  if (getEventType(pattern) !== getEventType(firedEvent)) {
    return false;
  }

  const patternArgument = getEventArgument(pattern);
  if (patternArgument === null) {
    return true;
  }

  const firedArgument = getEventArgument(firedEvent);
  if (firedArgument === null) {
    return false;
  }

  return globMatch(patternArgument, firedArgument);
}

async function readManifest(extDir: string): Promise<ExtensionManifest> {
  const manifestPath = path.join(extDir, 'manifest.json');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- manifestPath is derived from trusted extension directory
  const raw = await fs.readFile(manifestPath, 'utf-8');
  return JSON.parse(raw) as ExtensionManifest;
}

function validateManifest(manifest: ExtensionManifest): void {
  if (!manifest.name || !manifest.version || !manifest.main) {
    throw new Error('Manifest missing required fields: name, version, main');
  }
}

function validatePermissions(permissions: string[]): void {
  for (const permission of permissions) {
    if (!VALID_PERMISSIONS.has(permission)) {
      throw new Error(`Unknown permission: ${permission}`);
    }
  }
}

async function ensureMainFileExists(extDir: string, mainFile: string): Promise<void> {
  const mainPath = path.join(extDir, mainFile);
  await fs.access(mainPath);
}

function createLoadedExtension(extDir: string, manifest: ExtensionManifest): LoadedExtension {
  return {
    manifest,
    dir: extDir,
    enabled: true,
    status: 'inactive',
    log: [],
    registeredCommands: new Map(),
    context: null,
  };
}

function createLoadErrorExtension(extDir: string, error: unknown): LoadedExtension {
  const name = path.basename(extDir);
  const message = error instanceof Error ? error.message : String(error);
  log.error(`Failed to load ${name}:`, error);
  return {
    manifest: {
      name,
      version: '0.0.0',
      description: '',
      author: '',
      main: '',
      permissions: [],
    },
    dir: extDir,
    enabled: false,
    status: 'error',
    errorMessage: message,
    log: [`Failed to load: ${message}`],
    registeredCommands: new Map(),
    context: null,
  };
}

export async function loadExtension(extDir: string): Promise<LoadedExtension | null> {
  try {
    const manifest = await readManifest(extDir);
    validateManifest(manifest);
    validatePermissions(manifest.permissions ?? []);
    await ensureMainFileExists(extDir, manifest.main);
    return createLoadedExtension(extDir, manifest);
  } catch (error) {
    return createLoadErrorExtension(extDir, error);
  }
}

function createExtensionContext(ext: LoadedExtension): vm.Context {
  const api = buildSandboxAPI(ext);
  return vm.createContext(
    {
      ...getSafeSandboxGlobals(),
      ouroboros: api.ouroboros,
      console: api.console,
    },
    {
      name: `ext:${ext.manifest.name}`,
      codeGeneration: {
        strings: false,
        wasm: false,
      },
    },
  );
}

function createExtensionScript(ext: LoadedExtension, code: string): vm.Script {
  const wrappedCode = `(async function() {\n${code}\n})()`;
  return new vm.Script(wrappedCode, {
    filename: `ext:${ext.manifest.name}/${ext.manifest.main}`,
  });
}

async function runExtensionCode(ext: LoadedExtension, mainPath: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- mainPath is derived from trusted extension directory + manifest
  const code = await fs.readFile(mainPath, 'utf-8');
  if (getConfigValue('useExtensionHost') === true) {
    appendLog(ext, 'Activating (via ExtensionHost)...');
    const res = await activateExtensionViaHost(ext.manifest, code);
    if (!res.success) throw new Error(res.error ?? 'ExtensionHost activation failed');
    return;
  }
  const context = createExtensionContext(ext);
  ext.context = context;
  const script = createExtensionScript(ext, code);
  appendLog(ext, 'Activating...');
  await script.runInContext(context, { timeout: 10000 });
}

function markActivationSuccess(ext: LoadedExtension): void {
  ext.status = 'active';
  ext.errorMessage = undefined;
  appendLog(ext, 'Activated successfully.');
}

function markActivationFailure(ext: LoadedExtension, error: unknown): void {
  ext.status = 'error';
  ext.errorMessage = error instanceof Error ? error.message : String(error);
  appendLog(ext, `Activation failed: ${ext.errorMessage}`);
  log.error(`Failed to activate ${ext.manifest.name}:`, error);
}

export async function activateExtension(ext: LoadedExtension): Promise<void> {
  if (ext.status === 'active') {
    return;
  }
  if (!ext.manifest.main) {
    ext.status = 'error';
    ext.errorMessage = 'No main file specified in manifest';
    return;
  }

  const mainPath = path.join(ext.dir, ext.manifest.main);
  try {
    await runExtensionCode(ext, mainPath);
    markActivationSuccess(ext);
  } catch (error) {
    markActivationFailure(ext, error);
  }
}

export function deactivateExtension(ext: LoadedExtension): void {
  ext.registeredCommands.clear();
  ext.context = null;
  ext.status = 'inactive';
  if (getConfigValue('useExtensionHost') === true) {
    void deactivateExtensionViaHost(ext.manifest.name);
  }
  appendLog(ext, 'Deactivated.');
}

export async function copyDir(source: string, destination: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- destination is derived from trusted app data dir
  await fs.mkdir(destination, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- source is derived from trusted extension source path
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDir(sourcePath, destinationPath);
      continue;
    }
    await fs.copyFile(sourcePath, destinationPath);
  }
}
