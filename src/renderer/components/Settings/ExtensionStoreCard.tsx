/**
 * ExtensionStoreCard.tsx — A single extension row in the Extension Store list.
 */

import React from 'react';
import type { VsxExtensionSummary } from '../../types/electron';

interface ExtensionStoreCardProps {
  extension: VsxExtensionSummary;
  isInstalled: boolean;
  isDisabled: boolean;
  isLast: boolean;
  onClick: () => void;
}

export function ExtensionStoreCard({
  extension,
  isInstalled,
  isDisabled,
  isLast,
  onClick,
}: ExtensionStoreCardProps): React.ReactElement {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      style={cardStyle(isLast)}
      className="ext-store-card"
    >
      <div style={cardBodyStyle}>
        {/* Top row: name + badge */}
        <div style={topRowStyle}>
          <span style={nameStyle}>{extension.displayName || extension.name}</span>
          {isInstalled ? (
            <span style={isDisabled ? disabledBadgeStyle : installedBadgeStyle}>
              {isDisabled ? 'Disabled' : 'Installed'}
            </span>
          ) : (
            <span style={arrowStyle}>&rarr;</span>
          )}
        </div>

        {/* Description — clamped to 2 lines */}
        {extension.description && (
          <div style={descriptionStyle} className="line-clamp-2">
            {extension.description}
          </div>
        )}

        {/* Footer: category badge + downloads + rating + version */}
        <div style={footerStyle}>
          <span style={typeBadgeStyle}>Extension</span>
          <span style={metaStyle}>{formatDownloads(extension.downloads)}</span>
          {extension.averageRating != null && (
            <span style={metaStyle}>
              {'\u2605'} {extension.averageRating.toFixed(1)}
            </span>
          )}
          <span style={versionStyle}>v{extension.version}</span>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Styles ──────────────────────────────────────────────────────────────

function cardStyle(isLast: boolean): React.CSSProperties {
  return {
    padding: '10px 12px',
    borderBottom: isLast ? 'none' : '1px solid var(--border)',
    background: 'var(--bg-tertiary)',
    cursor: 'pointer',
    transition: 'background 120ms ease',
  };
}

const cardBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const topRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
};

const nameStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

const descriptionStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  lineHeight: '1.4',
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '2px',
};

const typeBadgeStyle: React.CSSProperties = {
  fontSize: '10px',
  padding: '1px 5px',
  borderRadius: '3px',
  border: '1px solid var(--border)',
  background: 'color-mix(in srgb, var(--accent) 10%, var(--bg))',
  color: 'var(--accent)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  flexShrink: 0,
};

const metaStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
};

const versionStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
};

const installedBadgeStyle: React.CSSProperties = {
  fontSize: '11px',
  padding: '1px 6px',
  borderRadius: '3px',
  background: 'color-mix(in srgb, var(--accent) 15%, var(--bg))',
  color: 'var(--accent)',
  fontWeight: 600,
  flexShrink: 0,
};

const disabledBadgeStyle: React.CSSProperties = {
  fontSize: '11px',
  padding: '1px 6px',
  borderRadius: '3px',
  background: 'color-mix(in srgb, var(--text-muted) 15%, var(--bg))',
  color: 'var(--text-muted)',
  fontWeight: 600,
  flexShrink: 0,
};

const arrowStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--text-muted)',
  flexShrink: 0,
};
