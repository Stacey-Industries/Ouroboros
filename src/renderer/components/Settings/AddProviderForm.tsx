/**
 * AddProviderForm.tsx — Form for adding a new LLM provider.
 *
 * Supports MiniMax preset or custom provider with manual fields.
 */

import React, { useState } from 'react';

import type { ModelProvider } from '../../types/electron';
import {
  formActionButtonStyle,
  formButtonRowStyle,
  formContainerStyle,
  formInputStyle,
  formLabelStyle,
  formSelectStyle,
} from './providersSectionStyles';
import { smallButtonStyle } from './settingsStyles';

interface AddProviderFormProps {
  onAdd: (provider: ModelProvider) => void;
}

interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  models: Array<{ id: string; name: string; provider: string }>;
}

const MINIMAX_PRESET: ProviderPreset = {
  id: 'minimax',
  name: 'MiniMax',
  baseUrl: 'https://api.minimax.io/anthropic',
  models: [
    { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', provider: 'minimax' },
    { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', provider: 'minimax' },
  ],
};

export function AddProviderForm({ onAdd }: AddProviderFormProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button style={smallButtonStyle} onClick={() => setIsOpen(true)}>
        + Add Provider
      </button>
    );
  }

  return <ProviderFormFields onAdd={onAdd} onCancel={() => setIsOpen(false)} />;
}

interface ProviderFormFieldsProps {
  onAdd: (provider: ModelProvider) => void;
  onCancel: () => void;
}

function ProviderFormFields({ onAdd, onCancel }: ProviderFormFieldsProps): React.ReactElement {
  const [preset, setPreset] = useState('custom');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  const handlePresetChange = (value: string): void => {
    setPreset(value);
    if (value === 'minimax') {
      setName(MINIMAX_PRESET.name);
      setBaseUrl(MINIMAX_PRESET.baseUrl);
    } else {
      setName('');
      setBaseUrl('');
    }
  };

  const handleSave = (): void => {
    const isMinimax = preset === 'minimax';
    const providerId = isMinimax ? MINIMAX_PRESET.id : name.toLowerCase().replace(/\s+/g, '-');
    const models = isMinimax ? MINIMAX_PRESET.models : [];
    onAdd({ id: providerId, name, baseUrl, apiKey, models, enabled: true });
    onCancel();
  };

  const canSave = name.trim().length > 0 && baseUrl.trim().length > 0;

  return (
    <div style={formContainerStyle}>
      <PresetSelector value={preset} onChange={handlePresetChange} />
      <FormField label="Name" value={name} onChange={setName} placeholder="e.g. MiniMax" />
      <FormField label="Base URL" value={baseUrl} onChange={setBaseUrl} placeholder="https://api.example.com/v1" />
      <PasswordField label="API Key" value={apiKey} onChange={setApiKey} placeholder="sk-..." />
      <div style={formButtonRowStyle}>
        <button style={formActionButtonStyle(canSave)} onClick={handleSave} disabled={!canSave}>Save</button>
        <button style={formActionButtonStyle(false)} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PresetSelector({ value, onChange }: { value: string; onChange: (v: string) => void }): React.ReactElement {
  return (
    <div>
      <div className="text-text-semantic-muted" style={formLabelStyle}>Preset</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="text-text-semantic-primary" style={formSelectStyle}>
        <option value="custom">Custom</option>
        <option value="minimax">MiniMax</option>
      </select>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}

function FormField({ label, value, onChange, placeholder }: FormFieldProps): React.ReactElement {
  return (
    <div>
      <div className="text-text-semantic-muted" style={formLabelStyle}>{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-text-semantic-primary"
        style={formInputStyle}
      />
    </div>
  );
}

function PasswordField({ label, value, onChange, placeholder }: FormFieldProps): React.ReactElement {
  return (
    <div>
      <div className="text-text-semantic-muted" style={formLabelStyle}>{label}</div>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-text-semantic-primary"
        style={formInputStyle}
      />
    </div>
  );
}
