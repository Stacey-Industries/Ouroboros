/**
 * ContextBuilder.tsx — Smart Context Builder panel.
 *
 * Scans the project directory to detect tech stack, framework, dependencies,
 * and structure. Generates a CLAUDE.md-formatted context summary that can be
 * copied, set as a system prompt, or written to the project root.
 *
 * Renders inline in the centre pane (same pattern as SettingsPanel / UsagePanel).
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { ProjectContext, ContextGenerateOptions } from '../../types/electron';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ContextBuilderProps {
  projectRoot: string;
  onClose: () => void;
}

// ─── Badge component ────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color?: string }): React.ReactElement {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '11px',
        fontWeight: 500,
        background: color ?? 'var(--accent)',
        color: '#fff',
        marginRight: '4px',
        marginBottom: '4px',
      }}
    >
      {label}
    </span>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  marginBottom: '8px',
  marginTop: '20px',
};

const cardStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  marginBottom: '8px',
};

const buttonStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text)',
  fontSize: '12px',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  transition: 'all 0.1s',
};

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'var(--accent)',
  color: '#fff',
  borderColor: 'var(--accent)',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ContextBuilder({ projectRoot, onClose }: ContextBuilderProps): React.ReactElement {
  const [scanning, setScanning] = useState(false);
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [generatedContent, setGeneratedContent] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [options, setOptions] = useState<ContextGenerateOptions>({
    includeCommands: true,
    includeDeps: true,
    includeStructure: true,
    maxDeps: 20,
  });

  // ── Scan ──────────────────────────────────────────────────────────────────

  const runScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setStatusMessage(null);
    try {
      const result = await window.electronAPI.context.generate(projectRoot, options);
      if (result.success && result.context && result.content) {
        setContext(result.context);
        setGeneratedContent(result.content);
        setEditedContent(result.content);
      } else {
        setError(result.error ?? 'Failed to scan project');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }, [projectRoot, options]);

  // Auto-scan on mount
  useEffect(() => {
    void runScan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleCopyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editedContent);
      setStatusMessage('Copied to clipboard');
      setTimeout(() => setStatusMessage(null), 2000);
    } catch {
      setStatusMessage('Failed to copy');
    }
  }, [editedContent]);

  const handleSetSystemPrompt = useCallback(async () => {
    try {
      const current = await window.electronAPI.config.get('claudeCliSettings');
      await window.electronAPI.config.set('claudeCliSettings', {
        ...current,
        appendSystemPrompt: editedContent,
      });
      setStatusMessage('Set as system prompt');
      setTimeout(() => setStatusMessage(null), 2000);
    } catch {
      setStatusMessage('Failed to set system prompt');
    }
  }, [editedContent]);

  const handleCreateClaudeMd = useCallback(async () => {
    if (!context) return;
    const filePath = projectRoot.replace(/\\/g, '/') + '/CLAUDE.md';
    try {
      const result = await window.electronAPI.files.createFile(filePath, editedContent);
      if (result.success) {
        setStatusMessage('Created CLAUDE.md');
        // Update hasClaudeMd
        setContext((prev) => prev ? { ...prev, hasClaudeMd: true } : prev);
      } else {
        setStatusMessage(result.error ?? 'Failed to create file');
      }
      setTimeout(() => setStatusMessage(null), 3000);
    } catch {
      setStatusMessage('Failed to create CLAUDE.md');
    }
  }, [editedContent, projectRoot, context]);

  const handleUpdateClaudeMd = useCallback(async () => {
    const filePath = projectRoot.replace(/\\/g, '/') + '/CLAUDE.md';
    try {
      const result = await window.electronAPI.files.saveFile(filePath, editedContent);
      if (result.success) {
        setStatusMessage('Updated CLAUDE.md');
      } else {
        setStatusMessage(result.error ?? 'Failed to update file');
      }
      setTimeout(() => setStatusMessage(null), 3000);
    } catch {
      setStatusMessage('Failed to update CLAUDE.md');
    }
  }, [editedContent, projectRoot]);

  // ── Regenerate when options change ────────────────────────────────────────

  const handleOptionToggle = useCallback(
    (key: keyof ContextGenerateOptions) => {
      setOptions((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        // Re-generate with new options
        void (async () => {
          try {
            const result = await window.electronAPI.context.generate(projectRoot, next);
            if (result.success && result.content) {
              setGeneratedContent(result.content);
              setEditedContent(result.content);
            }
          } catch {
            // keep existing content
          }
        })();
        return next;
      });
    },
    [projectRoot],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z"
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="8" cy="8" r="2" fill="var(--accent)" />
          </svg>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
            Context Builder
          </span>
          {scanning && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Scanning...
            </span>
          )}
          {statusMessage && (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--accent)',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(88, 166, 255, 0.1)',
              }}
            >
              {statusMessage}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close context builder"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            fontSize: '16px',
            lineHeight: 1,
          }}
        >
          x
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {error && (
          <div
            style={{
              ...cardStyle,
              borderColor: 'rgba(239, 68, 68, 0.3)',
              background: 'rgba(239, 68, 68, 0.05)',
              color: '#ef4444',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        {context && (
          <>
            {/* Scan results summary */}
            <div style={sectionHeaderStyle}>Project Summary</div>
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                  {context.name}
                </span>
                {context.hasClaudeMd && (
                  <Badge label="CLAUDE.md exists" color="#22c55e" />
                )}
              </div>

              {/* Tech badges */}
              <div style={{ marginBottom: '8px' }}>
                <Badge label={context.language} />
                {context.framework && <Badge label={context.framework} color="#8b5cf6" />}
                {context.packageManager && <Badge label={context.packageManager} color="#6366f1" />}
                {context.testFramework && <Badge label={context.testFramework} color="#06b6d4" />}
                {context.detectedPatterns.map((p) => (
                  <Badge key={p} label={p} color="#64748b" />
                ))}
              </div>
            </div>

            {/* Entry points */}
            {context.entryPoints.length > 0 && (
              <>
                <div style={sectionHeaderStyle}>Entry Points</div>
                <div style={cardStyle}>
                  {context.entryPoints.map((ep) => (
                    <div
                      key={ep}
                      style={{
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text)',
                        padding: '2px 0',
                      }}
                    >
                      {ep}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Directory structure */}
            {context.keyDirs.length > 0 && (
              <>
                <div style={sectionHeaderStyle}>Project Structure</div>
                <div style={cardStyle}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px' }}>
                    {context.keyDirs
                      .filter((d) => d.path !== 'node_modules' && d.path !== 'dist' && d.path !== 'build')
                      .map((dir) => (
                        <React.Fragment key={dir.path}>
                          <span
                            style={{
                              fontSize: '12px',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--accent)',
                            }}
                          >
                            {dir.path}/
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {dir.purpose}
                          </span>
                        </React.Fragment>
                      ))}
                  </div>
                </div>
              </>
            )}

            {/* Build commands */}
            {context.buildCommands.length > 0 && (
              <>
                <div style={sectionHeaderStyle}>Build Commands</div>
                <div style={cardStyle}>
                  {context.buildCommands.map((cmd) => (
                    <div key={cmd.name} style={{ display: 'flex', gap: '8px', padding: '2px 0' }}>
                      <code
                        style={{
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--accent)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cmd.name}
                      </code>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {cmd.command}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Config files */}
            {context.keyConfigs.length > 0 && (
              <>
                <div style={sectionHeaderStyle}>Configuration Files</div>
                <div style={cardStyle}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {context.keyConfigs.map((cfg) => (
                      <span
                        key={cfg}
                        style={{
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {cfg}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Generation options */}
            <div style={sectionHeaderStyle}>Generation Options</div>
            <div style={{ ...cardStyle, display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={options.includeCommands}
                  onChange={() => handleOptionToggle('includeCommands')}
                />
                Commands
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={options.includeStructure}
                  onChange={() => handleOptionToggle('includeStructure')}
                />
                Structure
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={options.includeDeps}
                  onChange={() => handleOptionToggle('includeDeps')}
                />
                Dependencies
              </label>
            </div>

            {/* Generated content preview */}
            <div style={sectionHeaderStyle}>Generated Context (editable)</div>
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              style={{
                width: '100%',
                minHeight: '300px',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.6,
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            {/* Action buttons */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                marginTop: '12px',
                marginBottom: '20px',
              }}
            >
              <button onClick={handleCopyToClipboard} style={buttonStyle}>
                Copy to Clipboard
              </button>
              <button onClick={handleSetSystemPrompt} style={buttonStyle}>
                Set as System Prompt
              </button>
              {!context.hasClaudeMd ? (
                <button onClick={handleCreateClaudeMd} style={primaryButtonStyle}>
                  Create CLAUDE.md
                </button>
              ) : (
                <button onClick={handleUpdateClaudeMd} style={primaryButtonStyle}>
                  Update CLAUDE.md
                </button>
              )}
              <button
                onClick={() => {
                  setEditedContent(generatedContent);
                }}
                style={buttonStyle}
              >
                Reset Edits
              </button>
              <button onClick={runScan} style={buttonStyle} disabled={scanning}>
                {scanning ? 'Scanning...' : 'Rescan'}
              </button>
            </div>
          </>
        )}

        {!context && !error && !scanning && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
            No project root selected. Open a folder to scan.
          </div>
        )}

        {scanning && !context && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
            <div style={{ marginBottom: '8px' }}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}
              >
                <circle cx="12" cy="12" r="10" stroke="var(--border)" strokeWidth="2" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            Scanning project...
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
      </div>
    </div>
  );
}
