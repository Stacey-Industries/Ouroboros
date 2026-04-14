import type { SpecScaffoldRequest, SpecScaffoldResult } from '@shared/types/specScaffold';

export interface SpecAPI {
  scaffold: (request: SpecScaffoldRequest) => Promise<SpecScaffoldResult>;
}

export type { SpecScaffoldRequest, SpecScaffoldResult };
