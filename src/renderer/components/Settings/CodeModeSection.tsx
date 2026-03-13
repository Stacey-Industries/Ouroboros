import React, { useCallback, useEffect, useState } from 'react';
import type { CodeModeStatusResult } from '../../types/electron';

// ─── CodeModeSection ──────────────────────────────────────────────────────────

export function CodeModeSection(): React.ReactElement {
  const [status, setStatus] = useState<CodeModeStatusResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [serverNames, setServerNames] = useState('');
  const [isTypesOpen, setIsTypesOpen] = useState(false);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);

  // ── Fetch current status ────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    if (!('electronAPI' in window)) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.codemode.getStatus();
      if (result.success) {
        setStatus(result);
      } else {
        setError(result.error ?? 'Failed to fetch status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // ── Enable handler ──────────────────────────────────────────────────────────

  const handleEnable = useCallback(async () => {
    const names = serverNames.split(',').map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return;
    if (!('electronAPI' in window)) return;

    setEnabling(true);
    setError(null);
    try {
      const result = await window.electronAPI.codemode.enable(names, 'global');
      if (!result.success) {
        setError(result.error ?? 'Failed to enable Code Mode');
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable Code Mode');
    } finally {
      setEnabling(false);
    }
  }, [serverNames, fetchStatus]);

  // ── Disable handler ─────────────────────────────────────────────────────────

  const handleDisable = useCallback(async () => {
    if (!('electronAPI' in window)) return;

    setDisabling(true);
    setError(null);
    try {
      const result = await window.electronAPI.codemode.disable();
      if (!result.success) {
        setError(result.error ?? 'Failed to disable Code Mode');
      }
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable Code Mode');
    } finally {
      setDisabling(false);
    }
  }, [fetchStatus]);

  // ── Clear error after a few seconds ─────────────────────────────────────────

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  // ── Derived state ───────────────────────────────────────────────────────────

  const isEnabled = status?.enabled ?? false;
  const proxiedServers = status?.proxiedServers ?? [];
  const generatedTypes = status?.generatedTypes ?? '';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--error)',
            background: 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))',
            fontSize: '12px',
            color: 'var(--error)',
          }}
        >
          {error}
        </div>
      )}

      {/* Header / description */}
      <section>
        <SectionLabel>Code Mode</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
          Collapse N MCP tools into a single{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>execute_code</code>{' '}
          tool with TypeScript types. Reduces context token usage by 30-80%.
        </p>

        {/* Status indicator */}
        {loading ? (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Loading status...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status:</span>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isEnabled ? '#4ade80' : 'var(--text-muted)',
                  flexShrink: 0,
                }}
              />
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
            {isEnabled && proxiedServers.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Proxied servers:</span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {proxiedServers.map((name) => (
                    <span
                      key={name}
                      style={{
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Server names input */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginBottom: '6px',
            }}
          >
            Server Names (comma-separated):
          </label>
          <input
            type="text"
            value={serverNames}
            onChange={(e) => setServerNames(e.target.value)}
            placeholder="github, stripe, filesystem"
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)',
              color: 'var(--text)',
              fontSize: '13px',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => void handleEnable()}
            disabled={enabling || serverNames.trim().length === 0}
            style={{
              ...buttonStyle,
              background: enabling || serverNames.trim().length === 0
                ? 'var(--bg-tertiary)'
                : 'color-mix(in srgb, var(--accent) 15%, var(--bg-tertiary))',
              color: enabling || serverNames.trim().length === 0
                ? 'var(--text-muted)'
                : 'var(--accent)',
              opacity: enabling ? 0.6 : 1,
              cursor: enabling || serverNames.trim().length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {enabling ? 'Enabling...' : 'Enable Code Mode'}
          </button>
          <button
            onClick={() => void handleDisable()}
            disabled={disabling || !isEnabled}
            style={{
              ...buttonStyle,
              opacity: disabling || !isEnabled ? 0.6 : 1,
              cursor: disabling || !isEnabled ? 'not-allowed' : 'pointer',
            }}
          >
            {disabling ? 'Disabling...' : 'Disable'}
          </button>
          <button
            onClick={() => void fetchStatus()}
            style={buttonStyle}
          >
            Refresh
          </button>
        </div>
      </section>

      {/* Generated Types (collapsible) */}
      <section>
        <button
          onClick={() => setIsTypesOpen((v) => !v)}
          aria-expanded={isTypesOpen}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            marginBottom: isTypesOpen ? '12px' : 0,
          }}
        >
          <SectionLabel style={{ marginBottom: 0 }}>Generated Types</SectionLabel>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              transform: isTypesOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
              display: 'inline-block',
            }}
          >
            &#9654;
          </span>
        </button>

        {isTypesOpen && (
          generatedTypes ? (
            <pre
              style={{
                background: 'var(--bg)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                overflowX: 'auto',
                maxHeight: '300px',
                overflowY: 'auto',
                margin: 0,
                lineHeight: 1.6,
                whiteSpace: 'pre',
              }}
            >
              {generatedTypes}
            </pre>
          ) : (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
              {isEnabled
                ? 'No types generated yet.'
                : 'Enable Code Mode to generate TypeScript types for your MCP servers.'}
            </p>
          )
        )}
      </section>

      {/* How It Works (collapsible) */}
      <section>
        <button
          onClick={() => setIsHowItWorksOpen((v) => !v)}
          aria-expanded={isHowItWorksOpen}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            marginBottom: isHowItWorksOpen ? '12px' : 0,
          }}
        >
          <SectionLabel style={{ marginBottom: 0 }}>How It Works</SectionLabel>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              transform: isHowItWorksOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
              display: 'inline-block',
            }}
          >
            &#9654;
          </span>
        </button>

        {isHowItWorksOpen && (
          <ol
            style={{
              margin: 0,
              paddingLeft: '20px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              lineHeight: 1.8,
            }}
          >
            <li>Connects to upstream MCP servers you specify</li>
            <li>Introspects their tool schemas and generates TypeScript type definitions</li>
            <li>
              Exposes a single{' '}
              <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                execute_code
              </code>{' '}
              tool to Claude
            </li>
            <li>Claude writes TypeScript code against the typed API instead of calling N individual tools</li>
            <li>Code Mode executes the code in a sandboxed VM, dispatching calls to the real MCP servers</li>
          </ol>
        )}
      </section>

    </div>
  );
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        marginBottom: '8px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '7px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text)',
  fontSize: '12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
