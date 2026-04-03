import React from 'react';

import type { AppConfig } from '../../types/electron';
import {
  claudeSectionAddButtonStyle,
  claudeSectionAddDirectoryRowStyle,
  claudeSectionDangerCopyStyle,
  claudeSectionDangerRowStyle,
  claudeSectionDangerSectionStyle,
  claudeSectionDangerTextStyle,
  claudeSectionDangerTitleStyle,
  claudeSectionDirectoryListStyle,
  claudeSectionDirectoryRowStyle,
  claudeSectionDirectoryTextStyle,
  claudeSectionHeaderTextStyle,
  claudeSectionModelHelpStyle,
  claudeSectionRemoveDirectoryButtonStyle,
  claudeSectionRootStyle,
  claudeSectionSectionDescriptionStyle,
  claudeSectionTextInputStyle,
} from './claudeSectionContentStyles';
import { SelectSection, SwitchControl, TextInputSection, ToggleSection } from './ClaudeSectionControls';
import { SectionLabel } from './settingsStyles';
import {
  CODEX_APPROVAL_POLICIES,
  CODEX_REASONING_LEVELS,
  CODEX_SANDBOX_MODES,
  type CodexSectionModel,
  useCodexSectionModel,
} from './useCodexSection';

interface CodexSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

export function CodexSection({ draft, onChange }: CodexSectionProps): React.ReactElement {
  const model = useCodexSectionModel(draft, onChange);

  return (
    <div style={claudeSectionRootStyle}>
      <HeaderSection />
      <ModelSection model={model} />
      <ExecutionSection model={model} />
      <WorkspaceSection model={model} />
      <DangerZoneSection model={model} />
    </div>
  );
}

function HeaderSection(): React.ReactElement {
  return (
    <div>
      <SectionLabel>Codex Settings</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionHeaderTextStyle}>
        Configure how Codex CLI launches in new Codex terminals and agent chat sessions.
      </p>
    </div>
  );
}

