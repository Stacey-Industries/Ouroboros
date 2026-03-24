/**
 * ProviderApiKeysSection.tsx — Optional direct API key credentials for Anthropic and OpenAI.
 *
 * Self-managed section (no draft props). Renders one ApiKeyCard per provider.
 * Styling mirrors AccountsSectionProviderCard using AccountsSectionStyles.
 */

import React from 'react';

import type { AuthState } from '../../types/electron';
import * as S from './AccountsSectionStyles';
import { buttonStyle, SectionLabel, smallButtonStyle } from './settingsStyles';
import type { ProviderApiKeysModel } from './useProviderApiKeysModel';
import { useProviderApiKeysModel } from './useProviderApiKeysModel';

type ApiKeyProvider = 'anthropic' | 'openai';

const PROVIDER_META: Record<ApiKeyProvider, { label: string; placeholder: string }> = {
  anthropic: { label: 'Anthropic', placeholder: 'sk-ant-...' },
  openai: { label: 'OpenAI', placeholder: 'sk-...' },
};

export function ProviderApiKeysSection(): React.ReactElement {
  const model = useProviderApiKeysModel();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <SectionLabel>API Keys</SectionLabel>
        <p className="text-text-semantic-muted" style={{ fontSize: '12px', margin: 0 }}>
          Optional direct API access credentials for Anthropic and OpenAI.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <ApiKeyCard provider="anthropic" model={model} />
        <ApiKeyCard provider="openai" model={model} />
      </div>
    </div>
  );
}

function ApiKeyCard({
  provider,
  model,
}: {
  provider: ApiKeyProvider;
  model: ProviderApiKeysModel;
}): React.ReactElement {
  const state = model.getProviderState(provider);
  const isExpanded = model.expandedKey === provider;

  return (
    <div style={S.cardStyle}>
      <ApiKeyCardHeader provider={provider} state={state} isExpanded={isExpanded} model={model} />
      {isExpanded && <ApiKeyInputForm provider={provider} model={model} />}
    </div>
  );
}

function ApiKeyCardHeader({
  provider,
  state,
  isExpanded,
  model,
}: {
  provider: ApiKeyProvider;
  state: AuthState | undefined;
  isExpanded: boolean;
  model: ProviderApiKeysModel;
}): React.ReactElement {
  const isConnected = state?.status === 'authenticated';
  const meta = PROVIDER_META[provider];

  return (
    <div style={S.cardHeaderStyle}>
      <div>
        <div className="text-text-semantic-primary" style={{ fontSize: '14px', fontWeight: 600 }}>
          {meta.label}
        </div>
        <ApiKeyStatusIndicator state={state} />
      </div>
      <ApiKeyCardActions
        provider={provider}
        isConnected={isConnected}
        isExpanded={isExpanded}
        model={model}
      />
    </div>
  );
}

function ApiKeyStatusIndicator({ state }: { state: AuthState | undefined }): React.ReactElement {
  const isConnected = state?.status === 'authenticated';
  const isApiKey = state?.credentialType === 'apikey';
  const dotColor = isConnected ? 'var(--status-success)' : 'var(--text-semantic-muted)';

  return (
    <div style={S.statusTextStyle}>
      <span style={S.statusDotStyle(dotColor)} />
      <span className="text-text-semantic-muted">
        {isConnected ? (isApiKey ? 'API key set' : 'Connected') : 'Not configured'}
      </span>
    </div>
  );
}

function ConnectedActions({
  provider,
  model,
}: {
  provider: ApiKeyProvider;
  model: ProviderApiKeysModel;
}): React.ReactElement {
  return (
    <div style={S.buttonRowStyle}>
      <button
        className="text-text-semantic-primary"
        style={smallButtonStyle}
        onClick={() => model.expandKey(provider)}
      >
        Edit
      </button>
      <button
        className="text-text-semantic-primary"
        style={smallButtonStyle}
        onClick={() => void model.removeKey(provider)}
      >
        Remove
      </button>
    </div>
  );
}

function ApiKeyCardActions({
  provider,
  isConnected,
  isExpanded,
  model,
}: {
  provider: ApiKeyProvider;
  isConnected: boolean;
  isExpanded: boolean;
  model: ProviderApiKeysModel;
}): React.ReactElement {
  if (isConnected) return <ConnectedActions provider={provider} model={model} />;
  if (isExpanded) return <React.Fragment />;

  return (
    <button
      className="text-text-semantic-primary"
      style={buttonStyle}
      onClick={() => model.expandKey(provider)}
    >
      Enter API Key
    </button>
  );
}

function FormButtons({
  provider,
  model,
}: {
  provider: ApiKeyProvider;
  model: ProviderApiKeysModel;
}): React.ReactElement {
  return (
    <div style={S.buttonRowStyle}>
      <button
        className="text-text-semantic-on-accent"
        style={{
          ...buttonStyle,
          background: 'var(--interactive-accent)',
          border: 'none',
          fontWeight: 600,
        }}
        onClick={() => void model.submitKey(provider)}
      >
        Save
      </button>
      <button
        className="text-text-semantic-muted"
        style={smallButtonStyle}
        onClick={model.collapseKey}
      >
        Cancel
      </button>
    </div>
  );
}

function ApiKeyInputForm({
  provider,
  model,
}: {
  provider: ApiKeyProvider;
  model: ProviderApiKeysModel;
}): React.ReactElement {
  const meta = PROVIDER_META[provider];

  return (
    <div style={S.actionAreaStyle}>
      <div style={S.inputRowStyle}>
        <input
          type="password"
          className="text-text-semantic-primary"
          style={S.inputStyle}
          placeholder={meta.placeholder}
          value={model.apiKeyInput}
          onChange={(e) => model.setApiKeyInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void model.submitKey(provider);
          }}
          autoFocus
        />
      </div>
      {model.apiKeyError && (
        <div className="text-status-error" style={S.errorTextStyle}>
          {model.apiKeyError}
        </div>
      )}
      <FormButtons provider={provider} model={model} />
    </div>
  );
}
