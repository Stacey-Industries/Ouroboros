import React, { useCallback, useEffect, useState } from 'react';
import { useCommandRegistry } from '../CommandPalette/useCommandRegistry';
import type { Command } from '../CommandPalette/types';

// ─── ExtensionsSection ────────────────────────────────────────────────────────

export function ExtensionsSection(): React.ReactElement {
  const { commands } = useCommandRegistry();
  const [isOpening, setIsOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [isSnippetOpen, setIsSnippetOpen] = useState(false);

  // Filter to only 'extension' category commands
  const extensionCommands = commands.filter((c) => c.category === 'extension');

  // Clear error after a few seconds
  useEffect(() => {
    if (!openError) return;
    const t = setTimeout(() => setOpenError(null), 4000);
    return () => clearTimeout(t);
  }, [openError]);

  const handleOpenExtensionsFolder = useCallback(async (): Promise<void> => {
    if (!('electronAPI' in window)) return;
    setIsOpening(true);
    setOpenError(null);
    try {
      const result = await window.electronAPI.shell.openExtensionsFolder();
      if (!result.success) {
        setOpenError(result.error ?? 'Failed to open extensions folder.');
      }
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'Failed to open extensions folder.');
    } finally {
      setIsOpening(false);
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Status banner */}
      <section>
        <SectionLabel>Extension Commands</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          {extensionCommands.length === 0
            ? 'No extension commands registered.'
            : `${extensionCommands.length} extension command${extensionCommands.length !== 1 ? 's' : ''} currently registered.`}
        </p>

        {/* Commands list */}
        {extensionCommands.length === 0 ? (
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
            No extensions registered. Extensions register commands via DOM events.
          </div>
        ) : (
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

      {/* Extensions folder */}
      <section>
        <SectionLabel>Extensions Folder</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Place extension scripts in the{' '}
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            extensions/
          </code>{' '}
          folder inside your app data directory. The folder is created automatically if it does not exist.
        </p>
        {openError && (
          <div
            role="alert"
            style={{
              marginBottom: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--error)',
              background: 'color-mix(in srgb, var(--error) 10%, var(--bg-secondary))',
              fontSize: '12px',
              color: 'var(--error)',
            }}
          >
            {openError}
          </div>
        )}
        <button
          onClick={() => void handleOpenExtensionsFolder()}
          disabled={isOpening}
          style={{
            ...buttonStyle,
            opacity: isOpening ? 0.6 : 1,
            cursor: isOpening ? 'not-allowed' : 'pointer',
          }}
        >
          {isOpening ? 'Opening\u2026' : 'Open Extensions Folder'}
        </button>
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
            ▶
          </span>
        </button>

        {isSnippetOpen && (
          <>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Extensions register commands via DOM{' '}
              <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                CustomEvent
              </code>{' '}
              dispatched on{' '}
              <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                window
              </code>
              . Save the snippet below as an HTML file, then load it via Custom CSS injection or a
              future plugin loader.
            </p>
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
                margin: 0,
                lineHeight: 1.6,
                whiteSpace: 'pre',
              }}
            >
{`<!-- Save as extensions/my-ext.html, load via Custom CSS injection or a future plugin loader -->
<script>
  // Register a command
  window.dispatchEvent(new CustomEvent('agent-ide:register-command', {
    detail: {
      id: 'my-ext:hello',
      label: 'Hello from My Extension',
      category: 'extension',
      action: () => alert('Hello!')
    }
  }));
</script>`}
            </pre>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px', marginBottom: 0 }}>
              To remove a command, dispatch{' '}
              <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                agent-ide:unregister-command
              </code>{' '}
              with the command ID as the{' '}
              <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                detail
              </code>{' '}
              value. Registered commands appear in the Command Palette under the{' '}
              <strong style={{ color: 'var(--text)' }}>Extension</strong> category.
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
