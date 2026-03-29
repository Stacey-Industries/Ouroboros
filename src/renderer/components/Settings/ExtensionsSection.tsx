import React from 'react';

import { ExtensionsSectionContent } from './ExtensionsSectionContent';
import { useExtensionsSectionModel } from './useExtensionsSection';

export function ExtensionsSection(): React.ReactElement<any> {
  const model = useExtensionsSectionModel();
  return <ExtensionsSectionContent model={model} />;
}
