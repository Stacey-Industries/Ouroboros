/**
 * preloadWave6Stubs.ts
 *
 * Phase 0 scaffolding for Wave 6 APIs (background jobs, agent conflict,
 * session checkpoint, inline-edit streaming, /spec scaffold).
 *
 * Every method returns `{ success: false, error: 'not-yet-implemented' }` and
 * every subscription is a no-op. Downstream Wave 6 packages replace the
 * bodies with real IPC calls in their respective phases.
 */

import { ipcRenderer } from 'electron';

import type {
  AgentConflictAPI,
  AgentConflictSnapshot,
  AiStreamAPI,
  BackgroundJobsAPI,
  BackgroundJobUpdate,
  CheckpointAPI,
  ElectronAPI,
  SpecAPI,
} from '../renderer/types/electron';

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const wave6StubApis: Pick<
  ElectronAPI,
  'backgroundJobs' | 'agentConflict' | 'checkpoint' | 'spec' | 'aiStream'
> = {
  backgroundJobs: {
    enqueue: (request) => ipcRenderer.invoke('backgroundJobs:enqueue', request),
    cancel: (jobId) => ipcRenderer.invoke('backgroundJobs:cancel', jobId),
    list: (projectRoot?) => ipcRenderer.invoke('backgroundJobs:list', projectRoot),
    clearCompleted: () => ipcRenderer.invoke('backgroundJobs:clearCompleted'),
    onUpdate: (callback) => onChannel<BackgroundJobUpdate>('backgroundJobs:update', callback),
  } satisfies BackgroundJobsAPI,

  agentConflict: {
    getReports: (projectRoot?) => ipcRenderer.invoke('agentConflict:getReports', projectRoot),
    dismiss: (sessionA, sessionB) =>
      ipcRenderer.invoke('agentConflict:dismiss', sessionA, sessionB),
    onChange: (callback) => onChannel<AgentConflictSnapshot>('agentConflict:change', callback),
  } satisfies AgentConflictAPI,

  checkpoint: {
    list: (request) => ipcRenderer.invoke('checkpoint:list', request),
    create: (request) => ipcRenderer.invoke('checkpoint:create', request),
    restore: (request) => ipcRenderer.invoke('checkpoint:restore', request),
    delete: (checkpointId) => ipcRenderer.invoke('checkpoint:delete', checkpointId),
    onChange: (callback) => onChannel<string>('checkpoint:change', callback),
  } satisfies CheckpointAPI,

  spec: {
    scaffold: (request) => ipcRenderer.invoke('spec:scaffold', request),
  } satisfies SpecAPI,

  aiStream: {
    startInlineEdit: (request) => ipcRenderer.invoke('ai:streamInlineEdit', request),
    cancelInlineEdit: (request) => ipcRenderer.invoke('ai:cancelInlineEditStream', request),
    onStream: (requestId, callback) =>
      onChannel(`ai:inlineEditStream:${requestId}`, callback),
  } satisfies AiStreamAPI,
};
