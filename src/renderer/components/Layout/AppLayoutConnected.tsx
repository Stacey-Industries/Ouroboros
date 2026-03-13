/**
 * AppLayoutConnected — wraps AppLayout, reads FileViewerManager context
 * for status bar data and forwards all other props.
 *
 * Extracted from App.tsx.
 */

import React from 'react';
import { AppLayout } from './AppLayout';
import type { AppLayoutProps } from './AppLayout';
import { useFileViewerManager } from '../FileViewer';
import { useGitBranch } from '../../hooks/useGitBranch';

function useStatusBarProps(): {
  activeFilePath: string | null;
  lineCount: number | undefined;
  language: string | undefined;
} {
  const { activeFile } = useFileViewerManager();
  const lineCount = activeFile?.content != null
    ? activeFile.content.split('\n').length
    : undefined;

  return {
    activeFilePath: activeFile?.path ?? null,
    lineCount,
    language: undefined,
  };
}

export function AppLayoutConnected(
  props: Omit<AppLayoutProps, 'statusBar'> & { projectRoot: string | null },
): React.ReactElement {
  const { projectRoot, ...layoutProps } = props;
  const statusBarData = useStatusBarProps();
  const { branch } = useGitBranch(projectRoot);

  return (
    <AppLayout
      {...layoutProps}
      statusBar={{
        activeFilePath: statusBarData.activeFilePath,
        projectRoot,
        lineCount: statusBarData.lineCount,
        language: statusBarData.language,
        gitBranch: branch,
      }}
    />
  );
}
