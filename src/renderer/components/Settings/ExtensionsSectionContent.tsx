import React from 'react';
import { ExtensionsBuildGuide } from './ExtensionsBuildGuide';
import {
  ActionErrorBanner,
  ExtensionActionButtons,
  ExtensionCommandsSection,
} from './ExtensionsSectionActions';
import { InstalledExtensionsSection } from './ExtensionsInstalledSection';
import { extensionsSectionRootStyle } from './extensionsSectionStyles';
import type { ExtensionsSectionModel } from './useExtensionsSection';
import { VsxInstalledSection } from './VsxInstalledSection';

interface ExtensionsSectionContentProps {
  model: ExtensionsSectionModel;
}

export function ExtensionsSectionContent({
  model,
}: ExtensionsSectionContentProps): React.ReactElement {
  return (
    <div style={extensionsSectionRootStyle}>
      {model.actionError && <ActionErrorBanner message={model.actionError} />}
      <VsxInstalledSection />
      <InstalledExtensionsSection model={model} />
      <ExtensionActionButtons model={model} />
      <ExtensionCommandsSection commands={model.extensionCommands} />
      <ExtensionsBuildGuide isOpen={model.isSnippetOpen} onToggle={model.toggleSnippet} />
    </div>
  );
}
