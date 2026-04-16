import type { SubagentCostRollup, SubagentMessage, SubagentRecord } from '@shared/types/subagent';

import type { IpcResult } from './electron-foundation';

export type { SubagentCostRollup, SubagentMessage, SubagentRecord };

export interface SubagentListResult extends IpcResult {
  records?: SubagentRecord[];
}

export interface SubagentGetResult extends IpcResult {
  record?: SubagentRecord | null;
}

export interface SubagentLiveCountResult extends IpcResult {
  count?: number;
}

export interface SubagentCostRollupResult extends IpcResult {
  rollup?: SubagentCostRollup;
}

export interface SubagentUpdatedEvent {
  parentSessionId: string;
}

export interface SubagentAPI {
  list(args: { parentSessionId: string }): Promise<SubagentListResult>;
  get(args: { subagentId: string }): Promise<SubagentGetResult>;
  liveCount(args: { parentSessionId: string }): Promise<SubagentLiveCountResult>;
  costRollup(args: { parentSessionId: string }): Promise<SubagentCostRollupResult>;
  cancel(args: { subagentId: string }): Promise<IpcResult>;
  onUpdated(callback: (event: SubagentUpdatedEvent) => void): () => void;
}
