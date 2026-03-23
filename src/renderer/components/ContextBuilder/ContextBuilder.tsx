/**
 * ContextBuilder.tsx â€” Smart Context Builder panel.
 */

import React from 'react';

import { ContextBuilderView } from './ContextBuilderView';
import { type ContextBuilderModelOptions,useContextBuilderModel } from './useContextBuilderModel';

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
