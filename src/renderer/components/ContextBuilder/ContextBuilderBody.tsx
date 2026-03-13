import React from 'react';
import type {
  ContextGenerateOptions,
  ProjectContext,
} from '../../types/electron';
import { GeneratedContextSection } from './GeneratedContextSection';
import {
  Badge,
  CodeLine,
  ConfigPill,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Section,
  badgeWrapStyle,
  bodyStyle,
  buildProjectBadges,
  cardStyle,
  commandRowStyle,
  configListStyle,
  optionCardStyle,
  optionLabelStyle,
  structureGridStyle,
  titleRowStyle,
} from './ContextBuilderPrimitives';
import type { ContextBuilderModel } from './useContextBuilderModel';

const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', 'build']);

const OPTION_ITEMS: Array<{
  key: keyof ContextGenerateOptions;
  label: string;
}> = [
  { key: 'includeCommands', label: 'Commands' },
  { key: 'includeStructure', label: 'Structure' },
  { key: 'includeDeps', label: 'Dependencies' },
];

type ContextBuilderBodyProps = Pick<
ContextBuilderModel,
  | 'context'
  | 'editedContent'
  | 'error'
  | 'handleCopyToClipboard'
  | 'handleCreateClaudeMd'
  | 'handleEditedContentChange'
  | 'handleOptionToggle'
  | 'handleResetEdits'
  | 'handleSetSystemPrompt'
  | 'handleUpdateClaudeMd'
  | 'options'
  | 'runScan'
  | 'scanning'
>;

export function ContextBuilderBody(props: ContextBuilderBodyProps): React.ReactElement {
  return (
    <div style={bodyStyle}>
      {props.error && <ErrorBanner error={props.error} />}
      {props.context ? <ContextSections {...props} /> : <ContextBuilderState {...props} />}
    </div>
  );
}

function ContextSections({
  context,
  editedContent,
  handleCopyToClipboard,
  handleCreateClaudeMd,
  handleEditedContentChange,
  handleOptionToggle,
  handleResetEdits,
  handleSetSystemPrompt,
  handleUpdateClaudeMd,
  options,
  runScan,
  scanning,
}: ContextBuilderBodyProps & { context: ProjectContext }): React.ReactElement {
  return (
    <>
      <ProjectSummarySection context={context} />
      <EntryPointsSection entryPoints={context.entryPoints} />
      <StructureSection context={context} />
      <BuildCommandsSection context={context} />
      <ConfigFilesSection keyConfigs={context.keyConfigs} />
      <GenerationOptionsSection handleOptionToggle={handleOptionToggle} options={options} />
      <GeneratedContextSection
        context={context}
        editedContent={editedContent}
        handleCopyToClipboard={handleCopyToClipboard}
        handleCreateClaudeMd={handleCreateClaudeMd}
        handleEditedContentChange={handleEditedContentChange}
        handleResetEdits={handleResetEdits}
        handleSetSystemPrompt={handleSetSystemPrompt}
        handleUpdateClaudeMd={handleUpdateClaudeMd}
        runScan={runScan}
        scanning={scanning}
      />
    </>
  );
}

function ContextBuilderState({
  context,
  error,
  scanning,
}: Pick<ContextBuilderBodyProps, 'context' | 'error' | 'scanning'>): React.ReactElement | null {
  if (context || error) {
    return null;
  }

  return scanning
    ? <LoadingState />
    : <EmptyState>No project root selected. Open a folder to scan.</EmptyState>;
}

function ProjectSummarySection({ context }: { context: ProjectContext }): React.ReactElement {
  return (
    <Section title="Project Summary">
      <div style={cardStyle}>
        <div style={titleRowStyle}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
            {context.name}
          </span>
          {context.hasClaudeMd && <Badge label="CLAUDE.md exists" color="#22c55e" />}
        </div>
        <div style={badgeWrapStyle}>
          {buildProjectBadges(context).map((badge) => (
            <Badge key={`${badge.label}-${badge.color ?? 'default'}`} {...badge} />
          ))}
        </div>
      </div>
    </Section>
  );
}

function EntryPointsSection({ entryPoints }: { entryPoints: string[] }): React.ReactElement | null {
  if (entryPoints.length === 0) {
    return null;
  }

  return (
    <Section title="Entry Points">
      <div style={cardStyle}>
        {entryPoints.map((entryPoint) => (
          <CodeLine key={entryPoint}>{entryPoint}</CodeLine>
        ))}
      </div>
    </Section>
  );
}

function StructureSection({ context }: { context: ProjectContext }): React.ReactElement | null {
  const keyDirs = context.keyDirs.filter((dir) => !IGNORED_DIRECTORIES.has(dir.path));

  if (keyDirs.length === 0) {
    return null;
  }

  return (
    <Section title="Project Structure">
      <div style={cardStyle}>
        <div style={structureGridStyle}>
          {keyDirs.map((dir) => (
            <React.Fragment key={dir.path}>
              <CodeLine accent>{dir.path}/</CodeLine>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{dir.purpose}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </Section>
  );
}

function BuildCommandsSection({ context }: { context: ProjectContext }): React.ReactElement | null {
  if (context.buildCommands.length === 0) {
    return null;
  }

  return (
    <Section title="Build Commands">
      <div style={cardStyle}>
        {context.buildCommands.map((command) => (
          <div key={command.name} style={commandRowStyle}>
            <CodeLine accent>{command.name}</CodeLine>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{command.command}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ConfigFilesSection({ keyConfigs }: { keyConfigs: string[] }): React.ReactElement | null {
  if (keyConfigs.length === 0) {
    return null;
  }

  return (
    <Section title="Configuration Files">
      <div style={cardStyle}>
        <div style={configListStyle}>
          {keyConfigs.map((config) => (
            <ConfigPill key={config} label={config} />
          ))}
        </div>
      </div>
    </Section>
  );
}

function GenerationOptionsSection({
  handleOptionToggle,
  options,
}: Pick<ContextBuilderBodyProps, 'handleOptionToggle' | 'options'>): React.ReactElement {
  return (
    <Section title="Generation Options">
      <div style={optionCardStyle}>
        {OPTION_ITEMS.map((option) => (
          <label key={option.key} style={optionLabelStyle}>
            <input
              type="checkbox"
              checked={options[option.key]}
              onChange={() => handleOptionToggle(option.key)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </Section>
  );
}
