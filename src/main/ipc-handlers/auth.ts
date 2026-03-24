/**
 * ipc-handlers/auth.ts — Authentication IPC handlers.
 *
 * Registers ipcMain.handle() channels for credential management,
 * OAuth login flows, CLI credential import, and auth state queries.
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent, shell } from 'electron';

import {
  detectExistingCredentials,
  importClaudeCliCredentials,
  importGitHubCliCredentials,
  importOpenAiCliCredentials,
} from '../auth/cliCredentialImporter';
import { getAllAuthStates, getCredential, setCredential } from '../auth/credentialStore';
import { logoutAnthropic, setAnthropicApiKey } from '../auth/providers/anthropicAuth';
import {
  cancelGitHubLogin,
  type GitHubLoginEvent,
  logoutGitHub,
  startGitHubLogin,
  startGitHubPkceLogin,
} from '../auth/providers/githubAuth';
import { logoutOpenAi, setOpenAiApiKey } from '../auth/providers/openaiAuth';
import type { AuthProvider } from '../auth/types';
import log from '../logger';
import { setGithubTokenForPty } from '../ptyEnv';
import { setUpdaterGitHubToken } from '../updater';
import { broadcastToWebClients } from '../web/webServer';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function broadcastAuthState(win: BrowserWindow): Promise<void> {
  const states = await getAllAuthStates();
  win.webContents.send('auth:stateChanged', states);
  broadcastToWebClients('auth:stateChanged', states);
}

function wrapAsync<T>(fn: () => Promise<T>): Promise<T | { success: false; error: string }> {
  return fn().catch((err: unknown) => ({
    success: false as const,
    error: toError(err),
  }));
}

// ---------------------------------------------------------------------------
// Channel registration helper
// ---------------------------------------------------------------------------

interface AuthHandlerEntry {
  channel: string;
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
}

function registerEntries(entries: AuthHandlerEntry[], channels: string[]): void {
  for (const entry of entries) {
    ipcMain.handle(entry.channel, entry.handler);
    channels.push(entry.channel);
  }
}

// ---------------------------------------------------------------------------
// Handler: auth:getStates
// ---------------------------------------------------------------------------

function createGetStatesHandler(): AuthHandlerEntry {
  return {
    channel: 'auth:getStates',
    handler: () =>
      wrapAsync(async () => {
        const states = await getAllAuthStates();
        return { success: true, states };
      }),
  };
}

// ---------------------------------------------------------------------------
// Handler: auth:startLogin
// ---------------------------------------------------------------------------

function createStartLoginHandler(
  _senderWindow: SenderWindow,
  win: BrowserWindow,
): AuthHandlerEntry {
  return {
    channel: 'auth:startLogin',
    handler: (event, ...args) => handleStartLogin(event, win, args[0] as AuthProvider),
  };
}

function handleStartLogin(
  event: IpcMainInvokeEvent,
  win: BrowserWindow,
  provider: AuthProvider,
): { success: boolean; error?: string } {
  if (provider === 'github') {
    return startGitHubFlow(event, win);
  }
  if (provider === 'anthropic') {
    return { success: false, error: 'Use auth:setApiKey or import from Claude CLI' };
  }
  return { success: false, error: 'Use auth:setApiKey' };
}

function onGitHubAuthenticated(win: BrowserWindow): void {
  void broadcastAuthState(win);
  void getCredential('github').then((cred) => {
    if (cred?.type === 'oauth') {
      setGithubTokenForPty(cred.accessToken);
      setUpdaterGitHubToken(cred.accessToken);
    }
  });
}

function startGitHubFlow(event: IpcMainInvokeEvent, win: BrowserWindow): { success: true } {
  const callback = (loginEvent: GitHubLoginEvent): void => {
    event.sender.send('auth:loginEvent', loginEvent);
    broadcastToWebClients('auth:loginEvent', loginEvent);
    if (loginEvent.type === 'authenticated') onGitHubAuthenticated(win);
  };
  const isElectron = typeof process.versions.electron !== 'undefined';
  if (isElectron) {
    startGitHubPkceLogin(callback);
  } else {
    startGitHubLogin(callback);
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Handler: auth:cancelLogin
// ---------------------------------------------------------------------------

function createCancelLoginHandler(): AuthHandlerEntry {
  return {
    channel: 'auth:cancelLogin',
    handler: (_event, ...args) => {
      const provider = args[0] as AuthProvider;
      if (provider === 'github') cancelGitHubLogin();
      return { success: true };
    },
  };
}

// ---------------------------------------------------------------------------
// Handler: auth:logout
// ---------------------------------------------------------------------------

function createLogoutHandler(win: BrowserWindow): AuthHandlerEntry {
  return {
    channel: 'auth:logout',
    handler: (_event, ...args) => handleLogout(win, args[0] as AuthProvider),
  };
}

async function handleLogout(
  win: BrowserWindow,
  provider: AuthProvider,
): Promise<{ success: boolean; error?: string }> {
  try {
    await callLogout(provider);
    await broadcastAuthState(win);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: toError(err) };
  }
}

async function callLogout(provider: AuthProvider): Promise<void> {
  if (provider === 'github') {
    setGithubTokenForPty(null);
    setUpdaterGitHubToken(null);
    return logoutGitHub();
  }
  if (provider === 'anthropic') return logoutAnthropic();
  if (provider === 'openai') return logoutOpenAi();
  throw new Error(`Unknown provider: ${provider}`);
}

// ---------------------------------------------------------------------------
// Handler: auth:setApiKey
// ---------------------------------------------------------------------------

function createSetApiKeyHandler(win: BrowserWindow): AuthHandlerEntry {
  return {
    channel: 'auth:setApiKey',
    handler: (_event, ...args) => handleSetApiKey(win, args[0] as AuthProvider, args[1] as string),
  };
}

async function handleSetApiKey(
  win: BrowserWindow,
  provider: AuthProvider,
  apiKey: string,
): Promise<{ success: boolean; error?: string }> {
  if (provider === 'github') {
    return { success: false, error: 'Use OAuth login for GitHub' };
  }
  try {
    const result = await callSetApiKey(provider, apiKey);
    if (result.success) await broadcastAuthState(win);
    return result;
  } catch (err: unknown) {
    return { success: false, error: toError(err) };
  }
}

function callSetApiKey(
  provider: AuthProvider,
  apiKey: string,
): Promise<{ success: boolean; error?: string }> {
  if (provider === 'anthropic') return setAnthropicApiKey(apiKey);
  if (provider === 'openai') return setOpenAiApiKey(apiKey);
  return Promise.resolve({ success: false, error: `Unsupported provider: ${provider}` });
}

// ---------------------------------------------------------------------------
// Handler: auth:importCliCreds
// ---------------------------------------------------------------------------

function createImportCliCredsHandler(win: BrowserWindow): AuthHandlerEntry {
  return {
    channel: 'auth:importCliCreds',
    handler: (_event, ...args) => handleImportCliCreds(win, args[0] as AuthProvider),
  };
}

async function handleImportCliCreds(
  win: BrowserWindow,
  provider: AuthProvider,
): Promise<{ success: boolean; error?: string }> {
  try {
    const credential = await callImport(provider);
    if (!credential) {
      return { success: false, error: `No CLI credentials found for ${provider}` };
    }
    await setCredential(provider, credential);
    await broadcastAuthState(win);
    log.info(`[Auth IPC] Imported CLI credentials for ${provider}`);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: toError(err) };
  }
}

async function callImport(provider: AuthProvider) {
  if (provider === 'github') return importGitHubCliCredentials();
  if (provider === 'anthropic') return importClaudeCliCredentials();
  if (provider === 'openai') return importOpenAiCliCredentials();
  throw new Error(`Unknown provider: ${provider}`);
}

// ---------------------------------------------------------------------------
// Handler: auth:detectCliCreds
// ---------------------------------------------------------------------------

function createDetectCliCredsHandler(): AuthHandlerEntry {
  return {
    channel: 'auth:detectCliCreds',
    handler: () =>
      wrapAsync(async () => {
        const detections = await detectExistingCredentials();
        return { success: true, detections };
      }),
  };
}

// ---------------------------------------------------------------------------
// Handler: auth:openExternal
// ---------------------------------------------------------------------------

function createOpenExternalHandler(): AuthHandlerEntry {
  return {
    channel: 'auth:openExternal',
    handler: async (_event, ...args) => {
      const url = args[0] as string;
      await shell.openExternal(url);
    },
  };
}

// ---------------------------------------------------------------------------
// Public registration
// ---------------------------------------------------------------------------

export function registerAuthHandlers(senderWindow: SenderWindow, win: BrowserWindow): string[] {
  const channels: string[] = [];

  registerEntries(
    [
      createGetStatesHandler(),
      createStartLoginHandler(senderWindow, win),
      createCancelLoginHandler(),
      createLogoutHandler(win),
      createSetApiKeyHandler(win),
      createImportCliCredsHandler(win),
      createDetectCliCredsHandler(),
      createOpenExternalHandler(),
    ],
    channels,
  );

  return channels;
}