function ModelSection({ model }: { model: CodexSectionModel }): React.ReactElement {
  return (
    <>
      <SelectSection
        description="Override the model used for Codex sessions. This same model list is used in the chat composer when Codex is selected."
        label="Codex model override"
        title="Model"
        value={model.settings.model}
        onChange={(value) => model.updateSetting('model', value)}
      >
        <option value="">(CLI Default)</option>
        {model.modelOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </SelectSection>
      {model.settings.model && (
        <p className="text-text-semantic-muted" style={claudeSectionModelHelpStyle}>
          Passes <code>--model {model.settings.model}</code> to the Codex CLI
        </p>
      )}
      <SelectSection
        description="Controls how much reasoning effort Codex should spend before responding."
        label="Codex reasoning effort"
        title="Reasoning Effort"
        value={model.settings.reasoningEffort}
        onChange={(value) => model.updateSetting('reasoningEffort', value)}
      >
        {CODEX_REASONING_LEVELS.map((level) => (
          <option key={level.value} value={level.value}>
            {level.label}
          </option>
        ))}
      </SelectSection>
    </>
  );
}

function SandboxModeSection({ model }: { model: CodexSectionModel }): React.ReactElement {
  return (
    <SelectSection
      description="Controls the Codex command sandbox used during edits and tool execution."
      label="Codex sandbox mode"
      title="Sandbox Mode"
      value={model.settings.sandbox}
      onChange={(value) => model.updateSetting('sandbox', value as AppConfig['codexCliSettings']['sandbox'])}
    >
      {CODEX_SANDBOX_MODES.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectSection>
  );
}

function ApprovalPolicySection({ model }: { model: CodexSectionModel }): React.ReactElement {
  return (
    <SelectSection
      description="Controls when Codex asks for approval before executing commands."
      label="Codex approval policy"
      title="Approval Policy"
      value={model.settings.approvalPolicy}
      onChange={(value) => model.updateSetting('approvalPolicy', value as AppConfig['codexCliSettings']['approvalPolicy'])}
    >
      {CODEX_APPROVAL_POLICIES.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectSection>
  );
}

function ProfileSection({ model }: { model: CodexSectionModel }): React.ReactElement {
  return (
    <TextInputSection
      description="Optional named profile from ~/.codex/config.toml to apply when launching Codex."
      label="Codex config profile"
      placeholder="e.g. work"
      title="Config Profile"
      value={model.settings.profile}
      onChange={(value) => model.updateSetting('profile', value)}
    />
  );
}

function SearchSection({ model }: { model: CodexSectionModel }): React.ReactElement {
  return (
    <ToggleSection
      checked={model.settings.search}
      description="Enable Codex web search tooling in sessions that need current information."
      label="Enable web search"
      title="Live Web Search"
      onChange={(value) => model.updateSetting('search', value)}
    />
  );
}

function ExecutionSection({ model }: { model: CodexSectionModel }): React.ReactElement {
  return (
    <>
      <SandboxModeSection model={model} />
      <ApprovalPolicySection model={model} />
      <ProfileSection model={model} />
      <SearchSection model={model} />
    </>
  );
}

function AdditionalDirectoriesSection({ model }: { model: CodexSectionModel }): React.ReactElement {
  return <section>
    <SectionLabel>Additional Directories</SectionLabel>
    <p className="text-text-semantic-muted" style={claudeSectionSectionDescriptionStyle}>Extra directories Codex can write to in addition to the primary workspace.</p>
    {model.settings.addDirs.length > 0 && <div style={claudeSectionDirectoryListStyle}>{model.settings.addDirs.map((directory, index) => <div key={`${directory}-${index}`} style={claudeSectionDirectoryRowStyle}><span className="text-text-semantic-primary" style={claudeSectionDirectoryTextStyle}>{directory}</span><button onClick={() => model.removeDir(index)} aria-label={`Remove ${directory}`} className="text-text-semantic-muted" style={claudeSectionRemoveDirectoryButtonStyle}>x</button></div>)}</div>}
    <div style={claudeSectionAddDirectoryRowStyle}>
      <input type="text" value={model.newDir} onChange={(event) => model.setNewDir(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); model.addDir(); } }} placeholder="/path/to/directory" aria-label="New Codex directory path" className="text-text-semantic-primary" style={{ ...claudeSectionTextInputStyle, flex: 1 }} />
      <button onClick={model.addDir} disabled={!model.canAddDir} style={claudeSectionAddButtonStyle(model.canAddDir)}>Add</button>
    </div>
  </section>;
}

function SkipGitRepoCheckSection({ model }: { model: CodexSectionModel }): React.ReactElement {
  return (
    <ToggleSection
      checked={model.settings.skipGitRepoCheck}
      description="Allow Codex to run even when the selected folder is not a git repository."
      label="Skip git repo check"
      title="Skip Git Repo Check"
      onChange={(value) => model.updateSetting('skipGitRepoCheck', value)}
    />
  );
}

function WorkspaceSection({ model }: { model: CodexSectionModel }): React.ReactElement {
  return <><AdditionalDirectoriesSection model={model} /><SkipGitRepoCheckSection model={model} /></>;
}

function DangerZoneSection({ model }: { model: CodexSectionModel }): React.ReactElement {
  return (
    <section style={claudeSectionDangerSectionStyle}>
      <SectionLabel className="text-status-error">Danger Zone</SectionLabel>
      <div style={claudeSectionDangerRowStyle}>
        <div style={claudeSectionDangerCopyStyle}>
          <div className="text-text-semantic-primary" style={claudeSectionDangerTitleStyle}>Bypass Approvals And Sandbox</div>
          <p className="text-status-warning" style={claudeSectionDangerTextStyle}>
            Disables all Codex approval prompts and sandboxing. Only use this when the environment is
            already externally sandboxed.
          </p>
        </div>
        <SwitchControl
          checked={model.settings.dangerouslyBypassApprovalsAndSandbox}
          danger
          label="Bypass approvals and sandbox"
          onChange={(value) => model.updateSetting('dangerouslyBypassApprovalsAndSandbox', value)}
        />
      </div>
    </section>
  );
}
