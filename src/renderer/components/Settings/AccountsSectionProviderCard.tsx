/**
 * AccountsSectionProviderCard.tsx — Individual provider card for the Accounts section.
 *
 * Renders provider identity, connection status, and action buttons.
 * Login forms (GitHub Device Flow, API key input) are in AccountsSectionLoginForms.
 */

import React from 'react';

import type { AuthProvider, AuthState } from '../../types/electron';
import { ClaudeLogo, GitHubLogo, OpenAILogo } from '../shared/ProviderLogos';
import { ExpandedArea } from './AccountsSectionLoginForms';
import * as S from './AccountsSectionStyles';
import { buttonStyle, smallButtonStyle } from './settingsStyles';
import type { AccountsSectionModel } from './useAccountsSection';

interface ProviderCardProps {
  provider: AuthProvider;
  model: AccountsSectionModel;
}

const PROVIDER_LOGOS: Record<AuthProvider, React.ComponentType> = {
  github: GitHubLogo,
  anthropic: ClaudeLogo,
  openai: OpenAILogo,
};

const PROVIDER_META: Record<AuthProvider, { label: string }> = {
  github: { label: 'GitHub' },
  anthropic: { label: 'Claude Code' },
  openai: { label: 'Codex' },
};

export function ProviderCard({ provider, model }: ProviderCardProps): React.ReactElement {
  const state = model.getProviderState(provider);
  const isExpanded = model.expandedCard === provider;

  return (
    <div style={S.cardStyle}>
      <CardHeader state={state} provider={provider} isExpanded={isExpanded} model={model} />
      {isExpanded && <ExpandedArea provider={provider} model={model} />}
    </div>
  );
}

function CardHeader({
  state,
  provider,
  isExpanded,
  model,
}: {
  state: AuthState | undefined;
  provider: AuthProvider;
  isExpanded: boolean;
  model: AccountsSectionModel;
}): React.ReactElement {
  const isConnected = state?.status === 'authenticated';
  const isExpired = state?.status === 'expired';
  const meta = PROVIDER_META[provider];
  const Logo = PROVIDER_LOGOS[provider];

  return (
    <div style={S.cardHeaderStyle}>
      <div>
        <ProviderLabel label={meta.label} Logo={Logo} />
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

function ProviderLabel({
  label,
  Logo,
}: {
  label: string;
  Logo: React.ComponentType;
}): React.ReactElement {
  return (
    <div className="text-text-semantic-primary" style={S.providerNameStyle}>
      <span
        style={{
          marginRight: '8px',
          opacity: 0.7,
          display: 'inline-flex',
          verticalAlign: 'middle',
        }}
      >
        <Logo />
      </span>
      {label}
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
      onClick={() => {
        model.expandCard(provider);
        if (provider === 'github') void model.login('github');
      }}
    >
      {provider === 'github' ? 'Sign in with GitHub' : 'Enter API Key'}
    </button>
  );
}
