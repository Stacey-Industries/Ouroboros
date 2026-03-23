/**
 * GitPanel.tsx â€” Main Git panel component for staged/unstaged changes,
 * branch switching, and commit creation.
 */

import React, { memo } from 'react';

import { useProject } from '../../contexts/ProjectContext';
import { GitPanelContent } from './GitPanelContent';
import { useGitPanelModel } from './useGitPanelModel';

export const GitPanel = memo(function GitPanel(): React.ReactElement {
  const { projectRoot } = useProject();
  const model = useGitPanelModel(projectRoot);

  return <GitPanelContent projectRoot={projectRoot} {...model} />;
});
