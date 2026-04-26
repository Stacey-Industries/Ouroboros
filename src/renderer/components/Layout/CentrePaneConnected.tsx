/**
 * CentrePaneConnected — switches between EditorContent, DiffReview,
 * SessionReplay, Settings, Usage, ContextBuilder, and TimeTravel views.
 *
 * Extracted from App.tsx.
 */

import React from 'react';

import { CentrePaneConnectedShell } from './CentrePaneConnected.parts';

export function CentrePaneConnected(): React.ReactElement {
  return <CentrePaneConnectedShell />;
}
