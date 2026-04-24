/**
 * @vitest-environment jsdom
 *
 * Tests for the CLI-only badge in AccountsSectionProviderCard.
 * Renders ProviderCard with a mocked model and verifies badge visibility.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProviderCard } from './AccountsSectionProviderCard';
import type { AccountsSectionModel } from './useAccountsSection';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../shared/ProviderLogos', () => ({
  ClaudeLogo: () => React.createElement('span', null, 'Claude'),
  GitHubLogo: () => React.createElement('span', null, 'GitHub'),
  OpenAILogo: () => React.createElement('span', null, 'OpenAI'),
}));

vi.mock('./AccountsSectionLoginForms', () => ({
  ExpandedArea: () => null,
}));

vi.mock('./AccountsSectionStyles', () => ({
  cardStyle: {},
  cardHeaderStyle: {},
  providerNameStyle: {},
  statusTextStyle: {},
  userInfoStyle: {},
  statusDotStyle: () => ({}),
}));

vi.mock('./settingsStyles', () => ({
  buttonStyle: {},
  smallButtonStyle: {},
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeModel(
  credentialType?: 'oauth' | 'apikey',
  status = 'authenticated',
): AccountsSectionModel {
  return {
    getProviderState: () =>
      ({ status, credentialType }) as ReturnType<AccountsSectionModel['getProviderState']>,
    expandedCard: null,
    expandCard: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    importCliCreds: vi.fn(),
    cliDetections: [],
  } as unknown as AccountsSectionModel;
}

afterEach(() => {
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AccountsSectionProviderCard CLI-only badge', () => {
  it('shows CLI-only badge when authenticated with oauth', () => {
    render(
      React.createElement(ProviderCard, {
        provider: 'anthropic',
        model: makeModel('oauth'),
      }),
    );
    expect(screen.getByText('CLI-only')).toBeTruthy();
  });

  it('does not show CLI-only badge when authenticated with apikey', () => {
    render(
      React.createElement(ProviderCard, {
        provider: 'anthropic',
        model: makeModel('apikey'),
      }),
    );
    expect(screen.queryByText('CLI-only')).toBeNull();
  });

  it('does not show CLI-only badge when not authenticated', () => {
    render(
      React.createElement(ProviderCard, {
        provider: 'anthropic',
        model: makeModel('oauth', 'unauthenticated'),
      }),
    );
    expect(screen.queryByText('CLI-only')).toBeNull();
  });

  it('CLI-only badge has expected tooltip text', () => {
    render(
      React.createElement(ProviderCard, {
        provider: 'anthropic',
        model: makeModel('oauth'),
      }),
    );
    const badge = screen.getByText('CLI-only');
    expect(badge.getAttribute('title')).toContain('OAuth subscription tokens');
    expect(badge.getAttribute('title')).toContain('Claude Code CLI path');
  });
});
