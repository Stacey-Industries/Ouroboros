import React from 'react';

import {
  AdditionalDirectoriesSection,
  BudgetSection,
  DangerZoneSection,
  EffortSection,
  ModelSection,
  PermissionModeSection,
  SystemPromptSection,
} from './ClaudeSectionConfigSections';
import { claudeSectionHeaderTextStyle } from './claudeSectionContentStyles';
import { TextInputSection, ToggleSection } from './ClaudeSectionControls';
import { ClaudeTemplateEditor } from './ClaudeTemplateEditor';
import { SectionLabel } from './settingsStyles';
import type { ClaudeSectionModel } from './useClaudeSection';

interface ClaudeSectionBodyProps {
  model: ClaudeSectionModel;
}

export function ClaudeSectionBody({
  model,
}: ClaudeSectionBodyProps): React.ReactElement<any> {
  return (
    <>
      <HeaderSection />
      <ClaudeSectionBasics model={model} />
      <ClaudeSectionTools model={model} />
      <ClaudeSectionWorkspace model={model} />
      <DangerZoneSection model={model} />
    </>
  );
}

function ClaudeSectionBasics({
  model,
}: ClaudeSectionBodyProps): React.ReactElement<any> {
  return (
    <>
      <ToggleSection
        checked={model.autoLaunch}
        description="Open a Claude Code session automatically when Ouroboros starts, instead of a plain shell."
        label="Auto launch Claude on startup"
        title="Auto Launch on Startup"
        onChange={model.setAutoLaunch}
      />
      <PermissionModeSection model={model} />
      <ModelSection model={model} />
      <EffortSection model={model} />
      <ToggleSection
        checked={model.settings.verbose}
        description="Show detailed output during Claude Code sessions."
        label="Verbose output"
        title="Verbose Output"
        onChange={(value) => model.updateSetting('verbose', value)}
      />
      <BudgetSection model={model} />
    </>
  );
}

function ClaudeSectionTools({
  model,
}: ClaudeSectionBodyProps): React.ReactElement<any> {
  return (
    <>
      <TextInputSection
        description='Comma-separated list of allowed tools (e.g. "Bash(git:*) Edit"). Empty = all tools.'
        label="Allowed tools"
        placeholder="e.g. Bash(git:*) Edit Read"
        title="Allowed Tools"
        value={model.settings.allowedTools}
        onChange={(value) => model.updateSetting('allowedTools', value)}
      />
      <TextInputSection
        description="Comma-separated list of disallowed tools. Empty = none blocked."
        label="Disallowed tools"
        placeholder="e.g. Bash Write"
        title="Disallowed Tools"
        value={model.settings.disallowedTools}
        onChange={(value) => model.updateSetting('disallowedTools', value)}
      />
      <SystemPromptSection model={model} />
      <AdditionalDirectoriesSection model={model} />
    </>
  );
}

function ClaudeSectionWorkspace({
  model,
}: ClaudeSectionBodyProps): React.ReactElement<any> {
  return (
    <>
      <ToggleSection
        checked={model.settings.chrome}
        description="Enable Claude in Chrome browser integration."
        label="Chrome integration"
        title="Chrome Integration"
        onChange={(value) => model.updateSetting('chrome', value)}
      />
      <ToggleSection
        checked={model.settings.worktree}
        description="Create a new git worktree for each Claude Code session."
        label="Git worktree"
        title="Git Worktree"
        onChange={(value) => model.updateSetting('worktree', value)}
      />
      <ClaudeTemplateEditor templates={model.templates} onChange={model.updateTemplates} />
    </>
  );
}

function HeaderSection(): React.ReactElement<any> {
  return (
    <div>
      <SectionLabel>Claude Code Settings</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionHeaderTextStyle}>
        Configure how Claude Code launches in new Claude terminals.
      </p>
    </div>
  );
}
