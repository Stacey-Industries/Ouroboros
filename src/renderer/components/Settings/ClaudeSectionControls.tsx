import React from 'react';

import {
  claudeSectionInlineDescriptionStyle,
  claudeSectionSectionDescriptionStyle,
  claudeSectionSelectStyle,
  claudeSectionSwitchThumbStyle,
  claudeSectionSwitchTrackStyle,
  claudeSectionTextInputStyle,
  claudeSectionToggleRowStyle,
} from './claudeSectionContentStyles';
import { SectionLabel } from './settingsStyles';

interface ToggleSectionProps {
  checked: boolean;
  description: string;
  label: string;
  title: string;
  onChange: (value: boolean) => void;
}

interface TextInputSectionProps {
  description: string;
  label: string;
  placeholder: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
}

interface SelectSectionProps {
  children: React.ReactNode;
  description: string;
  label: string;
  title: string;
  value: string;
  onChange: (value: string) => void;
}

interface SwitchControlProps {
  checked: boolean;
  label: string;
  danger?: boolean;
  onChange: (value: boolean) => void;
}

export function ToggleSection({
  checked,
  description,
  label,
  title,
  onChange,
}: ToggleSectionProps): React.ReactElement {
  return (
    <section>
      <div style={claudeSectionToggleRowStyle}>
        <div>
          <SectionLabel>{title}</SectionLabel>
          <p className="text-text-semantic-muted" style={claudeSectionInlineDescriptionStyle}>
            {description}
          </p>
        </div>
        <SwitchControl checked={checked} label={label} onChange={onChange} />
      </div>
    </section>
  );
}

export function TextInputSection({
  description,
  label,
  placeholder,
  title,
  value,
  onChange,
}: TextInputSectionProps): React.ReactElement {
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionSectionDescriptionStyle}>
        {description}
      </p>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="text-text-semantic-primary"
        style={claudeSectionTextInputStyle}
      />
    </section>
  );
}

export function SelectSection({
  children,
  description,
  label,
  title,
  value,
  onChange,
}: SelectSectionProps): React.ReactElement {
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionSectionDescriptionStyle}>
        {description}
      </p>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="text-text-semantic-primary"
        style={claudeSectionSelectStyle}
      >
        {children}
      </select>
    </section>
  );
}

export function SwitchControl({
  checked,
  danger,
  label,
  onChange,
}: SwitchControlProps): React.ReactElement {
  const activeColor = danger ? '#ef4444' : 'var(--interactive-accent)';
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={claudeSectionSwitchTrackStyle(checked, activeColor)}
    >
      <span style={claudeSectionSwitchThumbStyle(checked)} />
    </button>
  );
}
