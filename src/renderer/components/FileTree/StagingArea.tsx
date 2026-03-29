import React, { useCallback, useState } from 'react';

import type { DetailedGitStatus } from '../../hooks/useGitStatusDetailed';
import type { StagingFileEntry } from './StagingArea.parts';
import {
  BulkActionButton,
  Chevron,
  DiscardButton,
  StageButton,
  StagingFileRow,
  SubSectionHeader,
  UnstageButton,
} from './StagingArea.parts';
import {
  STAGING_CSS,
  stagingCountBadgeStyle,
  stagingHeaderStyle,
  stagingHeaderTitleStyle,
  stagingSectionStyle,
} from './StagingArea.styles';

export interface StagingAreaProps {
  projectRoot: string;
  status: DetailedGitStatus;
  onRefresh: () => void;
  onFileSelect: (filePath: string) => void;
}

function getFileName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

function toEntries(map: Map<string, string>): StagingFileEntry[] {
  return [...map.entries()]
    .map(([path, status]) => ({ path, name: getFileName(path), status }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function GitIcon(): React.ReactElement<any> {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="text-interactive-accent"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M14.5 7.5L8.5 1.5a.7.7 0 0 0-1 0L5.7 3.3l1.3 1.3a1 1 0 0 1 1.2 1.2l1.2 1.2a1 1 0 1 1-.7.7L7.6 6.5v3a1 1 0 1 1-1-.6V6.3a1 1 0 0 1-.5-1.3L4.8 3.7 1.5 7a.7.7 0 0 0 0 1L7.5 14a.7.7 0 0 0 1 0l6-6a.7.7 0 0 0 0-1z"
        stroke="currentColor"
        strokeWidth="0.8"
        fill="none"
      />
    </svg>
  );
}

function useStagingActions(projectRoot: string, onRefresh: () => void) {
  const unstage = useCallback(
    async (filePath: string) => {
      await window.electronAPI.git.unstage(projectRoot, filePath);
      onRefresh();
    },
    [projectRoot, onRefresh],
  );
  const unstageAll = useCallback(async () => {
    await window.electronAPI.git.unstageAll(projectRoot);
    onRefresh();
  }, [projectRoot, onRefresh]);
  const stage = useCallback(
    async (filePath: string) => {
      await window.electronAPI.git.stage(projectRoot, filePath);
      onRefresh();
    },
    [projectRoot, onRefresh],
  );
  const stageAll = useCallback(async () => {
    await window.electronAPI.git.stageAll(projectRoot);
    onRefresh();
  }, [projectRoot, onRefresh]);
  const discard = useCallback(
    async (filePath: string) => {
      if (!confirm(`Discard changes to "${filePath}"? This cannot be undone.`)) return;
      await window.electronAPI.git.discardFile(projectRoot, filePath);
      onRefresh();
    },
    [projectRoot, onRefresh],
  );
  return { unstage, unstageAll, stage, stageAll, discard };
}

function StagingAreaHeader({
  isExpanded,
  totalCount,
  onToggle,
}: {
  isExpanded: boolean;
  totalCount: number;
  onToggle: () => void;
}): React.ReactElement<any> {
  return (
    <div
      className="bg-surface-raised"
      style={stagingHeaderStyle}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      aria-expanded={isExpanded}
      aria-label="Toggle Source Control section"
    >
      <Chevron expanded={isExpanded} />
      <GitIcon />
      <span className="text-text-semantic-muted" style={stagingHeaderTitleStyle}>
        Source Control
      </span>
      <span className="text-text-semantic-faint bg-surface-base" style={stagingCountBadgeStyle}>
        {totalCount}
      </span>
    </div>
  );
}

interface FilesSectionProps {
  title: string;
  entries: StagingFileEntry[];
  projectRoot: string;
  onFileSelect: (filePath: string) => void;
  onAction: (filePath: string) => Promise<void>;
  onBulk: () => Promise<void>;
  bulkLabel: string;
  onDiscard?: (filePath: string) => Promise<void>;
  kind: 'staged' | 'unstaged';
}
function FileRowActions(
  p: Pick<FilesSectionProps, 'kind' | 'onAction' | 'onDiscard'> & { path: string },
): React.ReactElement<any> {
  if (p.kind === 'staged') return <UnstageButton onClick={() => void p.onAction(p.path)} />;
  return (
    <>
      <StageButton onClick={() => void p.onAction(p.path)} />
      <DiscardButton onClick={() => void p.onDiscard?.(p.path)} />
    </>
  );
}

function FilesSection(p: FilesSectionProps): React.ReactElement<any> | null {
  const [expanded, setExpanded] = useState(true);
  if (p.entries.length === 0) return null;
  const ariaLabel = p.kind === 'staged' ? 'Staged files' : 'Unstaged files';
  return (
    <div>
      <SubSectionHeader
        title={p.title}
        count={p.entries.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        headerAction={<BulkActionButton label={p.bulkLabel} onClick={() => void p.onBulk()} />}
      />
      {expanded && (
        <div role="list" aria-label={ariaLabel}>
          {p.entries.map((entry) => (
            <StagingFileRow
              key={entry.path}
              entry={entry}
              projectRoot={p.projectRoot}
              onFileSelect={p.onFileSelect}
              actions={
                <FileRowActions
                  kind={p.kind}
                  onAction={p.onAction}
                  onDiscard={p.onDiscard}
                  path={entry.path}
                />
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

type StagingBodyProps = {
  stagedEntries: StagingFileEntry[];
  unstagedEntries: StagingFileEntry[];
  projectRoot: string;
  onFileSelect: (filePath: string) => void;
  actions: ReturnType<typeof useStagingActions>;
};
function StagingBody({
  stagedEntries,
  unstagedEntries,
  projectRoot,
  onFileSelect,
  actions,
}: StagingBodyProps): React.ReactElement<any> {
  return (
    <>
      <FilesSection
        kind="staged"
        title="Staged Changes"
        entries={stagedEntries}
        projectRoot={projectRoot}
        onFileSelect={onFileSelect}
        onAction={actions.unstage}
        onBulk={actions.unstageAll}
        bulkLabel="-All"
      />
      <FilesSection
        kind="unstaged"
        title="Changes"
        entries={unstagedEntries}
        projectRoot={projectRoot}
        onFileSelect={onFileSelect}
        onAction={actions.stage}
        onBulk={actions.stageAll}
        bulkLabel="+All"
        onDiscard={actions.discard}
      />
    </>
  );
}

export function StagingArea({
  projectRoot,
  status,
  onRefresh,
  onFileSelect,
}: StagingAreaProps): React.ReactElement<any> | null {
  const [isExpanded, setIsExpanded] = useState(false);
  const stagedEntries = toEntries(status.staged);
  const unstagedEntries = toEntries(status.unstaged);
  const totalCount = stagedEntries.length + unstagedEntries.length;
  const actions = useStagingActions(projectRoot, onRefresh);
  if (totalCount === 0) return null;
  return (
    <div style={stagingSectionStyle}>
      <style>{STAGING_CSS}</style>
      <StagingAreaHeader
        isExpanded={isExpanded}
        totalCount={totalCount}
        onToggle={() => setIsExpanded((v) => !v)}
      />
      {isExpanded && (
        <StagingBody
          stagedEntries={stagedEntries}
          unstagedEntries={unstagedEntries}
          projectRoot={projectRoot}
          onFileSelect={onFileSelect}
          actions={actions}
        />
      )}
    </div>
  );
}

export type { StagingFileEntry };
