/**
 * ContextBuilder.tsx â€” Smart Context Builder panel.
 */

import React from 'react';
import { useContextBuilderModel } from './useContextBuilderModel';
import { ContextBuilderView } from './ContextBuilderView';

export interface ContextBuilderProps {
  projectRoot: string;
  onClose: () => void;
}

export function ContextBuilder({
  projectRoot,
  onClose,
}: ContextBuilderProps): React.ReactElement {
  const model = useContextBuilderModel(projectRoot);

  return <ContextBuilderView {...model} onClose={onClose} />;
}
