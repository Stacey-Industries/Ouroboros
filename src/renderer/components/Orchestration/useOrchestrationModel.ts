import type {
  OrchestrationState,
  ProviderProgressEvent,
  TaskResult,
  TaskSessionRecord,
  VerificationSummary,
} from '../../types/electron';
import { useOrchestrationModelCore } from './model/useOrchestrationModelCore';

export interface UseOrchestrationModelReturn {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  actionError: string | null;
  actionMessage: string | null;
  state: OrchestrationState | null;
  latestSession: TaskSessionRecord | null;
  session: TaskSessionRecord | null;
  sessions: TaskSessionRecord[];
  selectedSessionId: string | null;
  providerEvent: ProviderProgressEvent | null;
  verificationSummary: VerificationSummary | null;
  latestResult: TaskResult | null;
  refresh: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  resumeLatest: () => Promise<void>;
  rerunVerification: () => Promise<void>;
  pauseActive: () => Promise<void>;
  cancelActive: () => Promise<void>;
}

export function useOrchestrationModel(projectRoot: string | null): UseOrchestrationModelReturn {
  return useOrchestrationModelCore(projectRoot);
}
