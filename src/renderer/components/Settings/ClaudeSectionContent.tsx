import React from 'react';

import { ClaudeSectionBody } from './ClaudeSectionBody';
import { claudeSectionRootStyle } from './claudeSectionContentStyles';
import type { ClaudeSectionModel } from './useClaudeSection';

interface ClaudeSectionContentProps {
  model: ClaudeSectionModel;
}

export function ClaudeSectionContent({
  model,
}: ClaudeSectionContentProps): React.ReactElement {
  return (
    <div style={claudeSectionRootStyle}>
      <ClaudeSectionBody model={model} />
    </div>
  );
}
