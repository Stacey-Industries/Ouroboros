/**
 * McpStoreServerCard.tsx — A single server row in the MCP Store list.
 */

import React from 'react';

import type { McpRegistryServer } from '../../types/electron';

interface McpStoreServerCardProps {
  server: McpRegistryServer;
  isInstalled: boolean;
  isLast: boolean;
  onClick: () => void;
}

export function McpStoreServerCard({ server, isInstalled, isLast, onClick }: McpStoreServerCardProps): React.ReactElement {
  const displayName = server.title || extractShortName(server.name);
  const pkg = server.packages?.[0];
  const registryType = pkg?.registry_type ?? 'npm';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      style={cardStyle(isLast)}
      className="mcp-store-card"
    >
      <div style={cardBodyStyle}>
        {/* Top row: name + installed badge */}
        <div style={topRowStyle}>
          <span className="text-text-semantic-primary" style={nameStyle}>{displayName}</span>
          {isInstalled ? (
            <span className="text-interactive-accent" style={installedBadgeStyle}>Installed</span>
          ) : (
            <span className="text-text-semantic-muted" style={arrowStyle}>&rarr;</span>
          )}
        </div>

        {/* Description — clamped to 2 lines */}
        {server.description && (
          <div className="text-text-semantic-muted line-clamp-2" style={descriptionStyle}>
            {server.description}
          </div>
        )}

        {/* Footer: type badge + version */}
        <div style={footerStyle}>
          <span className="text-interactive-accent" style={typeBadgeStyle}>{registryType}</span>
          <span className="text-text-semantic-muted" style={versionStyle}>v{server.version}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Extract a readable short name from a registry name.
 * e.g. "io.github.user/my-server" -> "my-server"
 */
function extractShortName(name: string | undefined): string {
  if (!name) return 'Unknown Server';
  const slashIdx = name.lastIndexOf('/');
  return slashIdx >= 0 ? name.slice(slashIdx + 1) : name;
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
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

const descriptionStyle: React.CSSProperties = {
  fontSize: '12px',
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
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  flexShrink: 0,
};

const versionStyle: React.CSSProperties = {
  fontSize: '11px',
};

const installedBadgeStyle: React.CSSProperties = {
  fontSize: '11px',
  padding: '1px 6px',
  borderRadius: '3px',
  background: 'color-mix(in srgb, var(--accent) 15%, var(--bg))',
  fontWeight: 600,
  flexShrink: 0,
};

const arrowStyle: React.CSSProperties = {
  fontSize: '13px',
  flexShrink: 0,
};
