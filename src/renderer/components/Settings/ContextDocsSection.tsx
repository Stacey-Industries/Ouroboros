/**
 * ContextDocsSection.tsx — Settings for automated CLAUDE.md generation.
 */

import React, { useCallback, useEffect, useState } from 'react';

import { useProject } from '../../contexts/ProjectContext';
import type { AppConfig } from '../../types/electron';
import type {
  ClaudeMdGenerationStatus,
  ClaudeMdModel,
  ClaudeMdSettings,
  ClaudeMdTriggerMode,
} from '../../types/electron-claude-md';
import { claudeSectionHeaderTextStyle, claudeSectionRootStyle } from './claudeSectionContentStyles';
import { SelectSection, TextInputSection, ToggleSection } from './ClaudeSectionControls';
import { GenerationActions, GenerationStatus } from './ContextDocsSectionStatus';
import { SectionLabel } from './settingsStyles';

interface ContextDocsSectionProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

const DEFAULT_SETTINGS: ClaudeMdSettings = {
  enabled: false,
  triggerMode: 'manual',
  model: 'sonnet',
  autoCommit: false,
  generateRoot: true,
  generateSubdirs: true,
  excludeDirs: [],
};

const modelHintStyle: React.CSSProperties = {
  fontSize: '11px',
  marginTop: '6px',
  fontFamily: 'var(--font-mono)',
};

type UpdateSettingFn = <K extends keyof ClaudeMdSettings>(
  field: K,
  value: ClaudeMdSettings[K],
) => void;

function ModelAndTriggerControls({
  settings,
  updateSetting,
}: {
  settings: ClaudeMdSettings;
  updateSetting: UpdateSettingFn;
}): React.ReactElement {
  return (
    <>
      <SelectSection
        description="Choose when CLAUDE.md files are regenerated."
        label="Trigger mode"
        title="Trigger Mode"
        value={settings.triggerMode}
        onChange={(value) => updateSetting('triggerMode', value as ClaudeMdTriggerMode)}
      >
        <option value="manual">Manual only</option>
        <option value="post-session">After Claude Code sessions</option>
        <option value="post-commit">After git commits</option>
      </SelectSection>
      <section>
        <SelectSection
          description="Which Claude model to use for generation."
          label="Generation model"
          title="Generation Model"
          value={settings.model}
          onChange={(value) => updateSetting('model', value as ClaudeMdModel)}
        >
          <option value="haiku">Haiku (fast, low cost)</option>
          <option value="sonnet">Sonnet (balanced)</option>
          <option value="opus">Opus (most thorough)</option>
        </SelectSection>
        <p className="text-text-semantic-muted" style={modelHintStyle}>
          Haiku: ~2s per file, minimal cost. Sonnet: ~5s, good detail. Opus: ~15s, maximum fidelity.
        </p>
      </section>
    </>
  );
}

function ExcludeDirsInput({
  settings,
  updateSetting,
}: {
  settings: ClaudeMdSettings;
  updateSetting: UpdateSettingFn;
}): React.ReactElement {
  return (
    <TextInputSection
      description="Comma-separated directory names or glob patterns to skip during generation."
      label="Exclude directories"
      placeholder="e.g. node_modules, dist, .git, vendor"
      title="Exclude Directories"
      value={settings.excludeDirs.join(', ')}
      onChange={(value) => {
        const dirs = value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        updateSetting('excludeDirs', dirs);
      }}
    />
  );
}

function FileControls({
  settings,
  updateSetting,
}: {
  settings: ClaudeMdSettings;
  updateSetting: UpdateSettingFn;
}): React.ReactElement {
  return (
    <>
      <ToggleSection
        checked={settings.autoCommit}
        description="Automatically create a git commit when CLAUDE.md files are generated or updated."
        label="Auto-commit generated files"
        title="Auto-commit"
        onChange={(value) => updateSetting('autoCommit', value)}
      />
      <ToggleSection
        checked={settings.generateRoot}
        description="Include the root-level CLAUDE.md in automatic generation."
        label="Generate root CLAUDE.md"
        title="Generate Root CLAUDE.md"
        onChange={(value) => updateSetting('generateRoot', value)}
      />
      <ToggleSection
        checked={settings.generateSubdirs}
        description="Generate CLAUDE.md files in subdirectories (e.g. src/main/, src/renderer/components/)."
        label="Generate subdirectory files"
        title="Generate Subdirectory Files"
        onChange={(value) => updateSetting('generateSubdirs', value)}
      />
      <ExcludeDirsInput settings={settings} updateSetting={updateSetting} />
    </>
  );
}

