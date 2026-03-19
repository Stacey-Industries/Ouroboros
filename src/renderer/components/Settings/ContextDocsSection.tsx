/**
 * ContextDocsSection.tsx — Settings for automated CLAUDE.md generation.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { AppConfig } from '../../types/electron';
import type {
  ClaudeMdGenerationStatus,
  ClaudeMdModel,
  ClaudeMdSettings,
  ClaudeMdTriggerMode,
} from '../../types/electron-claude-md';
import {
  claudeSectionHeaderTextStyle,
  claudeSectionRootStyle,
  claudeSectionSectionDescriptionStyle,
} from './claudeSectionContentStyles';
import { SelectSection, TextInputSection,ToggleSection } from './ClaudeSectionControls';
import { buttonStyle,SectionLabel } from './settingsStyles';

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

const primaryButtonStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: '6px',
  border: 'none',
  background: 'var(--accent)',
  color: '#fff',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'opacity 0.15s ease',
};

const disabledButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  transition: 'opacity 0.15s ease',
};

const statusBoxStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  fontSize: '12px',
  color: 'var(--text)',
};

const resultRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 0',
  fontSize: '12px',
  color: 'var(--text-secondary, var(--text))',
};

const resultLabelStyle: React.CSSProperties = {
  fontWeight: 500,
  color: 'var(--text)',
};

const progressBarContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '4px',
  borderRadius: '2px',
  background: 'var(--border)',
  overflow: 'hidden',
  marginTop: '8px',
};

function progressBarFillStyle(percent: number): React.CSSProperties {
  return {
    width: `${percent}%`,
    height: '100%',
    borderRadius: '2px',
    background: 'var(--accent)',
    transition: 'width 0.3s ease',
  };
}

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
};

const modelHintStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  marginTop: '6px',
  fontFamily: 'var(--font-mono)',
};

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ContextDocsSection({
  draft,
  onChange,
}: ContextDocsSectionProps): React.ReactElement {
  const settings: ClaudeMdSettings = draft.claudeMdSettings ?? DEFAULT_SETTINGS;

  const updateSetting = useCallback(<K extends keyof ClaudeMdSettings>(
    field: K,
    value: ClaudeMdSettings[K],
  ) => {
    const current = draft.claudeMdSettings ?? DEFAULT_SETTINGS;
    onChange('claudeMdSettings', { ...current, [field]: value });
  }, [draft.claudeMdSettings, onChange]);

  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<ClaudeMdGenerationStatus | null>(null);

  const handleGenerate = useCallback(async (fullSweep = false) => {
    setGenerating(true);
    try {
      const root = draft.defaultProjectRoot;
      if (!root) return;
      await window.electronAPI.claudeMd.generate(root, fullSweep ? { fullSweep: true } : undefined);
    } catch (err) {
      console.error('[context-docs] Generation failed:', err);
    } finally {
      setGenerating(false);
    }
  }, [draft.defaultProjectRoot]);

  useEffect(() => {
    window.electronAPI.claudeMd.getStatus().then((result) => {
      if (result.success && result.status) setStatus(result.status);
    });

    const cleanup = window.electronAPI.claudeMd.onStatusChange(setStatus);
    return cleanup;
  }, []);

  const lastRun = status?.lastRun;
  const resultCounts = lastRun?.results
    ? {
        created: lastRun.results.filter((r) => r.status === 'created').length,
        updated: lastRun.results.filter((r) => r.status === 'updated').length,
        skipped: lastRun.results.filter((r) => r.status === 'skipped').length,
        errors: lastRun.results.filter((r) => r.status === 'error').length,
      }
    : null;

  return (
    <div style={claudeSectionRootStyle}>
      {/* Header */}
      <div>
        <SectionLabel>CLAUDE.md Automation</SectionLabel>
        <p style={claudeSectionHeaderTextStyle}>
          Automatically generate and maintain CLAUDE.md context files so Claude Code agents
          always have accurate, up-to-date project knowledge.
        </p>
      </div>

      {/* Enable toggle */}
      <ToggleSection
        checked={settings.enabled}
        description="When enabled, CLAUDE.md files are generated and kept in sync based on your trigger mode."
        label="Enable CLAUDE.md automation"
        title="Enable CLAUDE.md Automation"
        onChange={(value) => updateSetting('enabled', value)}
      />

      {/* Configuration — only when enabled */}
      {settings.enabled && (
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
            <p style={modelHintStyle}>
              Haiku: ~2s per file, minimal cost. Sonnet: ~5s, good detail. Opus: ~15s, maximum fidelity.
            </p>
          </section>

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

          {/* Actions */}
          <section>
            <SectionLabel>Actions</SectionLabel>
            <p style={claudeSectionSectionDescriptionStyle}>
              Manually trigger CLAUDE.md generation for the current project.
            </p>
            <div style={actionRowStyle}>
              <button
                onClick={() => handleGenerate(false)}
                disabled={generating || !draft.defaultProjectRoot}
                style={generating || !draft.defaultProjectRoot ? disabledButtonStyle : primaryButtonStyle}
                onMouseOver={(e) => { if (!generating && draft.defaultProjectRoot) e.currentTarget.style.opacity = '0.85'; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                {generating && !status?.lastRun ? 'Generating...' : 'Generate Now'}
              </button>
              <button
                onClick={() => handleGenerate(true)}
                disabled={generating || !draft.defaultProjectRoot}
                style={generating || !draft.defaultProjectRoot
                  ? { ...secondaryButtonStyle, opacity: 0.5, cursor: 'not-allowed' }
                  : secondaryButtonStyle}
                onMouseOver={(e) => { if (!generating && draft.defaultProjectRoot) e.currentTarget.style.opacity = '0.8'; }}
                onMouseOut={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                Full Sweep
              </button>
              {!draft.defaultProjectRoot && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Open a project first
                </span>
              )}
            </div>
          </section>
        </>
      )}

      {/* Status display — shown when enabled */}
      {settings.enabled && (
        <section>
          <SectionLabel>Status</SectionLabel>
          <div style={statusBoxStyle}>
            {/* Progress indicator when running */}
            {status?.running ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 500 }}>Generating...</span>
                  {status.progress && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {status.progress.completed} / {status.progress.total}
                    </span>
                  )}
                </div>
                {status.currentDir && (
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 6px 0', fontFamily: 'var(--font-mono)' }}>
                    {status.currentDir}
                  </p>
                )}
                {status.progress && (
                  <div style={progressBarContainerStyle}>
                    <div style={progressBarFillStyle(
                      status.progress.total > 0
                        ? (status.progress.completed / status.progress.total) * 100
                        : 0
                    )} />
                  </div>
                )}
              </div>
            ) : lastRun ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 500 }}>Last Run</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {formatTimestamp(lastRun.timestamp)}
                  </span>
                </div>
                {resultCounts && (
                  <div>
                    <div style={resultRowStyle}>
                      <span style={resultLabelStyle}>Created</span>
                      <span>{resultCounts.created}</span>
                    </div>
                    <div style={resultRowStyle}>
                      <span style={resultLabelStyle}>Updated</span>
                      <span>{resultCounts.updated}</span>
                    </div>
                    <div style={resultRowStyle}>
                      <span style={resultLabelStyle}>Skipped</span>
                      <span style={{ color: 'var(--text-muted)' }}>{resultCounts.skipped}</span>
                    </div>
                    {resultCounts.errors > 0 && (
                      <div style={resultRowStyle}>
                        <span style={{ ...resultLabelStyle, color: 'var(--error, #e55)' }}>Errors</span>
                        <span style={{ color: 'var(--error, #e55)' }}>{resultCounts.errors}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No generation runs yet. Click &ldquo;Generate Now&rdquo; to start.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
