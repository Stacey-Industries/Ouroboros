/**
 * EmptyStateMessage.tsx — contextual empty-state prompt with dismiss.
 * Wave 38 Phase C.
 *
 * Renders a centered empty state with:
 *   - optional icon
 *   - i18n primary message
 *   - optional action button (i18n label + callback)
 *   - dismiss "×" at top-right (session-only or persistent via dismissKey)
 */
import React, { memo } from 'react';

import { t } from '../../i18n';
import { useEmptyStateDismiss } from './useEmptyStateDismiss';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  /* Works both as full-panel (flex-1 parent) and inline (wrapper constrains height) */
  minHeight: '120px',
  height: '100%',
  gap: '12px',
  padding: '24px',
  userSelect: 'none',
};

const iconWrapStyle: React.CSSProperties = { opacity: 0.35 };

const titleStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 500,
  textAlign: 'center',
  maxWidth: '280px',
};

const actionButtonStyle: React.CSSProperties = {
  marginTop: '4px',
  padding: '6px 16px',
  fontSize: '0.75rem',
  borderRadius: '4px',
  border: 'none',
  backgroundColor: 'var(--interactive-accent)',
  cursor: 'pointer',
  fontFamily: 'var(--font-ui)',
  fontWeight: 500,
  transition: 'background-color 100ms',
};

const dismissButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: '8px',
  right: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  borderRadius: '3px',
  fontSize: '14px',
  lineHeight: 1,
  transition: 'background-color 100ms',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EmptyStateMessageProps {
  /** i18n key for the primary message text. */
  messageKey: string;
  /** Optional icon node rendered above the message. */
  icon?: React.ReactNode;
  /** i18n key for an optional action button label. Requires onAction. */
  actionLabel?: string;
  /** Callback fired when the action button is clicked. */
  onAction?: () => void;
  /**
   * Config key for persistent "don't show again" dismiss.
   * When absent, dismiss is session-only (React state, resets on reload).
   */
  dismissKey?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActionButton({
  labelKey,
  onAction,
}: {
  labelKey: string;
  onAction: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onAction}
      className="text-text-semantic-on-accent"
      style={actionButtonStyle}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--interactive-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--interactive-accent)'; }}
    >
      {t(labelKey)}
    </button>
  );
}

function DismissButton({ onDismiss }: { onDismiss: () => void }): React.ReactElement {
  return (
    <button
      onClick={onDismiss}
      title={t('common.close')}
      aria-label={t('common.close')}
      className="text-text-semantic-faint"
      style={dismissButtonStyle}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      ×
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * EmptyStateMessage — contextual empty-state prompt with optional action + dismiss.
 */
export const EmptyStateMessage = memo(function EmptyStateMessage({
  messageKey,
  icon,
  actionLabel,
  onAction,
  dismissKey,
}: EmptyStateMessageProps): React.ReactElement | null {
  const { isDismissed, dismiss } = useEmptyStateDismiss({ dismissKey });

  if (isDismissed) return null;

  const showAction = actionLabel !== undefined && onAction !== undefined;

  return (
    <div className="text-text-semantic-faint" style={containerStyle}>
      <DismissButton onDismiss={dismiss} />
      {icon && <div style={iconWrapStyle}>{icon}</div>}
      <span className="text-text-semantic-muted" style={titleStyle}>
        {t(messageKey)}
      </span>
      {showAction && (
        <ActionButton labelKey={actionLabel} onAction={onAction} />
      )}
    </div>
  );
});
