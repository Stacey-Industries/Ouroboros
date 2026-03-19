import React, { useCallback, useState } from 'react';

import type { AgentSession } from '../AgentMonitor/types';
import { exportSessionReport } from './exportSessionReport';
import { ReplayTimeline } from './ReplayTimeline';
import type { SessionReplayController } from './SessionReplayPanelController';
import { StepDetail } from './StepDetail';
import { StepList } from './StepList';

export function SessionReplayLayout({
  session,
  onClose,
  replay,
}: {
  session: AgentSession;
  onClose: () => void;
  replay: SessionReplayController;
}): React.ReactElement {
  return (
    <div
      ref={replay.panelRef}
      tabIndex={-1}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg)',
        outline: 'none',
      }}
    >
      <ReplayHeader session={session} onClose={onClose} />
      <ReplayTransportBar replay={replay} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <StepList steps={replay.steps} currentStep={replay.currentStep} onSelect={replay.handleSeek} />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {replay.currentStepData && (
            <StepDetail
              step={replay.currentStepData}
              session={session}
              stepNumber={replay.currentStep + 1}
              totalSteps={replay.steps.length}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ReplayHeader({
  session,
  onClose,
}: {
  session: AgentSession;
  onClose: () => void;
}): React.ReactElement {
  const handleExport = useCallback(() => {
    const report = exportSessionReport(session);
    void navigator.clipboard.writeText(report);
  }, [session]);

  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 12px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        fontSize: '0.8125rem',
        fontFamily: 'var(--font-ui)',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>Session Replay</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
          {session.taskLabel}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <ExportBtn onClick={handleExport} />
        <CloseBtn onClick={onClose} />
      </div>
    </div>
  );
}

function ReplayTransportBar({ replay }: { replay: SessionReplayController }): React.ReactElement {
  return (
    <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <ReplayTransportControls replay={replay} />
      <ReplayTimeline
        steps={replay.steps}
        currentStep={replay.currentStep}
        totalDurationMs={replay.totalDurationMs}
        onSeek={replay.handleSeek}
      />
    </div>
  );
}

function ReplayTransportControls({ replay }: { replay: SessionReplayController }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}>
      <ReplayTransportButtons replay={replay} />
      <ReplaySpeedButton speed={replay.speed} onClick={replay.handleCycleSpeed} />
      <ReplayStepCounter currentStep={replay.currentStep} totalSteps={replay.steps.length} />
    </div>
  );
}

function ReplayTransportButtons({ replay }: { replay: SessionReplayController }): React.ReactElement {
  return (
    <>
      <TransportBtn onClick={replay.handlePrev} disabled={replay.currentStep === 0} title="Previous step (Left arrow)">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M3 6l5-4v8z" />
          <rect x="1" y="2" width="1.5" height="8" rx="0.5" />
        </svg>
      </TransportBtn>
      <TransportBtn onClick={replay.handleTogglePlay} title="Play/Pause (Space)">
        <PlayPauseIcon playing={replay.playing} />
      </TransportBtn>
      <TransportBtn
        onClick={replay.handleNext}
        disabled={replay.currentStep >= replay.steps.length - 1}
        title="Next step (Right arrow)"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <path d="M9 6l-5 4V2z" />
          <rect x="9.5" y="2" width="1.5" height="8" rx="0.5" />
        </svg>
      </TransportBtn>
    </>
  );
}

function ReplaySpeedButton({
  speed,
  onClick,
}: {
  speed: number;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title="Playback speed"
      style={{
        padding: '2px 6px',
        fontSize: '0.625rem',
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        background: 'transparent',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        marginLeft: '4px',
      }}
    >
      {speed}x
    </button>
  );
}

function ReplayStepCounter({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}): React.ReactElement {
  return (
    <span
      style={{
        marginLeft: 'auto',
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-faint)',
      }}
    >
      {currentStep + 1} / {totalSteps}
    </span>
  );
}

function PlayPauseIcon({ playing }: { playing: boolean }): React.ReactElement {
  if (playing) {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <rect x="2" y="2" width="3" height="8" rx="0.5" />
        <rect x="7" y="2" width="3" height="8" rx="0.5" />
      </svg>
    );
  }

  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <path d="M3 1.5l7.5 4.5-7.5 4.5z" />
    </svg>
  );
}

function TransportBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '24px',
        height: '24px',
        borderRadius: '4px',
        border: 'none',
        background: hovered && !disabled ? 'var(--bg-tertiary)' : 'transparent',
        color: disabled ? 'var(--text-faint)' : 'var(--text)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.1s',
      }}
    >
      {children}
    </button>
  );
}

function ExportBtn({ onClick }: { onClick: () => void }): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(() => {
    onClick();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [onClick]);

  return (
    <button
      onClick={handleClick}
      title="Export as Markdown (clipboard)"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 6px',
        borderRadius: '4px',
        border: `1px solid ${copied ? 'var(--success)' : 'var(--border)'}`,
        background: 'transparent',
        color: copied ? 'var(--success)' : hovered ? 'var(--text)' : 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: '0.625rem',
        fontFamily: 'var(--font-ui)',
        transition: 'color 0.15s, border-color 0.15s',
      }}
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3" />
        <path d="M8 2v8M5 7l3 3 3-3" />
      </svg>
      {copied ? 'Copied!' : 'Export'}
    </button>
  );
}

function CloseBtn({ onClick }: { onClick: () => void }): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      title="Close replay"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '20px',
        height: '20px',
        borderRadius: '4px',
        border: 'none',
        background: 'transparent',
        color: hovered ? 'var(--text)' : 'var(--text-faint)',
        cursor: 'pointer',
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" />
      </svg>
    </button>
  );
}
