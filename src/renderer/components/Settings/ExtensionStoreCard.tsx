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
  return <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }} style={cardStyle(isLast)} className="ext-store-card">
      <div style={cardBodyStyle}>
        <div style={topRowStyle}>
          <span className="text-text-semantic-primary" style={nameStyle}>{extension.displayName || extension.name}</span>
          {isInstalled ? (
            <span className={isDisabled ? 'text-text-semantic-muted' : 'text-interactive-accent'} style={isDisabled ? disabledBadgeStyle : installedBadgeStyle}>
              {isDisabled ? 'Disabled' : 'Installed'}
            </span>
          ) : (
            <span className="text-text-semantic-muted" style={arrowStyle}>&rarr;</span>
          )}
        </div>

        {extension.description && (
          <div className="text-text-semantic-muted line-clamp-2" style={descriptionStyle}>
            {extension.description}
          </div>
        )}

        <div style={footerStyle}>
          <span className="text-interactive-accent" style={typeBadgeStyle}>Extension</span>
          <span className="text-text-semantic-muted" style={metaStyle}>{formatDownloads(extension.downloads)}</span>
          {extension.averageRating != null && (
            <span className="text-text-semantic-muted" style={metaStyle}>
              {'\u2605'} {extension.averageRating.toFixed(1)}
            </span>
          )}
          <span className="text-text-semantic-muted" style={versionStyle}>v{extension.version}</span>
        </div>
      </div>
    </div>;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Styles ──────────────────────────────────────────────────────────────

function cardStyle(isLast: boolean): React.CSSProperties {
  return { padding: '10px 12px', borderBottom: isLast ? 'none' : '1px solid var(--border)', background: 'var(--bg-tertiary)', cursor: 'pointer', transition: 'background 120ms ease' };
}

const cardBodyStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px' };
const topRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' };
const nameStyle: React.CSSProperties = { fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 };
const descriptionStyle: React.CSSProperties = { fontSize: '12px', lineHeight: '1.4', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' };
const footerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' };
const typeBadgeStyle: React.CSSProperties = { fontSize: '10px', padding: '1px 5px', borderRadius: '3px', border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--accent) 10%, var(--bg))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 };
const metaStyle: React.CSSProperties = { fontSize: '11px' };
const versionStyle: React.CSSProperties = { fontSize: '11px' };
const installedBadgeStyle: React.CSSProperties = { fontSize: '11px', padding: '1px 6px', borderRadius: '3px', background: 'color-mix(in srgb, var(--accent) 15%, var(--bg))', fontWeight: 600, flexShrink: 0 };
const disabledBadgeStyle: React.CSSProperties = { fontSize: '11px', padding: '1px 6px', borderRadius: '3px', background: 'color-mix(in srgb, var(--text-muted) 15%, var(--bg))', fontWeight: 600, flexShrink: 0 };
const arrowStyle: React.CSSProperties = { fontSize: '13px', flexShrink: 0 };
