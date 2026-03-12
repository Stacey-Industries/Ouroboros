import React, { useCallback, useEffect, useState } from 'react';
import { useCommandRegistry } from '../CommandPalette/useCommandRegistry';
import type { Command } from '../CommandPalette/types';
import type { ExtensionInfo } from '../../types/electron';

// ─── ExtensionsSection ────────────────────────────────────────────────────────

export function ExtensionsSection(): React.ReactElement {
  const { commands } = useCommandRegistry();
  const [extensionsList, setExtensionsList] = useState<ExtensionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExt, setSelectedExt] = useState<string | null>(null);
  const [extLog, setExtLog] = useState<string[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSnippetOpen, setIsSnippetOpen] = useState(false);

  // Filter to only 'extension' category commands
  const extensionCommands = commands.filter((c) => c.category === 'extension');

  // ── Fetch extension list ──────────────────────────────────────────────────

  const fetchExtensions = useCallback(async () => {
    if (!('electronAPI' in window)) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.extensions.list();
      if (result.success && result.extensions) {
        setExtensionsList(result.extensions);
      } else {
        setError(result.error ?? 'Failed to list extensions');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list extensions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchExtensions();
  }, [fetchExtensions]);

  // ── Fetch extension log ───────────────────────────────────────────────────

  const fetchLog = useCallback(async (name: string) => {
    if (!('electronAPI' in window)) return;
    setLogLoading(true);
    try {
      const result = await window.electronAPI.extensions.getLog(name);
      if (result.success && result.log) {
        setExtLog(result.log);
      }
    } catch {
      setExtLog(['Failed to load log.']);
    } finally {
      setLogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedExt) {
      void fetchLog(selectedExt);
    }
  }, [selectedExt, fetchLog]);

  // ── Clear action error after a few seconds ────────────────────────────────

  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 4000);
    return () => clearTimeout(t);
  }, [actionError]);

  // ── Enable / Disable toggle ───────────────────────────────────────────────

  const handleToggleExtension = useCallback(async (name: string, currentlyEnabled: boolean) => {
    if (!('electronAPI' in window)) return;
    setActionError(null);
    try {
      const result = currentlyEnabled
        ? await window.electronAPI.extensions.disable(name)
        : await window.electronAPI.extensions.enable(name);

      if (!result.success) {
        setActionError(result.error ?? 'Operation failed');
      }
      await fetchExtensions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Operation failed');
    }
  }, [fetchExtensions]);

  // ── Uninstall ─────────────────────────────────────────────────────────────

  const handleUninstall = useCallback(async (name: string) => {
    if (!('electronAPI' in window)) return;
    if (!confirm(`Uninstall extension "${name}"? This will delete its files.`)) return;

    setActionError(null);
    try {
      const result = await window.electronAPI.extensions.uninstall(name);
      if (!result.success) {
        setActionError(result.error ?? 'Failed to uninstall');
      }
      if (selectedExt === name) {
        setSelectedExt(null);
        setExtLog([]);
      }
      await fetchExtensions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to uninstall');
    }
  }, [fetchExtensions, selectedExt]);

  // ── Install from folder ───────────────────────────────────────────────────

  const handleInstallFromFolder = useCallback(async () => {
    if (!('electronAPI' in window)) return;
    setIsInstalling(true);
    setActionError(null);
    try {
      const folderResult = await window.electronAPI.files.selectFolder();
      if (!folderResult.success || folderResult.cancelled || !folderResult.path) {
        setIsInstalling(false);
        return;
      }
      const result = await window.electronAPI.extensions.install(folderResult.path);
      if (!result.success) {
        setActionError(result.error ?? 'Failed to install extension');
      }
      await fetchExtensions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to install');
    } finally {
      setIsInstalling(false);
    }
  }, [fetchExtensions]);

  // ── Open extensions folder ────────────────────────────────────────────────

  const handleOpenExtensionsFolder = useCallback(async () => {
    if (!('electronAPI' in window)) return;
    setIsOpening(true);
    setActionError(null);
    try {
      const result = await window.electronAPI.extensions.openFolder();
      if (!result.success) {
        setActionError(result.error ?? 'Failed to open extensions folder.');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to open extensions folder.');
    } finally {
      setIsOpening(false);
    }
  }, []);

  // ── Status badge ──────────────────────────────────────────────────────────

  const statusColor = (status: ExtensionInfo['status']): string => {
    switch (status) {
      case 'active': return '#4ade80';
      case 'inactive': return 'var(--text-muted)';
      case 'error': return '#f87171';
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Action error banner */}
      {actionError && (
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
          {actionError}
        </div>
      )}

      {/* Installed Extensions */}
      <section>
        <SectionLabel>Installed Extensions</SectionLabel>

        {loading ? (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading extensions...</p>
        ) : error ? (
          <div
            style={{
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid var(--error)',
              background: 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))',
              fontSize: '12px',
              color: 'var(--error)',
            }}
          >
            {error}
          </div>
        ) : extensionsList.length === 0 ? (
          <div
            style={{
              padding: '16px',
              borderRadius: '6px',
              border: '1px dashed var(--border)',
              background: 'var(--bg-tertiary)',
              fontSize: '12px',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
              textAlign: 'center',
            }}
          >
            No extensions installed. Place extension folders in the extensions directory or use "Install from Folder".
          </div>
        ) : (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            {extensionsList.map((ext, idx) => (
              <div
                key={ext.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderBottom: idx < extensionsList.length - 1 ? '1px solid var(--border)' : 'none',
                  background: selectedExt === ext.name
                    ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-tertiary))'
                    : 'var(--bg-tertiary)',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'background 120ms ease',
                }}
                onClick={() => setSelectedExt(selectedExt === ext.name ? null : ext.name)}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Status dot */}
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: statusColor(ext.status),
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ext.name}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        flexShrink: 0,
                      }}
                    >
                      v{ext.version}
                    </span>
                  </div>
                  {ext.description && (
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        paddingLeft: '16px',
                      }}
                    >
                      {ext.description}
                    </span>
                  )}
                  {ext.status === 'error' && ext.errorMessage && (
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#f87171',
                        paddingLeft: '16px',
                      }}
                    >
                      Error: {ext.errorMessage}
                    </span>
                  )}
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleToggleExtension(ext.name, ext.enabled); }}
                    title={ext.enabled ? 'Disable' : 'Enable'}
                    style={{
                      ...smallButtonStyle,
                      background: ext.enabled
                        ? 'color-mix(in srgb, var(--accent) 15%, var(--bg))'
                        : 'var(--bg)',
                      color: ext.enabled ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    {ext.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleUninstall(ext.name); }}
                    title="Uninstall"
                    style={{
                      ...smallButtonStyle,
                      color: '#f87171',
                    }}
                  >
                    Uninstall
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Extension detail / log panel */}
        {selectedExt && (() => {
          const ext = extensionsList.find((e) => e.name === selectedExt);
          if (!ext) return null;

          return (
            <div
              style={{
                marginTop: '12px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              {/* Detail header */}
              <div
                style={{
                  padding: '10px 12px',
                  background: 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  {ext.name} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>v{ext.version}</span>
                </div>
                {ext.author && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Author: {ext.author}
                  </div>
                )}
                {ext.permissions.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {ext.permissions.map((perm) => (
                      <span
                        key={perm}
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-tertiary)',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Console log */}
              <div
                style={{
                  padding: '8px 12px 4px',
                  background: 'var(--bg-tertiary)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                  Console Output
                </span>
                <button
                  onClick={() => void fetchLog(selectedExt)}
                  style={{ ...smallButtonStyle, fontSize: '10px', padding: '2px 6px' }}
                >
                  Refresh
                </button>
              </div>
              <div
                style={{
                  maxHeight: '160px',
                  overflowY: 'auto',
                  padding: '8px 12px',
                  background: 'var(--bg)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  lineHeight: 1.5,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {logLoading ? (
                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Loading...</span>
                ) : extLog.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No output.</span>
                ) : (
                  extLog.map((line, i) => (
                    <div key={i} style={{
                      color: line.includes('[error]') ? '#f87171' :
                             line.includes('[warn]') ? '#fbbf24' :
                             'var(--text-secondary)'
                    }}>
                      {line}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })()}
      </section>

      {/* Action buttons */}
      <section style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={() => void handleInstallFromFolder()}
          disabled={isInstalling}
          style={{
            ...buttonStyle,
            opacity: isInstalling ? 0.6 : 1,
            cursor: isInstalling ? 'not-allowed' : 'pointer',
          }}
        >
          {isInstalling ? 'Installing...' : 'Install from Folder'}
        </button>
        <button
          onClick={() => void handleOpenExtensionsFolder()}
          disabled={isOpening}
          style={{
            ...buttonStyle,
            opacity: isOpening ? 0.6 : 1,
            cursor: isOpening ? 'not-allowed' : 'pointer',
          }}
        >
          {isOpening ? 'Opening...' : 'Open Extensions Folder'}
        </button>
        <button
          onClick={() => void fetchExtensions()}
          style={buttonStyle}
        >
          Refresh List
        </button>
      </section>

      {/* Extension Commands (from DOM events) */}
      <section>
        <SectionLabel>Extension Commands</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          {extensionCommands.length === 0
            ? 'No extension commands registered.'
            : `${extensionCommands.length} extension command${extensionCommands.length !== 1 ? 's' : ''} currently registered.`}
        </p>

        {extensionCommands.length > 0 && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            {extensionCommands.map((cmd: Command, idx) => (
              <div
                key={cmd.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderBottom: idx < extensionCommands.length - 1 ? '1px solid var(--border)' : 'none',
                  background: 'var(--bg-tertiary)',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: '0.875rem',
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cmd.label}
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cmd.id}
                  </span>
                </div>
                {cmd.shortcut && (
                  <kbd
                    style={{
                      flexShrink: 0,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      fontSize: '0.6875rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cmd.shortcut}
                  </kbd>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* How to build an extension */}
      <section>
        <button
          onClick={() => setIsSnippetOpen((v) => !v)}
          aria-expanded={isSnippetOpen}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            marginBottom: isSnippetOpen ? '12px' : 0,
          }}
        >
          <SectionLabel style={{ marginBottom: 0 }}>How to Build an Extension</SectionLabel>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              transform: isSnippetOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
              display: 'inline-block',
            }}
          >
            &#9654;
          </span>
        </button>

        {isSnippetOpen && (
          <>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Create a folder with a{' '}
              <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                manifest.json
              </code>{' '}
              and a JavaScript entry file, then install via "Install from Folder" or copy directly to the extensions directory.
            </p>
            <SectionLabel style={{ marginBottom: '4px' }}>manifest.json</SectionLabel>
            <pre
              style={{
                background: 'var(--bg)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                overflowX: 'auto',
                margin: '0 0 12px 0',
                lineHeight: 1.6,
                whiteSpace: 'pre',
              }}
            >
{`{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "Does something useful",
  "author": "Your Name",
  "main": "index.js",
  "permissions": ["files.read", "config.read", "ui.notify"]
}`}
            </pre>
            <SectionLabel style={{ marginBottom: '4px' }}>index.js</SectionLabel>
            <pre
              style={{
                background: 'var(--bg)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                overflowX: 'auto',
                margin: '0 0 12px 0',
                lineHeight: 1.6,
                whiteSpace: 'pre',
              }}
            >
{`// Available API (based on permissions):
// ouroboros.files.readFile(path)
// ouroboros.files.writeFile(path, content)
// ouroboros.terminal.write(tabId, data)
// ouroboros.config.get(key)
// ouroboros.ui.showNotification(message)
// ouroboros.commands.register(id, handler)

console.log('My extension loaded!');
ouroboros.ui.showNotification('Hello from my extension!');`}
            </pre>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              <strong style={{ color: 'var(--text)' }}>Valid permissions:</strong>
            </p>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
              {['files.read', 'files.write', 'terminal.write', 'config.read', 'config.write', 'ui.notify', 'commands.register'].map((p) => (
                <code
                  key={p}
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
                  {p}
                </code>
              ))}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', marginBottom: 0 }}>
              Extensions run in a sandboxed VM with no access to{' '}
              <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>require()</code>,{' '}
              <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>process</code>,{' '}
              or the filesystem directly. All capabilities are gated by the permissions declared in the manifest.
            </p>
          </>
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

const smallButtonStyle: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text-muted)',
  fontSize: '11px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
