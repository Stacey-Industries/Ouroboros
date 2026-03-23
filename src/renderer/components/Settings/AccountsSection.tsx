/**
 * AccountsSection.tsx — Self-managed settings section for authentication.
 *
 * Bypasses the draft system (like ExtensionsSection, McpSection).
 * Uses useAccountsSectionModel for all state and IPC.
 */

import React from 'react';

import type { AuthProvider, CliCredentialDetection } from '../../types/electron';
import { ProviderCard } from './AccountsSectionProviderCard';
import * as S from './AccountsSectionStyles';
import { SectionLabel, smallButtonStyle } from './settingsStyles';
import { type AccountsSectionModel, useAccountsSectionModel } from './useAccountsSection';

const PROVIDERS: AuthProvider[] = ['github', 'anthropic', 'openai'];

export function AccountsSection(): React.ReactElement {
  const model = useAccountsSectionModel();

  if (model.loading) {
    return (
      <p className="text-text-semantic-muted" style={{ fontSize: '12px' }}>
        Loading accounts...
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <AccountsHeader />
      <CliImportBanner model={model} />
      {PROVIDERS.map((provider) => (
        <ProviderCard key={provider} provider={provider} model={model} />
      ))}
    </div>
  );
}

function AccountsHeader(): React.ReactElement {
  return (
    <div>
      <SectionLabel style={{ marginBottom: '4px' }}>Accounts</SectionLabel>
      <p className="text-text-semantic-muted" style={{ fontSize: '12px', margin: 0 }}>
        Connect accounts for authentication with external services.
      </p>
    </div>
  );
}

function CliImportBanner({ model }: { model: AccountsSectionModel }): React.ReactElement | null {
  if (model.bannerDismissed) return null;
  const available = getAvailableDetections(model.cliDetections);
  if (available.length === 0) return null;

  return (
    <div style={S.bannerStyle}>
      <div style={S.bannerHeaderStyle}>
        <span className="text-text-semantic-primary" style={S.bannerTitleStyle}>
          Existing credentials detected
        </span>
        <button
          className="text-text-semantic-muted"
          style={{ ...smallButtonStyle, border: 'none', fontSize: '10px' }}
          onClick={model.dismissBanner}
        >
          Dismiss
        </button>
      </div>
      <p className="text-text-semantic-muted" style={{ fontSize: '12px', margin: 0 }}>
        We found credentials from your terminal tools. Import them?
      </p>
      <div style={S.bannerActionsStyle}>
        {available.map((d) => (
          <ImportButton key={d.provider} detection={d} model={model} />
        ))}
      </div>
    </div>
  );
}

function ImportButton({
  detection,
  model,
}: {
  detection: CliCredentialDetection;
  model: AccountsSectionModel;
}): React.ReactElement {
  const label = `Import ${detection.provider} (${detection.source})`;
  return (
    <button
      className="text-text-semantic-primary"
      style={smallButtonStyle}
      onClick={() => void model.importCliCreds(detection.provider)}
    >
      {label}
    </button>
  );
}

function getAvailableDetections(
  detections: CliCredentialDetection[] | null,
): CliCredentialDetection[] {
  if (!detections) return [];
  return detections.filter((d) => d.available);
}
