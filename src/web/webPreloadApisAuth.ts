/**
 * webPreloadApisAuth.ts — Auth and Providers API namespace builders for web preload.
 * Exports: buildAuthApi, buildProvidersApi.
 */

import type { GitHubLoginEvent } from '../renderer/types/electron-auth';
import type { WebSocketTransport } from './webPreloadTransport';

// ─── Auth API ─────────────────────────────────────────────────────────────────

function buildAuthInvokeApi(t: WebSocketTransport) {
  return {
    getStates: () => t.invoke('auth:getStates'),
    startLogin: (provider: string) => t.invoke('auth:startLogin', provider),
    cancelLogin: (provider: string) => t.invoke('auth:cancelLogin', provider),
    logout: (provider: string) => t.invoke('auth:logout', provider),
    setApiKey: (provider: string, apiKey: string) =>
      t.invoke('auth:setApiKey', provider, apiKey),
    importCliCreds: (provider: string) => t.invoke('auth:importCliCreds', provider),
    detectCliCreds: () => t.invoke('auth:detectCliCreds'),
    openExternal: (url: string) => {
      window.open(url, '_blank');
      return Promise.resolve();
    },
  };
}

function buildAuthEventApi(t: WebSocketTransport) {
  return {
    onLoginEvent: (callback: (event: GitHubLoginEvent) => void) =>
      t.on('auth:loginEvent', callback as (v: unknown) => void),
    onStateChanged: (callback: (states: unknown) => void) =>
      t.on('auth:stateChanged', callback as (v: unknown) => void),
  };
}

export function buildAuthApi(t: WebSocketTransport) {
  return {
    ...buildAuthInvokeApi(t),
    ...buildAuthEventApi(t),
  };
}

// ─── Providers API ────────────────────────────────────────────────────────────

export function buildProvidersApi(t: WebSocketTransport) {
  return {
    list: () => t.invoke('providers:list'),
    getSlots: () => t.invoke('providers:getSlots'),
  };
}
