import React from 'react';

import type { ProjectContext } from '../../types/electron';

const SPINNER_KEYFRAMES =
  '@keyframes cb-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '8px',
  marginTop: '20px',
};

export const cardStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: '8px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  marginBottom: '8px',
};

export const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '16px 20px',
};

export const contextEditorStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '300px',
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  lineHeight: 1.6,
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
};

export const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  marginTop: '12px',
  marginBottom: '20px',
};

export const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '10px',
};

export const badgeWrapStyle: React.CSSProperties = {
  marginBottom: '8px',
};

export const structureGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '2px 12px',
};

export const commandRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  padding: '2px 0',
};

export const configListStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
};

export const optionLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '12px',
  cursor: 'pointer',
};

export const optionCardStyle: React.CSSProperties = {
  ...cardStyle,
  display: 'flex',
  gap: '16px',
  flexWrap: 'wrap',
};

const buttonStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: '6px',
  border: '1px solid var(--border-default)',
  background: 'var(--surface-raised)',
  fontSize: '12px',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  transition: 'all 0.1s',
};

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'var(--interactive-accent)',
  color: 'var(--text-on-accent)',
  borderColor: 'var(--interactive-accent)',
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '40px',
  fontSize: '13px',
};

export function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}): React.ReactElement {
  return (
    <>
      <div className="text-text-semantic-muted" style={sectionHeaderStyle}>
        {title}
      </div>
      {children}
    </>
  );
}

export function Badge({ color, label }: { color?: string; label: string }): React.ReactElement {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '11px',
        fontWeight: 500,
        background: color ?? 'var(--interactive-accent)',
        color: 'var(--text-on-accent)',
        marginRight: '4px',
        marginBottom: '4px',
      }}
    >
      {label}
    </span>
  );
}

export function CodeLine({
  accent = false,
  children,
}: {
  accent?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <span
      className={accent ? 'text-interactive-accent' : 'text-text-semantic-primary'}
      style={{
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        padding: '2px 0',
        whiteSpace: accent ? 'nowrap' : undefined,
      }}
    >
      {children}
    </span>
  );
}

export function ConfigPill({ label }: { label: string }): React.ReactElement {
  return (
    <span
      className="bg-surface-base border border-border-semantic text-text-semantic-muted"
      style={{
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        padding: '2px 6px',
        borderRadius: '3px',
      }}
    >
      {label}
    </span>
  );
}

export function ActionButton({
  disabled,
  label,
  onClick,
  primary,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  primary?: boolean;
}): React.ReactElement {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="text-text-semantic-primary"
      style={primary ? primaryButtonStyle : buttonStyle}
    >
      {label}
    </button>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="text-text-semantic-muted" style={emptyStateStyle}>
      {children}
    </div>
  );
}

export function LoadingState(): React.ReactElement {
  return (
    <EmptyState>
      <div style={{ marginBottom: '8px' }}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          style={{ animation: 'cb-spin 1s linear infinite', display: 'inline-block' }}
        >
          <circle cx="12" cy="12" r="10" stroke="var(--border-default)" strokeWidth="2" />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="var(--interactive-accent)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      Scanning project...
      <style>{SPINNER_KEYFRAMES}</style>
    </EmptyState>
  );
}

export function ErrorBanner({ error }: { error: string }): React.ReactElement {
  return (
    <div
      style={{
        ...cardStyle,
        borderColor: 'color-mix(in srgb, var(--status-error) 30%, transparent)',
        background: 'var(--status-error-subtle)',
        color: 'var(--status-error)',
        fontSize: '13px',
      }}
    >
      {error}
    </div>
  );
}

export function buildProjectBadges(
  context: ProjectContext,
): Array<{ color?: string; label: string }> {
  return [
    { label: context.language },
    ...(context.framework ? [{ label: context.framework, color: 'var(--palette-purple)' }] : []),
    ...(context.packageManager ? [{ label: context.packageManager, color: 'var(--interactive-accent)' }] : []),
    ...(context.testFramework ? [{ label: context.testFramework, color: 'var(--status-info)' }] : []),
    ...context.detectedPatterns.map((pattern) => ({ label: pattern, color: 'var(--text-muted)' })),
  ];
}
