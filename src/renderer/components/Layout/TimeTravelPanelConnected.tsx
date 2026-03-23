/**
 * TimeTravelPanelConnected — wraps TimeTravelPanel with useDiffSnapshots hook.
 *
 * Extracted from App.tsx.
 */

import React from 'react';

import { useDiffSnapshots } from '../../hooks/useDiffSnapshots';
import { TimeTravelPanel } from '../TimeTravel';

export function TimeTravelPanelConnected({ onClose }: { onClose: () => void }): React.ReactElement {
  const { snapshots, createManualSnapshot, refreshSnapshots } = useDiffSnapshots();
  return (
    <TimeTravelPanel
      snapshots={snapshots}
      onCreateSnapshot={createManualSnapshot}
      onRefreshSnapshots={refreshSnapshots}
      onClose={onClose}
    />
  );
}
