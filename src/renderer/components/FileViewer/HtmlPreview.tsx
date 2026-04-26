/**
 * HtmlPreview — sandboxed HTML file preview.
 *
 * Security model:
 * - Renders HTML content via `iframe srcDoc` — the content runs in a
 *   separate sandboxed browsing context, never injected into the parent
 *   document via dangerouslySetInnerHTML.
 * - `sandbox=""` with no flags: scripts, forms, popups, top-level
 *   navigation, pointer-lock, and modals are all disabled. This is the
 *   strictest possible sandbox. Relative asset paths (images, CSS) will not
 *   resolve because there is no `allow-same-origin`; this is intentional
 *   and documented to the user via the limitation banner.
 * - CSP on the parent window already forbids eval / inline scripts;
 *   the iframe sandbox adds a second layer that is independent of CSP.
 * - Navigation (`allow-top-navigation`, `allow-popups`) is deliberately
 *   excluded to prevent any link click from leaving the preview surface.
 *
 * Limitations (first iteration):
 * - Relative assets (images, stylesheets, scripts) do not load because
 *   `allow-same-origin` is not granted. The limitation notice is shown
 *   as a non-blocking banner inside the chrome.
 * - External URLs in the HTML will silently 404 or be blocked by Electron's
 *   CSP — this is correct behavior for a local-file preview.
 */
import React, { useEffect, useRef, useState } from 'react';

export interface HtmlPreviewProps {
  /** Raw HTML content to preview */
  content: string;
  /** Optional file path (used for display only — not used for asset resolution) */
  filePath?: string | null;
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
};

const bannerStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '4px 12px',
  fontSize: '0.7rem',
  // Intentional opacity-only rgba — scrim overlay, not a semantic color.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  backgroundColor: 'var(--bg-status-warning-subtle, rgba(0,0,0,0.08))',
  color: 'var(--text-status-warning, var(--text-muted))',
  borderBottom: '1px solid var(--border-subtle)',
  userSelect: 'none',
};

const iframeStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  minHeight: 0,
  width: '100%',
};

const errorStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'column',
  gap: '8px',
  color: 'var(--text-status-error, var(--text-muted))',
  fontSize: '0.85rem',
};

function LimitationBanner(): React.ReactElement {
  return (
    <div style={bannerStyle} role="note" aria-label="HTML preview limitations">
      Sandboxed preview — relative assets (images, CSS) and scripts are disabled. External links are
      blocked.
    </div>
  );
}

interface ErrorViewProps {
  message: string;
}

function ErrorView({ message }: ErrorViewProps): React.ReactElement {
  return (
    <div style={errorStyle} role="alert">
      <span>HTML preview failed to load</span>
      <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{message}</span>
    </div>
  );
}

/**
 * Sandboxed HTML preview using `iframe srcDoc`.
 * Renders content in a fully sandboxed browsing context with no permissions.
 */
export function HtmlPreview({ content, filePath }: HtmlPreviewProps): React.ReactElement {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
  }, [content]);

  if (!content) {
    return (
      <div style={containerStyle}>
        <ErrorView message="No HTML content to display" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={containerStyle}>
        <ErrorView message={loadError} />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <LimitationBanner />
      <iframe
        ref={iframeRef}
        // sandbox="" — strictest sandboxing: no scripts, no forms, no popups,
        // no same-origin, no top-navigation. All permissions explicitly denied.
        sandbox=""
        srcDoc={content}
        style={iframeStyle}
        title={filePath ? `Preview: ${filePath}` : 'HTML preview'}
        aria-label="Sandboxed HTML preview"
        onError={() => setLoadError('iframe failed to load')}
      />
    </div>
  );
}
