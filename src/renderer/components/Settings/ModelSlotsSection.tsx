/**
 * ModelSlotsSection.tsx — Three dropdowns for assigning models to session types.
 *
 * Each dropdown shows all models from all enabled providers.
 */

import React from 'react';

import type { ModelSlotAssignments } from '../../types/electron';
import {
  slotDescriptionStyle,
  slotSectionStyle,
  slotSelectStyle,
} from './providersSectionStyles';
import { SectionLabel } from './settingsStyles';
import type { ProviderModelOption } from './useProvidersSection';

interface ModelSlotsSectionProps {
  slots: ModelSlotAssignments;
  allModels: ProviderModelOption[];
  onUpdateSlot: (key: keyof ModelSlotAssignments, value: string) => void;
}

interface SlotConfig {
  key: keyof ModelSlotAssignments;
  title: string;
  description: string;
}

const SLOT_CONFIGS: SlotConfig[] = [
  {
    key: 'terminal',
    title: 'Terminal Model',
    description: 'Model used for interactive Claude Code terminal sessions.',
  },
  {
    key: 'agentChat',
    title: 'Agent Chat Model',
    description: 'Model used for agent chat subagent sessions.',
  },
  {
    key: 'claudeMdGeneration',
    title: 'CLAUDE.md Generation Model',
    description: 'Model used for automated CLAUDE.md generation.',
  },
];

export function ModelSlotsSection({
  slots,
  allModels,
  onUpdateSlot,
}: ModelSlotsSectionProps): React.ReactElement<any> {
  return (
    <section>
      <SectionLabel style={{ marginTop: '8px' }}>Model Slot Assignments</SectionLabel>
      <div style={slotSectionStyle}>
        {SLOT_CONFIGS.map((config) => (
          <SlotDropdown
            key={config.key}
            config={config}
            value={slots[config.key]}
            options={allModels}
            onChange={(value) => onUpdateSlot(config.key, value)}
          />
        ))}
      </div>
    </section>
  );
}

interface SlotDropdownProps {
  config: SlotConfig;
  value: string;
  options: ProviderModelOption[];
  onChange: (value: string) => void;
}

function SlotDropdown({
  config,
  value,
  options,
  onChange,
}: SlotDropdownProps): React.ReactElement<any> {
  return (
    <div>
      <div className="text-text-semantic-primary" style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>
        {config.title}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={config.title}
        className="text-text-semantic-primary"
        style={slotSelectStyle}
      >
        <option value="">(No override — use CLI default)</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <p className="text-text-semantic-muted" style={slotDescriptionStyle}>{config.description}</p>
    </div>
  );
}
