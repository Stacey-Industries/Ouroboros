import React from 'react';

import type { AppConfig } from '../../types/electron';
import {
  claudeSectionDangerCopyStyle,
  claudeSectionDangerRowStyle,
  claudeSectionDangerSectionStyle,
  claudeSectionDangerTextStyle,
  claudeSectionDangerTitleStyle,
  claudeSectionHeaderTextStyle,
  claudeSectionModelHelpStyle,
  claudeSectionRootStyle,
} from './claudeSectionContentStyles';
import {
  SelectSection,
  SwitchControl,
  TextInputSection,
  ToggleSection,
} from './ClaudeSectionControls';
import { WorkspaceSection } from './CodexSectionDirectories';
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

type CodexEcosystemConfig = NonNullable<AppConfig['ecosystem']> & {
  codexAppServerTransport?: boolean;
};

export function CodexSection({ draft, onChange }: CodexSectionProps): React.ReactElement {
  const model = useCodexSectionModel(draft, onChange);

  return (
    <div style={claudeSectionRootStyle}>
      <HeaderSection />
      <ModelSection model={model} />
      <ExecutionSection draft={draft} model={model} onChange={onChange} />
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
      onChange={(value) =>
        model.updateSetting('sandbox', value as AppConfig['codexCliSettings']['sandbox'])
      }
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
      onChange={(value) =>
        model.updateSetting(
          'approvalPolicy',
          value as AppConfig['codexCliSettings']['approvalPolicy'],
        )
      }
    >
      {CODEX_APPROVAL_POLICIES.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectSection>
  );
}

function getCodexTransportConfig(draft: AppConfig): CodexEcosystemConfig | undefined {
  return draft.ecosystem as CodexEcosystemConfig | undefined;
}

function CodexTransportSection({
  draft,
  onChange,
}: Pick<CodexSectionProps, 'draft' | 'onChange'>): React.ReactElement {
  const ecosystem = getCodexTransportConfig(draft);
  const transportEnabled = ecosystem?.codexAppServerTransport === true;

  function updateTransport(value: boolean): void {
    onChange('ecosystem', {
      ...draft.ecosystem,
      codexAppServerTransport: value,
    } as AppConfig['ecosystem']);
  }

  return (
    <>
      <ToggleSection
        checked={transportEnabled}
        description="Use the Codex app-server transport for agent chat. Interactive approval modes require this transport."
        label="Use app-server transport"
        title="Chat Transport"
        onChange={updateTransport}
      />
      <p className="text-text-semantic-muted" style={claudeSectionModelHelpStyle}>
        {transportEnabled
          ? 'Codex app-server transport is enabled. Chat can use Accept Edits and Plan approval modes.'
          : 'Codex chat stays on the legacy exec transport until app-server transport is enabled. Interactive approval modes stay hidden while exec is active.'}
      </p>
    </>
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

function ExecutionSection({
  draft,
  model,
  onChange,
}: {
  draft: AppConfig;
  model: CodexSectionModel;
  onChange: CodexSectionProps['onChange'];
}): React.ReactElement {
  return (
    <>
      <SandboxModeSection model={model} />
      <ApprovalPolicySection model={model} />
      <CodexTransportSection draft={draft} onChange={onChange} />
      <ProfileSection model={model} />
      <SearchSection model={model} />
    </>
  );
}

function DangerZoneSection({ model }: { model: CodexSectionModel }): React.ReactElement {
  return (
    <section style={claudeSectionDangerSectionStyle}>
      <SectionLabel className="text-status-error">Danger Zone</SectionLabel>
      <div style={claudeSectionDangerRowStyle}>
        <div style={claudeSectionDangerCopyStyle}>
          <div className="text-text-semantic-primary" style={claudeSectionDangerTitleStyle}>
            Bypass Approvals And Sandbox
          </div>
          <p className="text-status-warning" style={claudeSectionDangerTextStyle}>
            Disables all Codex approval prompts and sandboxing. Only use this when the environment
            is already externally sandboxed.
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
