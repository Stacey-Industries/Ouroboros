import React, { useMemo } from 'react';
import type { PanelSizes, WorkspaceLayout } from '../../types/electron';
import { LspStatus } from './LspStatus';
import {
  BranchButton,
  BranchIcon,
  Divider,
  LayoutControl,
  StatusItem,
} from './StatusBarControls';

export interface StatusBarLayoutProps {
  layouts: WorkspaceLayout[];
  activeLayoutName: string;
  currentPanelSizes: PanelSizes;
  currentVisiblePanels: { leftSidebar: boolean; rightSidebar: boolean; terminal: boolean };
  onSelectLayout: (layout: WorkspaceLayout) => void;
  onSaveLayout: (name: string) => void;
  onUpdateLayout: (name: string) => void;
  onDeleteLayout: (name: string) => void;
}

export interface StatusBarProps {
  activeFilePath?: string | null;
  projectRoot?: string | null;
  lineCount?: number;
  language?: string;
  gitBranch?: string | null;
  layout?: StatusBarLayoutProps;
}

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript JSX',
  js: 'JavaScript',
  jsx: 'JavaScript JSX',
  json: 'JSON',
  md: 'Markdown',
  css: 'CSS',
  scss: 'SCSS',
  html: 'HTML',
  vue: 'Vue',
  py: 'Python',
  rs: 'Rust',
  go: 'Go',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  h: 'C Header',
  hpp: 'C++ Header',
  rb: 'Ruby',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  yml: 'YAML',
  yaml: 'YAML',
  toml: 'TOML',
  xml: 'XML',
  svg: 'SVG',
  sql: 'SQL',
  graphql: 'GraphQL',
  txt: 'Plain Text',
  log: 'Log',
  env: 'Environment',
  gitignore: 'Git Ignore',
};

const STATUS_BAR_STYLE: React.CSSProperties = {
  height: '22px',
  backgroundColor: 'var(--bg-secondary)',
  borderTop: '1px solid var(--border)',
  fontSize: '11px',
  fontFamily: 'var(--font-ui, system-ui)',
  overflow: 'visible',
  position: 'relative',
};

function inferLanguage(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() ?? '';
  if (name.startsWith('.') && !name.includes('.', 1)) {
    return EXT_TO_LANGUAGE[name.slice(1)] ?? 'Plain Text';
  }

  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return EXT_TO_LANGUAGE[extension] ?? 'Plain Text';
}

function relativePath(filePath: string, projectRoot: string | null | undefined): string {
  if (!projectRoot) {
    return filePath;
  }

  const normalizedFile = filePath.replace(/\\/g, '/');
  const normalizedRoot = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');

  return normalizedFile.startsWith(`${normalizedRoot}/`)
    ? normalizedFile.slice(normalizedRoot.length + 1)
    : filePath;
}

function GitSection({
  gitBranch,
  projectRoot,
}: {
  gitBranch?: string | null;
  projectRoot?: string | null;
}): React.ReactElement | null {
  if (!gitBranch) {
    return null;
  }

  return projectRoot ? (
    <>
      <BranchButton gitBranch={gitBranch} projectRoot={projectRoot} />
      <Divider />
    </>
  ) : (
    <>
      <StatusItem title={`Branch: ${gitBranch}`}>
        <span className="flex items-center gap-1">
          <BranchIcon />
          <span className="truncate max-w-[120px]">{gitBranch}</span>
        </span>
      </StatusItem>
      <Divider />
    </>
  );
}

function FileSection({
  activeFilePath,
  displayLanguage,
  lineCount,
  relPath,
}: {
  activeFilePath?: string | null;
  displayLanguage: string | null;
  lineCount?: number;
  relPath: string | null;
}): React.ReactElement {
  if (!relPath) {
    return <StatusItem>No file open</StatusItem>;
  }

  return (
    <>
      <StatusItem title={activeFilePath ?? undefined}>{relPath}</StatusItem>
      {lineCount != null && (
        <>
          <Divider />
          <StatusItem>{lineCount} {lineCount === 1 ? 'line' : 'lines'}</StatusItem>
        </>
      )}
      {displayLanguage && (
        <>
          <Divider />
          <StatusItem>{displayLanguage}</StatusItem>
        </>
      )}
    </>
  );
}

function RightSection({
  layout,
}: {
  layout?: StatusBarLayoutProps;
}): React.ReactElement {
  return (
    <div className="flex items-center flex-shrink-0">
      {layout && (
        <>
          <LayoutControl layout={layout} />
          <Divider />
        </>
      )}
      <LspStatus />
      <Divider />
      <StatusItem>UTF-8</StatusItem>
      <Divider />
      <StatusItem>Ouroboros</StatusItem>
    </div>
  );
}

export function StatusBar({
  activeFilePath,
  projectRoot,
  lineCount,
  language,
  gitBranch,
  layout,
}: StatusBarProps): React.ReactElement {
  const relPath = useMemo(
    () => (activeFilePath ? relativePath(activeFilePath, projectRoot) : null),
    [activeFilePath, projectRoot],
  );
  const displayLanguage = useMemo(
    () => language ?? (activeFilePath ? inferLanguage(activeFilePath) : null),
    [activeFilePath, language],
  );

  return (
    <div className="flex items-center justify-between flex-shrink-0 select-none" style={STATUS_BAR_STYLE}>
      <div className="flex items-center min-w-0 overflow-hidden">
        <GitSection gitBranch={gitBranch} projectRoot={projectRoot} />
        <FileSection
          activeFilePath={activeFilePath}
          displayLanguage={displayLanguage}
          lineCount={lineCount}
          relPath={relPath}
        />
      </div>
      <RightSection layout={layout} />
    </div>
  );
}
