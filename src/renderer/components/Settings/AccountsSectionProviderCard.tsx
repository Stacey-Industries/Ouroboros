/**
 * AccountsSectionProviderCard.tsx — Individual provider card for the Accounts section.
 *
 * Renders provider identity, connection status, and action buttons.
 * Login forms (GitHub Device Flow, API key input) are in AccountsSectionLoginForms.
 */

import React from 'react';

import type { AuthProvider, AuthState } from '../../types/electron';
import { ExpandedArea } from './AccountsSectionLoginForms';
import * as S from './AccountsSectionStyles';
import { buttonStyle, smallButtonStyle } from './settingsStyles';
import type { AccountsSectionModel } from './useAccountsSection';

interface ProviderCardProps {
  provider: AuthProvider;
  model: AccountsSectionModel;
}

const PROVIDER_META: Record<AuthProvider, { label: string; icon: string }> = {
  github: { label: 'GitHub', icon: 'GH' },
  anthropic: { label: 'Claude (Anthropic)', icon: 'AN' },
  openai: { label: 'OpenAI', icon: 'OA' },
};

export function ProviderCard({ provider, model }: ProviderCardProps): React.ReactElement {
  const state = model.getProviderState(provider);
  const isExpanded = model.expandedCard === provider;
  const meta = PROVIDER_META[provider];

  return (
    <div style={S.cardStyle}>
      <CardHeader
        meta={meta}
        state={state}
        provider={provider}
        isExpanded={isExpanded}
        model={model}
      />
      {isExpanded && <ExpandedArea provider={provider} model={model} />}
    </div>
  );
}

interface CardHeaderProps {
  meta: { label: string; icon: string };
  state: AuthState | undefined;
  provider: AuthProvider;
  isExpanded: boolean;
  model: AccountsSectionModel;
}

function CardHeader({
  meta,
  state,
  provider,
  isExpanded,
  model,
}: CardHeaderProps): React.ReactElement {
  const isConnected = state?.status === 'authenticated';
  const isExpired = state?.status === 'expired';

  return (
    <div style={S.cardHeaderStyle}>
      <div>
        <ProviderLabel meta={meta} />
        <StatusIndicator state={state} />
        {isConnected && state?.user?.name && (
          <div className="text-text-semantic-muted" style={S.userInfoStyle}>
            {state.user.name}
            {state.user.email ? ` (${state.user.email})` : ''}
          </div>
        )}
      </div>
      <HeaderActions
        provider={provider}
        isConnected={isConnected}
        isExpired={isExpired}
        isExpanded={isExpanded}
        model={model}
      />
    </div>
  );
}

function ProviderLabel({ meta }: { meta: { label: string; icon: string } }): React.ReactElement {
  return (
    <div className="text-text-semantic-primary" style={S.providerNameStyle}>
      <span style={{ marginRight: '8px', opacity: 0.6 }}>{meta.icon}</span>
      {meta.label}
    </div>
  );
}

function StatusIndicator({ state }: { state: AuthState | undefined }): React.ReactElement {
  const status = state?.status ?? 'unauthenticated';
  const { color, label } = getStatusDisplay(status);

  return (
    <div style={S.statusTextStyle}>
      <span style={S.statusDotStyle(color)} />
      <span className="text-text-semantic-muted">{label}</span>
    </div>
  );
}

function getStatusDisplay(status: string): { color: string; label: string } {
  switch (status) {
    case 'authenticated':
      return { color: 'var(--status-success)', label: 'Connected' };
    case 'expired':
      return { color: 'var(--status-warning)', label: 'Expired' };
    case 'refreshing':
      return { color: 'var(--status-warning)', label: 'Refreshing...' };
    default:
      return { color: 'var(--text-semantic-muted)', label: 'Not connected' };
  }
}

interface HeaderActionsProps {
  provider: AuthProvider;
  isConnected: boolean;
  isExpired: boolean;
  isExpanded: boolean;
  model: AccountsSectionModel;
}

function HeaderActions({
  provider,
  isConnected,
  isExpired,
  isExpanded,
  model,
}: HeaderActionsProps): React.ReactElement {
  if (isConnected || isExpired) {
    return (
      <button
        className="text-text-semantic-primary"
        style={smallButtonStyle}
        onClick={() => void model.logout(provider)}
      >
        Disconnect
      </button>
    );
  }

  if (isExpanded) return <React.Fragment />;

  return (
    <button
      className="text-text-semantic-on-accent"
      style={{
        ...buttonStyle,
        background: 'var(--interactive-accent)',
        border: 'none',
        fontWeight: 600,
      }}
      onClick={() => model.expandCard(provider)}
    >
      {provider === 'github' ? 'Sign in with GitHub' : 'Enter API Key'}
    </button>
  );
}
