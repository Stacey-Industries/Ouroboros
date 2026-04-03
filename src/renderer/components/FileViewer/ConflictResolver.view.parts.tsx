import React, { useState } from 'react';

export const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border-semantic)',
  borderRadius: '4px',
  margin: '4px 8px',
  overflow: 'hidden',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-mono)',
};

export const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  padding: '6px 8px',
  background: 'var(--surface-raised)',
  borderTop: '1px solid var(--border-semantic)',
};

export function getSectionHeaderStyle(
  background: string,
  color: string,
  borderColor: string,
): React.CSSProperties {
  return {
    padding: '4px 8px',
    background,
    color,
    fontSize: '0.6875rem',
    fontWeight: 600,
    borderBottom: `1px solid ${borderColor}`,
  };
}

export function getSectionBodyStyle(background: string): React.CSSProperties {
  return {
    padding: '4px 8px',
    background,
    whiteSpace: 'pre',
    overflowX: 'auto',
    minHeight: '1.6em',
  };
}

export function ActionButton(props: {
  label: string;
  color: string;
  onClick: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={props.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '2px 10px',
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-ui)',
        fontWeight: 500,
        border: `1px solid ${props.color}`,
        borderRadius: '4px',
        background: hovered ? props.color : 'transparent',
        color: hovered ? 'var(--text-on-accent)' : props.color,
        cursor: 'pointer',
        lineHeight: '1.5',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {props.label}
    </button>
  );
}

export function ConflictSection(props: {
  title: string;
  label: string;
  color: string;
  headerBackground: string;
  headerBorder: string;
  bodyBackground: string;
  lines: string[];
}): React.ReactElement {
  return (
    <>
      <div style={getSectionHeaderStyle(props.headerBackground, props.color, props.headerBorder)}>
        {props.title}
        {props.label ? ` (${props.label})` : ''}
      </div>
      <div className="text-text-semantic-primary" style={getSectionBodyStyle(props.bodyBackground)}>
        {props.lines.length === 0 ? (
          <span
            className="text-text-semantic-faint"
            style={{ fontStyle: 'italic', fontSize: '0.75rem' }}
          >
            (empty)
          </span>
        ) : (
          props.lines.map((line, index) => (
            <div key={index} style={{ minHeight: '1.6em', lineHeight: '1.6' }}>
              {line}
            </div>
          ))
        )}
      </div>
    </>
  );
}
