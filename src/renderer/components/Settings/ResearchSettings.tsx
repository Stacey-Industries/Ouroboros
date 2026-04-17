/**
 * ResearchSettings.tsx — Settings section for research auto-firing controls.
 *
 * Wave 30 Phase G. Global toggle + default mode selector.
 * Mounted in the 'agent' settings tab (AI Agents group).
 */

import React from 'react';

import type { AppConfig } from '../../types/electron';
import type { ResearchMode } from '../../types/electron-research';
import {
  claudeSectionHeaderTextStyle,
  claudeSectionRootStyle,
  claudeSectionSectionDescriptionStyle,
} from './claudeSectionContentStyles';
import { ToggleSection } from './ClaudeSectionControls';
import { ResearchSettingsAdvanced } from './ResearchSettingsAdvanced';
import { SectionLabel } from './settingsStyles';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResearchSettingsRecord = NonNullable<AppConfig['researchSettings']>;

interface ResearchSettingsProps {
  draft: AppConfig;
  onChange: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
}

// ─── Mode radio option ────────────────────────────────────────────────────────

interface ModeOptionProps {
  value: ResearchMode;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}

function ModeOption({ value, label, description, checked, disabled, onSelect }: ModeOptionProps): React.ReactElement {
  return (
    <label
      htmlFor={`research-mode-${value}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '8px 0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <input
        id={`research-mode-${value}`}
        type="radio"
        name="research-default-mode"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        style={{ marginTop: '2px', flexShrink: 0 }}
      />
      <div>
        <div className="text-text-semantic-primary" style={{ fontSize: '13px', fontWeight: 500 }}>
          {label}
        </div>
        <div className="text-text-semantic-muted" style={{ fontSize: '12px', marginTop: '1px' }}>
          {description}
        </div>
      </div>
    </label>
  );
}

// ─── ResearchDefaultModeGroup ─────────────────────────────────────────────────

const MODE_OPTIONS: Array<{ value: ResearchMode; label: string; description: string }> = [
  {
    value: 'off',
    label: 'Off',
    description: 'No automatic research. Research can still be triggered manually via /research.',
  },
  {
    value: 'conservative',
    label: 'Conservative',
    description: 'Research only when the pre-tool evaluator is highly confident it will improve the response.',
  },
  {
    value: 'aggressive',
    label: 'Aggressive',
    description: 'Research proactively before most tool calls. Per-session Aggressive mode can override this even if global is disabled.',
  },
];

interface ModeGroupProps {
  currentMode: ResearchMode;
  disabled: boolean;
  onSelect: (m: ResearchMode) => void;
}

function ResearchDefaultModeGroup({ currentMode, disabled, onSelect }: ModeGroupProps): React.ReactElement {
  return (
    <section style={{ marginTop: '12px' }}>
      <SectionLabel>Default mode for new sessions</SectionLabel>
      <div role="radiogroup" aria-label="Default research mode">
        {MODE_OPTIONS.map((opt) => (
          <ModeOption
            key={opt.value}
            value={opt.value}
            label={opt.label}
            description={opt.description}
            checked={currentMode === opt.value}
            disabled={disabled}
            onSelect={() => onSelect(opt.value)}
          />
        ))}
      </div>
    </section>
  );
}

// ─── ResearchSettings ─────────────────────────────────────────────────────────

function getResearch(draft: AppConfig): ResearchSettingsRecord {
  return draft.researchSettings ?? { globalEnabled: false, defaultMode: 'conservative' };
}

export function ResearchSettings({ draft, onChange }: ResearchSettingsProps): React.ReactElement {
  const settings = getResearch(draft);
  const globalEnabled = settings.globalEnabled ?? false;
  const defaultMode: ResearchMode = settings.defaultMode ?? 'conservative';

  function updateSettings(patch: Partial<ResearchSettingsRecord>): void {
    onChange('researchSettings', { ...settings, ...patch });
  }

  return (
    <div style={claudeSectionRootStyle}>
      <div>
        <SectionLabel>Research auto-firing</SectionLabel>
        <p className="text-text-semantic-muted" style={claudeSectionHeaderTextStyle}>
          Automatically run research subagents before tool calls when relevant context is detected.
        </p>
      </div>

      <ToggleSection
        checked={globalEnabled}
        description="When enabled, the IDE will proactively research libraries and APIs before responding. Mode controls aggressiveness."
        label="Enable automatic research"
        title="Enable automatic research"
        onChange={(v) => updateSettings({ globalEnabled: v })}
      />

      <ResearchDefaultModeGroup
        currentMode={defaultMode}
        disabled={!globalEnabled}
        onSelect={(m) => updateSettings({ defaultMode: m })}
      />

      {!globalEnabled && (
        <p className="text-text-semantic-muted" style={claudeSectionSectionDescriptionStyle}>
          Note: per-session Aggressive mode (Ctrl+Alt+R in chat) can enable research for a single session even when the global toggle is off.
        </p>
      )}

      <ResearchSettingsAdvanced
        settings={settings}
        onUpdate={(patch) => updateSettings(patch)}
      />
    </div>
  );
}
