/**
 * ContextBuilder.tsx â€” Smart Context Builder panel.
 */

import React from 'react';
import { useContextBuilderModel, type ContextBuilderModelOptions } from './useContextBuilderModel';
import { ContextBuilderView } from './ContextBuilderView';

export interface ContextBuilderProps {
  contextSelection?: ContextBuilderModelOptions['contextSelection'];
  projectRoot: string;
  onClose: () => void;
}

export function ContextBuilder({
  contextSelection,
  projectRoot,
  onClose,
}: ContextBuilderProps): React.ReactElement {
  const model = useContextBuilderModel(projectRoot, { contextSelection });

  return <ContextBuilderView {...model} onClose={onClose} />;
}
