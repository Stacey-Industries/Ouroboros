import React from 'react';

import type { TaskSessionRecord } from '../../types/electron';
import {
  ContextBudgetNotes,
  ContextMetricsCards,
  ContextMetricsHeader,
} from './ContextMetricsGrid.parts';

export function ContextMetricsGrid({ session }: { session: TaskSessionRecord | null }): React.ReactElement<any> {
  return (
    <>
      <ContextMetricsHeader session={session} />
      <ContextMetricsCards session={session} />
      <ContextBudgetNotes session={session} />
    </>
  );
}
