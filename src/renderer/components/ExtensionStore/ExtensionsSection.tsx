import React, { useEffect } from 'react';

import { ExtensionsSectionContent } from './ExtensionsSectionContent';
import { useExtensionsSectionModel } from './useExtensionsSection';

interface ExtensionsSectionProps {
  onRegisterRefresh?: (fn: () => void) => void;
}

export function ExtensionsSection({
  onRegisterRefresh,
}: ExtensionsSectionProps = {}): React.ReactElement {
  const model = useExtensionsSectionModel();

  useEffect(() => {
    onRegisterRefresh?.(model.fetchExtensions);
  }, [onRegisterRefresh, model.fetchExtensions]);

  return <ExtensionsSectionContent model={model} />;
}
