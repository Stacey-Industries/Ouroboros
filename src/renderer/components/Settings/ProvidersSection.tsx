/**
 * ProvidersSection.tsx — Composition root for the Providers settings tab.
 *
 * Wires the model hook to the content component (same pattern as ClaudeSection).
 */

import React from 'react';

import type { AppConfig } from '../../types/electron';
import { ProvidersSectionContent } from './ProvidersSectionContent';
import { useProvidersSectionModel } from './useProvidersSection';

interface ProvidersSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function ProvidersSection({ draft, onChange }: ProvidersSectionProps): React.ReactElement<any> {
  const model = useProvidersSectionModel(draft, onChange);
  return <ProvidersSectionContent model={model} />;
}
