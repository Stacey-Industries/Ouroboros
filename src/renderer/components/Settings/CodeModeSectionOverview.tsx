import React from 'react';

import { buttonStyle, SectionLabel } from './CodeModeSection.shared';
import type { CodeModeSectionModel } from './useCodeModeSectionModel';

export function ErrorBanner({ error }: { error: string | null }): React.ReactElement<any> | null {
  if (!error) {
    return null;
  }

  return (
    <div
      role="alert"
      className="text-status-error"
      style={{
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid var(--status-error)',
        background: 'color-mix(in srgb, var(--status-error) 10%, var(--surface-panel))',
        fontSize: '12px',
      }}
    >
      {error}
    </div>
  );
}

function StatusDot({ isEnabled }: { isEnabled: boolean }): React.ReactElement<any> {
  return (
    <span
      style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: isEnabled ? '#4ade80' : 'var(--text-muted)',
        flexShrink: 0,
      }}
    />
  );
}

function ProxiedServers({ servers }: { servers: string[] }): React.ReactElement<any> {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span className="text-text-semantic-muted" style={{ fontSize: '12px' }}>
        Proxied servers:
      </span>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {servers.map((name) => (
          <span
            key={name}
            style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '3px',
              border: '1px solid var(--border-default)',
              background: 'var(--surface-raised)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusIndicator({
  isEnabled,
  loading,
  proxiedServers,
}: Pick<CodeModeSectionModel, 'isEnabled' | 'loading' | 'proxiedServers'>): React.ReactElement<any> {
  if (loading) {
    return (
      <p className="text-text-semantic-muted" style={{ fontSize: '12px', fontStyle: 'italic' }}>
        Loading status...
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="text-text-semantic-muted" style={{ fontSize: '12px' }}>
          Status:
        </span>
        <StatusDot isEnabled={isEnabled} />
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: isEnabled ? '#4ade80' : 'var(--text-muted)',
          }}
        >
          {isEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      {isEnabled && proxiedServers.length > 0 ? <ProxiedServers servers={proxiedServers} /> : null}
    </div>
  );
}

function ServerNamesField({
  serverNames,
  setServerNames,
}: Pick<CodeModeSectionModel, 'serverNames' | 'setServerNames'>): React.ReactElement<any> {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label
        className="text-text-semantic-muted"
        style={{
          display: 'block',
          fontSize: '12px',
          marginBottom: '6px',
        }}
      >
        Server Names (comma-separated):
      </label>
      <input
        type="text"
        value={serverNames}
        onChange={(event) => setServerNames(event.target.value)}
        placeholder="github, stripe, filesystem"
        className="text-text-semantic-primary"
        style={{
          width: '100%',
          padding: '7px 10px',
          borderRadius: '6px',
          border: '1px solid var(--border-default)',
          background: 'var(--surface-raised)',
          fontSize: '13px',
          fontFamily: 'var(--font-mono)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function EnableButton({
  canEnable,
  enabling,
  handleEnable,
}: Pick<CodeModeSectionModel, 'canEnable' | 'enabling' | 'handleEnable'>): React.ReactElement<any> {
  return (
    <button
      onClick={() => void handleEnable()}
      disabled={!canEnable}
      style={{
        ...buttonStyle,
        background: canEnable
          ? 'color-mix(in srgb, var(--interactive-accent) 15%, var(--surface-raised))'
          : 'var(--surface-raised)',
        color: canEnable ? 'var(--interactive-accent)' : 'var(--text-muted)',
        opacity: enabling ? 0.6 : 1,
        cursor: canEnable ? 'pointer' : 'not-allowed',
      }}
    >
      {enabling ? 'Enabling...' : 'Enable Code Mode'}
    </button>
  );
}

function DisableButton({
  canDisable,
  disabling,
  handleDisable,
}: Pick<CodeModeSectionModel, 'canDisable' | 'disabling' | 'handleDisable'>): React.ReactElement<any> {
  return (
    <button
      onClick={() => void handleDisable()}
      disabled={!canDisable}
      className="text-text-semantic-primary"
      style={{
        ...buttonStyle,
        opacity: canDisable ? 1 : 0.6,
        cursor: canDisable ? 'pointer' : 'not-allowed',
      }}
    >
      {disabling ? 'Disabling...' : 'Disable'}
    </button>
  );
}

function ActionButtons({
  canDisable,
  canEnable,
  disabling,
  enabling,
  fetchStatus,
  handleDisable,
  handleEnable,
}: Pick<
  CodeModeSectionModel,
  | 'canDisable'
  | 'canEnable'
  | 'disabling'
  | 'enabling'
  | 'fetchStatus'
  | 'handleDisable'
  | 'handleEnable'
>): React.ReactElement<any> {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <EnableButton canEnable={canEnable} enabling={enabling} handleEnable={handleEnable} />
      <DisableButton canDisable={canDisable} disabling={disabling} handleDisable={handleDisable} />
      <button
        onClick={() => void fetchStatus()}
        className="text-text-semantic-primary"
        style={buttonStyle}
      >
        Refresh
      </button>
    </div>
  );
}

export function CodeModeOverview(props: CodeModeSectionModel): React.ReactElement<any> {
  return (
    <section>
      <SectionLabel>Code Mode</SectionLabel>
      <p
        className="text-text-semantic-muted"
        style={{
          fontSize: '12px',
          margin: '0 0 16px 0',
          lineHeight: 1.5,
        }}
      >
        Collapse N MCP tools into a single{' '}
        <code className="text-text-semantic-secondary" style={{ fontFamily: 'var(--font-mono)' }}>
          execute_code
        </code>{' '}
        tool with TypeScript types. Reduces context token usage by 30-80%.
      </p>
      <StatusIndicator
        isEnabled={props.isEnabled}
        loading={props.loading}
        proxiedServers={props.proxiedServers}
      />
      <ServerNamesField serverNames={props.serverNames} setServerNames={props.setServerNames} />
      <ActionButtons
        canDisable={props.canDisable}
        canEnable={props.canEnable}
        disabling={props.disabling}
        enabling={props.enabling}
        fetchStatus={props.fetchStatus}
        handleDisable={props.handleDisable}
        handleEnable={props.handleEnable}
      />
    </section>
  );
}
