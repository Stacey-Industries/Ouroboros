/**
 * ProvidersSectionContent.tsx — Layout root for the Providers settings tab.
 *
 * Composes ProviderList, AddProviderForm, and ModelSlotsSection.
 */

import React from 'react';

import { AddProviderForm } from './AddProviderForm';
import { ModelSlotsSection } from './ModelSlotsSection';
import { ProviderList } from './ProviderList';
import { headerDescriptionStyle,providersRootStyle } from './providersSectionStyles';
import { SectionLabel } from './settingsStyles';
import type { ProvidersSectionModel } from './useProvidersSection';

interface ProvidersSectionContentProps {
  model: ProvidersSectionModel;
}

export function ProvidersSectionContent({
  model,
}: ProvidersSectionContentProps): React.ReactElement {
  return (
    <div style={providersRootStyle}>
      <div>
        <SectionLabel>Model Providers</SectionLabel>
        <p style={headerDescriptionStyle}>
          Configure Anthropic-compatible LLM providers and assign models to session types.
        </p>
      </div>
      <ProviderList
        providers={model.providers}
        onToggle={(id, enabled) => model.updateProvider(id, { enabled })}
        onRemove={model.removeProvider}
      />
      <AddProviderForm onAdd={model.addProvider} />
      <ModelSlotsSection
        slots={model.slots}
        allModels={model.allModels}
        onUpdateSlot={model.updateSlot}
      />
    </div>
  );
}
