/**
 * IntegrationsSection.tsx — Lightweight settings section that links out
 * to the dedicated Extension Store and MCP Store pages in the centre pane.
 */

import React, { useCallback, useEffect, useState } from 'react';

import {
  OPEN_EXTENSION_STORE_EVENT,
  OPEN_MCP_STORE_EVENT,
} from '../../hooks/appEventNames';
import { buttonStyle, SectionLabel } from './settingsStyles';

export function IntegrationsSection(): React.ReactElement {
  const counts = useIntegrationCounts();

  const openExtensions = useCallback((tab?: 'browse' | 'installed') => {
    window.dispatchEvent(
      new CustomEvent(OPEN_EXTENSION_STORE_EVENT, { detail: { tab } }),
    );
  }, []);

  const openMcp = useCallback((tab?: 'browse' | 'installed') => {
    window.dispatchEvent(
      new CustomEvent(OPEN_MCP_STORE_EVENT, { detail: { tab } }),
    );
  }, []);

  return (
    <div style={rootStyle}>
      <IntegrationCard
        title="Extensions"
        description="Themes, grammars, and snippets"
        count={counts.extensions}
        countLabel="installed"
        onBrowse={() => openExtensions('browse')}
        onManage={() => openExtensions('installed')}
      />
      <IntegrationCard
        title="MCP Servers"
        description="Tools and capabilities for Claude Code"
        count={counts.mcpServers}
        countLabel="configured"
        onBrowse={() => openMcp('browse')}
        onManage={() => openMcp('installed')}
      />
    </div>
  );
}

function IntegrationCardActions({
  onBrowse,
  onManage,
}: {
  onBrowse: () => void;
  onManage: () => void;
}): React.ReactElement {
  return (
    <div style={actionsStyle}>
      <button onClick={onBrowse} className="text-text-semantic-primary" style={buttonStyle}>
        Browse
      </button>
      <button onClick={onManage} className="text-text-semantic-primary" style={buttonStyle}>
        Manage
      </button>
    </div>
  );
}

function IntegrationCard({
  title,
  description,
  count,
  countLabel,
  onBrowse,
  onManage,
}: {
  title: string;
  description: string;
  count: number | null;
  countLabel: string;
  onBrowse: () => void;
  onManage: () => void;
}): React.ReactElement {
  return (
    <div style={cardStyle}>
      <div>
        <SectionLabel style={{ marginBottom: '4px' }}>{title}</SectionLabel>
        <p className="text-text-semantic-muted" style={descStyle}>
          {description}
          {count !== null && (
            <span className="text-text-semantic-secondary">
              {' \u00b7 '}{count} {countLabel}
            </span>
          )}
        </p>
      </div>
      <IntegrationCardActions onBrowse={onBrowse} onManage={onManage} />
    </div>
  );
}

function useIntegrationCounts(): {
  extensions: number | null;
  mcpServers: number | null;
} {
  const [extensions, setExtensions] = useState<number | null>(null);
  const [mcpServers, setMcpServers] = useState<number | null>(null);

  useEffect(() => {
    window.electronAPI?.extensionStore
      ?.getInstalled()
      .then((list) => setExtensions(list?.length ?? 0))
      .catch(() => setExtensions(0));
    window.electronAPI?.mcpStore
      ?.getInstalledServerNames()
      .then((names) => setMcpServers(names?.length ?? 0))
      .catch(() => setMcpServers(0));
  }, []);

  return { extensions, mcpServers };
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
};

const descStyle: React.CSSProperties = {
  fontSize: '12px',
  margin: 0,
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexShrink: 0,
};
