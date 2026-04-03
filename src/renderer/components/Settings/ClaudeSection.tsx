import React from 'react';

import type { AppConfig } from '../../types/electron';
import { ClaudeSectionContent } from './ClaudeSectionContent';
import { useClaudeSectionModel } from './useClaudeSection';

interface ClaudeSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function ClaudeSection({ draft, onChange }: ClaudeSectionProps): React.ReactElement {
  const model = useClaudeSectionModel(draft, onChange);
  return <ClaudeSectionContent model={model} />;
}
