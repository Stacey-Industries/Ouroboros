/**
 * electron-compare-providers.d.ts — Wave 36 Phase F
 *
 * IPC type contract for the compare-providers side-by-side mode.
 */

import type { IpcResult } from './electron-foundation';

export interface CompareSessionInfo {
  id: string;
  providerId: string;
}

export interface CompareProvidersStartResult extends IpcResult {
  compareId?: string;
  sessions?: [CompareSessionInfo, CompareSessionInfo];
}

export interface CompareProvidersStartArgs {
  prompt: string;
  projectPath: string;
  providerIds: [string, string];
}

export interface CompareProvidersEventPayload {
  compareId: string;
  providerId: string;
  event: {
    type: 'stdout' | 'stderr' | 'tool-use' | 'completion' | 'error' | 'cost-update';
    sessionId: string;
    payload: unknown;
    at: number;
  };
}

export interface CompareProvidersAPI {
  start: (args: CompareProvidersStartArgs) => Promise<CompareProvidersStartResult>;
  cancel: (compareId: string) => Promise<IpcResult>;
  onEvent: (callback: (payload: CompareProvidersEventPayload) => void) => () => void;
}
