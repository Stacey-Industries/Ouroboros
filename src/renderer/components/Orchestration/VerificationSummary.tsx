import React from 'react';

import type { ProviderProgressEvent, VerificationSummary as VerificationSummaryType } from '../../types/electron';
import {
  ProviderActivityCard,
  VerificationIssuesCard,
  VerificationOverviewCard,
  VerificationStepsCard,
} from './VerificationSummarySections';

export interface VerificationSummaryProps {
  summary: VerificationSummaryType | null;
  providerEvent: ProviderProgressEvent | null;
}

export function VerificationSummary({ summary, providerEvent }: VerificationSummaryProps): React.ReactElement<any> {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ProviderActivityCard providerEvent={providerEvent} />
        <VerificationOverviewCard summary={summary} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
        <VerificationStepsCard summary={summary} />
        <VerificationIssuesCard summary={summary} />
      </div>
    </div>
  );
}