function ClaudeMdSettingsControls({
  settings,
  generating,
  hasRoot,
  lastRun,
  onGenerate,
  updateSetting,
}: {
  settings: ClaudeMdSettings;
  generating: boolean;
  hasRoot: boolean;
  lastRun: ClaudeMdGenerationStatus['lastRun'] | undefined;
  onGenerate: (fullSweep: boolean) => void;
  updateSetting: UpdateSettingFn;
}): React.ReactElement {
  return (
    <>
      <ModelAndTriggerControls settings={settings} updateSetting={updateSetting} />
      <FileControls settings={settings} updateSetting={updateSetting} />
      <GenerationActions
        generating={generating}
        hasRoot={hasRoot}
        lastRun={lastRun}
        onGenerate={onGenerate}
      />
    </>
  );
}

function useGenerationState(defaultProjectRoot: string | undefined): {
  generating: boolean;
  status: ClaudeMdGenerationStatus | null;
  handleGenerate: (fullSweep?: boolean) => Promise<void>;
} {
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<ClaudeMdGenerationStatus | null>(null);
  const handleGenerate = useCallback(
    async (fullSweep = false) => {
      setGenerating(true);
      try {
        const root = defaultProjectRoot;
        if (!root) return;
        await window.electronAPI.claudeMd.generate(
          root,
          fullSweep ? { fullSweep: true } : undefined,
        );
      } catch (err) {
        console.error('[context-docs] Generation failed:', err);
      } finally {
        setGenerating(false);
      }
    },
    [defaultProjectRoot],
  );
  useEffect(() => {
    window.electronAPI.claudeMd.getStatus().then((result) => {
      if (result.success && result.status) setStatus(result.status);
    });
    return window.electronAPI.claudeMd.onStatusChange(setStatus);
  }, []);
  return { generating, status, handleGenerate };
}

function ContextDocsSectionHeader(): React.ReactElement {
  return (
    <div>
      <SectionLabel>CLAUDE.md Automation</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionHeaderTextStyle}>
        Automatically generate and maintain CLAUDE.md context files so Claude Code agents always
        have accurate, up-to-date project knowledge.
      </p>
    </div>
  );
}

export function ContextDocsSection({
  draft,
  onChange,
}: ContextDocsSectionProps): React.ReactElement {
  const settings: ClaudeMdSettings = draft.claudeMdSettings ?? DEFAULT_SETTINGS;
  const updateSetting = useCallback(
    <K extends keyof ClaudeMdSettings>(field: K, value: ClaudeMdSettings[K]) => {
      const current = draft.claudeMdSettings ?? DEFAULT_SETTINGS;
      onChange('claudeMdSettings', { ...current, [field]: value });
    },
    [draft.claudeMdSettings, onChange],
  );
  const { projectRoot } = useProject();
  const { generating, status, handleGenerate } = useGenerationState(projectRoot ?? undefined);
  const lastRun = status?.lastRun;
  return (
    <div style={claudeSectionRootStyle}>
      <ContextDocsSectionHeader />
      <ToggleSection
        checked={settings.enabled}
        description="When enabled, CLAUDE.md files are generated and kept in sync based on your trigger mode."
        label="Enable CLAUDE.md automation"
        title="Enable CLAUDE.md Automation"
        onChange={(value) => updateSetting('enabled', value)}
      />
      {settings.enabled && (
        <ClaudeMdSettingsControls
          settings={settings}
          generating={generating}
          hasRoot={Boolean(projectRoot)}
          lastRun={lastRun}
          onGenerate={handleGenerate}
          updateSetting={updateSetting}
        />
      )}
      {settings.enabled && <GenerationStatus status={status} lastRun={lastRun} />}
    </div>
  );
}
