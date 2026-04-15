import { ipcRenderer } from 'electron';

import type { ElectronAPI } from '../renderer/types/electron';

type AiApi = ElectronAPI['ai'];
type EmbeddingApi = ElectronAPI['embedding'];
type TelemetryApi = ElectronAPI['telemetry'];
type ObservabilityApi = ElectronAPI['observability'];

export const aiApi: AiApi = {
  inlineCompletion: (request) => ipcRenderer.invoke('ai:inline-completion', request),
  generateCommitMessage: (request) => ipcRenderer.invoke('ai:generate-commit-message', request),
  inlineEdit: (request) => ipcRenderer.invoke('ai:inline-edit', request),
};

export const embeddingApi: EmbeddingApi = {
  search: (query: string, projectRoot: string, topK?: number) =>
    ipcRenderer.invoke('embedding:search', query, projectRoot, topK),
  getStatus: (projectRoot: string) =>
    ipcRenderer.invoke('embedding:status', projectRoot),
  reindex: (projectRoot: string) =>
    ipcRenderer.invoke('embedding:reindex', projectRoot),
};

export const telemetryApi: TelemetryApi = {
  queryEvents: (opts) => ipcRenderer.invoke('telemetry:queryEvents', opts),
  queryOutcomes: (eventId) => ipcRenderer.invoke('telemetry:queryOutcomes', eventId),
  queryTraces: (opts) => ipcRenderer.invoke('telemetry:queryTraces', opts),
  record: (opts) => ipcRenderer.invoke('telemetry:record', opts),
};

export const observabilityApi: ObservabilityApi = {
  exportTrace: (opts) => ipcRenderer.invoke('observability:exportTrace', opts),
};
