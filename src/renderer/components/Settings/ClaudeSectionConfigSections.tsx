import React from 'react';

import {
  claudeSectionAddButtonStyle,
  claudeSectionAddDirectoryRowStyle,
  claudeSectionBudgetInputStyle,
  claudeSectionDangerCopyStyle,
  claudeSectionDangerRowStyle,
  claudeSectionDangerSectionStyle,
  claudeSectionDangerTextStyle,
  claudeSectionDangerTitleStyle,
  claudeSectionDirectoryListStyle,
  claudeSectionDirectoryRowStyle,
  claudeSectionDirectoryTextStyle,
  claudeSectionEffortButtonStyle,
  claudeSectionEffortListStyle,
  claudeSectionModelHelpStyle,
  claudeSectionRemoveDirectoryButtonStyle,
  claudeSectionSectionDescriptionStyle,
  claudeSectionTextareaStyle,
  claudeSectionTextInputStyle,
} from './claudeSectionContentStyles';
import { SelectSection, SwitchControl } from './ClaudeSectionControls';
import { SectionLabel } from './settingsStyles';
import type { ClaudeSectionModel } from './useClaudeSection';
import {
  EFFORT_LEVELS,
  PERMISSION_MODES,
} from './useClaudeSection';

interface ClaudeSectionConfigProps {
  model: ClaudeSectionModel;
}

export function PermissionModeSection({
  model,
}: ClaudeSectionConfigProps): React.ReactElement {
  return (
    <SelectSection
      description="Controls how Claude handles tool permission requests."
      label="Permission mode"
      title="Permission Mode"
      value={model.settings.permissionMode}
      onChange={(value) => model.updateSetting('permissionMode', value)}
    >
      {PERMISSION_MODES.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectSection>
  );
}

export function ModelSection({
  model,
}: ClaudeSectionConfigProps): React.ReactElement {
  return (
    <section>
      <SelectSection
        description="Override the model used for Claude Code sessions. Full version IDs pin to a specific release; aliases track the latest of that tier."
        label="Model override"
        title="Model"
        value={model.settings.model}
        onChange={(value) => model.updateSetting('model', value)}
      >
        <option value="">(CLI Default)</option>
        {model.modelOptionGroups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectSection>
      {model.settings.model && (
        <p style={claudeSectionModelHelpStyle}>
          Passes <code>--model {model.settings.model}</code> to the Claude CLI
        </p>
      )}
    </section>
  );
}

export function EffortSection({
  model,
}: ClaudeSectionConfigProps): React.ReactElement {
  return (
    <section>
      <SectionLabel>Effort Level</SectionLabel>
      <p style={claudeSectionSectionDescriptionStyle}>
        Controls how much effort Claude puts into responses.
      </p>
      <div style={claudeSectionEffortListStyle}>
        {EFFORT_LEVELS.map((level) => (
          <button
            key={level.value}
            onClick={() => model.updateSetting('effort', level.value)}
            style={claudeSectionEffortButtonStyle(model.settings.effort === level.value)}
          >
            {level.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function BudgetSection({
  model,
}: ClaudeSectionConfigProps): React.ReactElement {
  return (
    <section>
      <SectionLabel>Max Budget (USD)</SectionLabel>
      <p style={claudeSectionSectionDescriptionStyle}>
        Maximum dollar amount to spend per session. 0 for unlimited.
      </p>
      <input
        type="number"
        min={0}
        step={1}
        value={model.settings.maxBudgetUsd}
        onChange={(event) => updateBudget(model, event.target.value)}
        aria-label="Max budget in USD"
        style={claudeSectionBudgetInputStyle}
      />
    </section>
  );
}

export function SystemPromptSection({
  model,
}: ClaudeSectionConfigProps): React.ReactElement {
  return (
    <section>
      <SectionLabel>System Prompt (Append)</SectionLabel>
      <p style={claudeSectionSectionDescriptionStyle}>
        Additional instructions appended to Claude&apos;s default system prompt.
      </p>
      <textarea
        value={model.settings.appendSystemPrompt}
        onChange={(event) => model.updateSetting('appendSystemPrompt', event.target.value)}
        placeholder="e.g. Always respond in Spanish."
        aria-label="Append system prompt"
        rows={4}
        style={claudeSectionTextareaStyle}
      />
    </section>
  );
}

export function AdditionalDirectoriesSection({
  model,
}: ClaudeSectionConfigProps): React.ReactElement {
  return (
    <section>
      <SectionLabel>Additional Directories</SectionLabel>
      <p style={claudeSectionSectionDescriptionStyle}>
        Extra directories Claude Code can access beyond the project root.
      </p>
      {model.settings.addDirs.length > 0 && (
        <DirectoryList directories={model.settings.addDirs} onRemove={model.removeDir} />
      )}
      <AddDirectoryRow model={model} />
    </section>
  );
}

export function DangerZoneSection({
  model,
}: ClaudeSectionConfigProps): React.ReactElement {
  return (
    <section style={claudeSectionDangerSectionStyle}>
      <SectionLabel style={{ color: '#ef4444' }}>Danger Zone</SectionLabel>
      <div style={claudeSectionDangerRowStyle}>
        <div style={claudeSectionDangerCopyStyle}>
          <div style={claudeSectionDangerTitleStyle}>Skip All Permission Checks</div>
          <p style={claudeSectionDangerTextStyle}>
            Bypasses ALL permission checks. Only use in sandboxed environments with no internet
            access.
          </p>
        </div>
        <SwitchControl
          checked={model.settings.dangerouslySkipPermissions}
          danger
          label="Skip permission checks"
          onChange={(value) => model.updateSetting('dangerouslySkipPermissions', value)}
        />
      </div>
    </section>
  );
}

function DirectoryList({
  directories,
  onRemove,
}: {
  directories: string[];
  onRemove: (index: number) => void;
}): React.ReactElement {
  return (
    <div style={claudeSectionDirectoryListStyle}>
      {directories.map((directory, index) => (
        <div key={`${directory}-${index}`} style={claudeSectionDirectoryRowStyle}>
          <span style={claudeSectionDirectoryTextStyle}>{directory}</span>
          <button
            onClick={() => onRemove(index)}
            aria-label={`Remove ${directory}`}
            style={claudeSectionRemoveDirectoryButtonStyle}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}

function AddDirectoryRow({
  model,
}: ClaudeSectionConfigProps): React.ReactElement {
  return (
    <div style={claudeSectionAddDirectoryRowStyle}>
      <input
        type="text"
        value={model.newDir}
        onChange={(event) => model.setNewDir(event.target.value)}
        onKeyDown={(event) => handleDirectoryKeyDown(event, model.addDir)}
        placeholder="/path/to/directory"
        aria-label="New directory path"
        style={{ ...claudeSectionTextInputStyle, flex: 1 }}
      />
      <button
        onClick={model.addDir}
        disabled={!model.canAddDir}
        style={claudeSectionAddButtonStyle(model.canAddDir)}
      >
        Add
      </button>
    </div>
  );
}

function handleDirectoryKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>,
  addDir: () => void,
): void {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  addDir();
}

function updateBudget(model: ClaudeSectionModel, rawValue: string): void {
  const parsed = Number.parseFloat(rawValue);
  if (!Number.isNaN(parsed) && parsed >= 0) {
    model.updateSetting('maxBudgetUsd', parsed);
  }
}
