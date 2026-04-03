/**
 * StatusBarAuthIndicator.tsx — Small auth status dots for the status bar.
 *
 * Shows one dot per provider (github, anthropic, openai):
 *   green = connected, yellow = expired/refreshing, gray = unauthenticated.
 * Clicking opens Settings > Accounts tab.
 */

import React, { useCallback } from 'react';

import { OPEN_SETTINGS_PANEL_EVENT } from '../../hooks/appEventNames';
import { useAuth } from '../../hooks/useAuth';
import type { AuthProvider, AuthState } from '../../types/electron';

const PROVIDERS: AuthProvider[] = ['github', 'anthropic', 'openai'];

const PROVIDER_LABELS: Record<AuthProvider, string> = {
  github: 'GitHub',
  anthropic: 'Claude Code',
  openai: 'Codex',
};

const containerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '0 8px',
  height: '16px',
  cursor: 'pointer',
};

function dotColor(state: AuthState | undefined): string {
  if (!state || state.status === 'unauthenticated') {
    return 'var(--text-faint, #484f58)';
  }
  if (state.status === 'expired' || state.status === 'refreshing') {
    return 'var(--status-warning, var(--warning, #e5c07b))';
  }
  return 'var(--status-success, var(--success, #98c379))';
}

function dotTitle(provider: AuthProvider, state: AuthState | undefined): string {
  const label = PROVIDER_LABELS[provider];
  const status = state?.status ?? 'unauthenticated';
  return `${label}: ${status}`;
}

const dotStyle: React.CSSProperties = {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  flexShrink: 0,
  transition: 'background 200ms ease',
};

function AuthDot({
  provider,
  state,
}: {
  provider: AuthProvider;
  state: AuthState | undefined;
}): React.ReactElement {
  return (
    <span title={dotTitle(provider, state)} style={{ ...dotStyle, background: dotColor(state) }} />
  );
}

export function StatusBarAuthIndicator(): React.ReactElement {
  const { getProviderState } = useAuth();

  const handleClick = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(OPEN_SETTINGS_PANEL_EVENT, { detail: { tab: 'accounts' } }),
    );
  }, []);

  return (
    <span
      role="button"
      tabIndex={0}
      title="Auth status — click to manage accounts"
      style={containerStyle}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick();
      }}
    >
      {PROVIDERS.map((p) => (
        <AuthDot key={p} provider={p} state={getProviderState(p)} />
      ))}
    </span>
  );
}
