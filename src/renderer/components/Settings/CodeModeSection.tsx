import React from 'react';

import { CodeModeSectionView } from './CodeModeSection.parts';
import { useCodeModeSectionModel } from './useCodeModeSectionModel';

export function CodeModeSection(): React.ReactElement {
  const model = useCodeModeSectionModel();
  return <CodeModeSectionView {...model} />;
}
