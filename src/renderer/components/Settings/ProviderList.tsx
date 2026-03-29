/**
 * ProviderList.tsx — Renders the list of configured model providers.
 *
 * The built-in Anthropic provider is always first and cannot be deleted.
 * User providers show name, truncated URL, toggle, and delete.
 */

import React from 'react';

import type { ModelProvider } from '../../types/electron';
import { SwitchControl } from './ClaudeSectionControls';
import {
  deleteButtonStyle,
  providerBuiltInStyle,
  providerListStyle,
  providerNameStyle,
  providerRowStyle,
  providerUrlStyle,
} from './providersSectionStyles';
import { BUILTIN_ANTHROPIC } from './useProvidersSection';

interface ProviderListProps {
  providers: ModelProvider[];
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
}

export function ProviderList({
  providers,
  onToggle,
  onRemove,
}: ProviderListProps): React.ReactElement<any> {
  return (
    <div style={providerListStyle}>
      <AnthropicRow />
      {providers.map((provider) => (
        <UserProviderRow
          key={provider.id}
          provider={provider}
          onToggle={onToggle}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function AnthropicRow(): React.ReactElement<any> {
  return (
    <div style={providerRowStyle}>
      <span className="text-text-semantic-primary" style={providerNameStyle}>{BUILTIN_ANTHROPIC.name}</span>
      <span className="text-text-semantic-muted" style={providerBuiltInStyle}>
        (Built-in — uses CLI auth)
      </span>
      <span className="text-interactive-accent" style={{ fontSize: '11px' }}>
        Always enabled
      </span>
    </div>
  );
}

interface UserProviderRowProps {
  provider: ModelProvider;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
}

function UserProviderRow({
  provider,
  onToggle,
  onRemove,
}: UserProviderRowProps): React.ReactElement<any> {
  return (
    <div style={providerRowStyle}>
      <span className="text-text-semantic-primary" style={providerNameStyle}>{provider.name}</span>
      <span className="text-text-semantic-muted" style={providerUrlStyle}>{provider.baseUrl}</span>
      <SwitchControl
        checked={provider.enabled}
        label={`Toggle ${provider.name}`}
        onChange={(enabled) => onToggle(provider.id, enabled)}
      />
      <button
        onClick={() => onRemove(provider.id)}
        aria-label={`Remove ${provider.name}`}
        className="text-text-semantic-muted"
        style={deleteButtonStyle}
      >
        x
      </button>
    </div>
  );
}
