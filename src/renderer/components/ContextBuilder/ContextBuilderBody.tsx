import React from 'react';
import type {
  ContextGenerateOptions,
  ProjectContext,
} from '../../types/electron';
import { ContextSelectionSection } from './ContextSelectionSection';
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
  | 'contextSelection'
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
  | 'projectRoot'
  | 'runScan'
  | 'scanning'
>;

export function ContextBuilderBody(props: ContextBuilderBodyProps): React.ReactElement {
  const { context } = props;

  return (
    <div style={bodyStyle}>
      {props.error && <ErrorBanner error={props.error} />}
      {context ? <ContextSections {...props} context={context} /> : <ContextBuilderState {...props} />}
    </div>
  );
}

function ContextSections({
  context,
  contextSelection,
  editedContent,
  handleCopyToClipboard,
  handleCreateClaudeMd,
  handleEditedContentChange,
  handleOptionToggle,
  handleResetEdits,
  handleSetSystemPrompt,
  handleUpdateClaudeMd,
  options,
  projectRoot,
  runScan,
  scanning,
}: ContextBuilderBodyProps & { context: ProjectContext }): React.ReactElement {
  return (
    <>
      <ProjectDetailsSections context={context} />
      <ContextControlsSection
        contextSelection={contextSelection}
        handleOptionToggle={handleOptionToggle}
        options={options}
        projectRoot={projectRoot}
      />
      <GeneratedContextBlock
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

function ProjectDetailsSections({ context }: { context: ProjectContext }): React.ReactElement {
  return (
    <>
      <ProjectSummarySection context={context} />
      <EntryPointsSection entryPoints={context.entryPoints} />
      <StructureSection context={context} />
      <BuildCommandsSection context={context} />
      <ConfigFilesSection keyConfigs={context.keyConfigs} />
    </>
  );
}

function ContextControlsSection({
  contextSelection,
  handleOptionToggle,
  options,
  projectRoot,
}: Pick<ContextBuilderBodyProps, 'contextSelection' | 'handleOptionToggle' | 'options' | 'projectRoot'>): React.ReactElement {
  return (
    <>
      <GenerationOptionsSection handleOptionToggle={handleOptionToggle} options={options} />
      {contextSelection && (
        <ContextSelectionSection
          contextSelection={contextSelection}
          projectRoot={projectRoot}
        />
      )}
    </>
  );
}

function GeneratedContextBlock(props: Pick<
  ContextBuilderBodyProps,
  | 'editedContent'
  | 'handleCopyToClipboard'
  | 'handleCreateClaudeMd'
  | 'handleEditedContentChange'
  | 'handleResetEdits'
  | 'handleSetSystemPrompt'
  | 'handleUpdateClaudeMd'
  | 'runScan'
  | 'scanning'
> & {
  context: ProjectContext;
}): React.ReactElement {
  return <GeneratedContextSection {...props} />;
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
          <span className="text-text-semantic-primary" style={{ fontSize: '15px', fontWeight: 600 }}>
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
              <span className="text-text-semantic-muted" style={{ fontSize: '12px' }}>{dir.purpose}</span>
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
            <span className="text-text-semantic-muted" style={{ fontSize: '11px' }}>{command.command}</span>
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
              checked={Boolean(options[option.key])}
              onChange={() => handleOptionToggle(option.key)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </Section>
  );
}
