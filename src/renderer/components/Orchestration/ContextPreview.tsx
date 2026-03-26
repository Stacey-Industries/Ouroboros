import React from 'react';

import type { TaskResult, TaskSessionRecord } from '../../types/electron';
import {
  ContextFileList,
  ContextMetricsSection,
  ContextSidebar,
} from './ContextPreviewSections';

export interface ContextPreviewProps {
  session: TaskSessionRecord | null;
  latestResult: TaskResult | null;
}

export function ContextPreview({ session, latestResult }: ContextPreviewProps): React.ReactElement {
  return (
    <div className="space-y-4">
      <ContextMetricsSection session={session} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
        <ContextFileList session={session} />
        <ContextSidebar session={session} latestResult={latestResult} />
      </div>
    </div>
  );
}
