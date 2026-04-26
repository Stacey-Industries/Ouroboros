import React from 'react';

import { badgeStyle, resolveStatusTone } from './orchestrationUi';

export type OrchestrationTab = 'overview' | 'context' | 'verification' | 'history';

export const ORCHESTRATION_TABS: Array<{ key: OrchestrationTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'context', label: 'Context' },
  { key: 'verification', label: 'Verification' },
  { key: 'history', label: 'History' },
];

export function PanelFrame({
  onClose,
  title,
  subtitle,
  children,
}: {
  onClose: () => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', fontFamily: 'var(--font-ui)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div>
          <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      {children}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  destructive = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border px-3 py-1.5 text-[12px]"
      style={{
        borderColor: destructive
          ? 'color-mix(in srgb, #ef4444 30%, var(--border))'
          : 'var(--border)',
        background: destructive
          ? 'color-mix(in srgb, #ef4444 10%, var(--bg-secondary))'
          : 'var(--bg-secondary)',
        color: destructive ? '#ef4444' : 'var(--text)',
      }}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

function CloseButton({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close orchestration"
      style={{
        width: '28px',
        height: '28px', // touch-target-ok — desktop-only orchestration close button
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-muted)',
        fontSize: '18px',
        cursor: 'pointer',
        lineHeight: 1,
      }}
    >
      x
    </button>
  );
}

function HeaderActions({
  refreshing,
  canResume,
  canRerunVerification,
  canPause,
  canCancel,
  onRefresh,
  onResumeLatest,
  onRerunVerification,
  onPauseActive,
  onCancelActive,
}: {
  refreshing: boolean;
  canResume: boolean;
  canRerunVerification: boolean;
  canPause: boolean;
  canCancel: boolean;
  onRefresh: () => void;
  onResumeLatest: () => void;
  onRerunVerification: () => void;
  onPauseActive: () => void;
  onCancelActive: () => void;
}): React.ReactElement {
  const actions = [
    { label: refreshing ? 'Refreshing…' : 'Refresh', onClick: onRefresh },
    { label: 'Resume latest', onClick: onResumeLatest, disabled: !canResume },
    { label: 'Rerun verification', onClick: onRerunVerification, disabled: !canRerunVerification },
    { label: 'Pause', onClick: onPauseActive, disabled: !canPause },
    { label: 'Cancel', onClick: onCancelActive, disabled: !canCancel, destructive: true },
  ];
  return (
    <div className="flex items-center gap-2">
      {actions.map((action) => (
        <ActionButton key={action.label} label={action.label} onClick={action.onClick} disabled={action.disabled} destructive={action.destructive} />
      ))}
    </div>
  );
}

function HeaderSummary({
  projectRoot,
  sessionCount,
  verificationProfile,
  provider,
  status,
}: {
  projectRoot: string;
  sessionCount: number;
  verificationProfile: string;
  provider: string | null;
  status: string;
}): React.ReactElement {
  const tone = resolveStatusTone(status);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Orchestration</span>
        <span style={badgeStyle(tone.background, tone.color)}>{status}</span>
        {provider ? <span style={badgeStyle('color-mix(in srgb, var(--accent) 12%, transparent)', 'var(--accent)')}>{provider}</span> : null}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        <span>{projectRoot.replace(/\\/g, '/')}</span>
        <span>{sessionCount} session{sessionCount === 1 ? '' : 's'}</span>
        <span>{verificationProfile}</span>
      </div>
    </div>
  );
}

export function OrchestrationHeader(props: {
  projectRoot: string;
  sessionCount: number;
  verificationProfile: string;
  provider: string | null;
  status: string;
  refreshing: boolean;
  canResume: boolean;
  canRerunVerification: boolean;
  canPause: boolean;
  canCancel: boolean;
  onRefresh: () => void;
  onResumeLatest: () => void;
  onRerunVerification: () => void;
  onPauseActive: () => void;
  onCancelActive: () => void;
  onClose: () => void;
}): React.ReactElement {
  return (
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
      <HeaderSummary
        projectRoot={props.projectRoot}
        sessionCount={props.sessionCount}
        verificationProfile={props.verificationProfile}
        provider={props.provider}
        status={props.status}
      />
      <HeaderActions {...props} />
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2 text-[12px] transition-colors"
      style={{
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        color: active ? 'var(--text)' : 'var(--text-muted)',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        marginBottom: '-1px',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {label}
    </button>
  );
}

export function OrchestrationTabBar({
  activeTab,
  onSelect,
  tabs,
}: {
  activeTab: OrchestrationTab;
  onSelect: (tab: OrchestrationTab) => void;
  tabs: Array<{ key: OrchestrationTab; label: string }>;
}): React.ReactElement {
  return (
    <div className="flex" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-secondary)' }}>
      {tabs.map((tab) => (
        <TabButton key={tab.key} active={activeTab === tab.key} label={tab.label} onClick={() => onSelect(tab.key)} />
      ))}
    </div>
  );
}

export function NoProjectState({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <PanelFrame onClose={onClose} title="Orchestration" subtitle="Open a project folder to inspect orchestration state.">
      <div className="flex flex-1 items-center justify-center p-6 text-[13px]" style={{ color: 'var(--text-muted)' }}>No project root is currently active.</div>
    </PanelFrame>
  );
}

export function LoadingState(): React.ReactElement {
  return <div className="flex h-full items-center justify-center text-[13px]" style={{ color: 'var(--text-muted)' }}>Loading orchestration sessions…</div>;
}

export function ErrorBanner({ message }: { message: string | null }): React.ReactElement | null {
  if (!message) {
    return null;
  }

  return <div className="border-b px-5 py-3 text-[12px]" style={{ borderColor: 'color-mix(in srgb, #ef4444 25%, var(--border))', background: 'color-mix(in srgb, #ef4444 10%, var(--bg))', color: '#ef4444' }}>{message}</div>;
}
