import type { AgentConflictReport, AgentConflictSnapshot } from '@shared/types/agentConflict';

import type { IpcResult } from './electron-foundation';

export interface AgentConflictListResult extends IpcResult {
  snapshot?: AgentConflictSnapshot;
}

export interface AgentConflictAPI {
  getReports: (projectRoot?: string) => Promise<AgentConflictListResult>;
  dismiss: (sessionA: string, sessionB: string) => Promise<IpcResult>;
  onChange: (callback: (snapshot: AgentConflictSnapshot) => void) => () => void;
}

export type { AgentConflictReport, AgentConflictSnapshot };
