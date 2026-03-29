import React from 'react';

import { CodeModeSectionView } from './CodeModeSection.parts';
import { useCodeModeSectionModel } from './useCodeModeSectionModel';

export function CodeModeSection(): React.ReactElement<any> {
  const model = useCodeModeSectionModel();
  return <CodeModeSectionView {...model} />;
}
