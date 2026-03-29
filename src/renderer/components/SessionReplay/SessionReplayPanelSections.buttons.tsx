import React, { useCallback, useState } from 'react';

import type { SessionReplayController } from './SessionReplayPanelController';

export function TransportBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}): React.ReactElement<any> {
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
        background: hovered && !disabled ? 'var(--surface-raised)' : 'transparent',
        color: disabled ? 'var(--text-faint)' : 'var(--text-primary)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.1s',
      }}
    >
      {children}
    </button>
  );
}

function PlayPauseIcon({ playing }: { playing: boolean }): React.ReactElement<any> {
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

export function ReplayTransportButtons({
  replay,
}: {
  replay: SessionReplayController;
}): React.ReactElement<any> {
  return (
    <>
      <TransportBtn
        onClick={replay.handlePrev}
        disabled={replay.currentStep === 0}
        title="Previous step (Left arrow)"
      >
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

export function ReplaySpeedButton({
  speed,
  onClick,
}: {
  speed: number;
  onClick: () => void;
}): React.ReactElement<any> {
  return (
    <button
      onClick={onClick}
      title="Playback speed"
      className="text-text-semantic-muted border border-border-semantic"
      style={{
        padding: '2px 6px',
        fontSize: '0.625rem',
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        borderRadius: '4px',
        background: 'transparent',
        cursor: 'pointer',
        marginLeft: '4px',
      }}
    >
      {speed}x
    </button>
  );
}

export function ReplayStepCounter({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}): React.ReactElement<any> {
  return (
    <span
      className="text-text-semantic-faint"
      style={{
        marginLeft: 'auto',
        fontSize: '0.6875rem',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {currentStep + 1} / {totalSteps}
    </span>
  );
}

function ExportBtnIcon(): React.ReactElement<any> {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3" />
      <path d="M8 2v8M5 7l3 3 3-3" />
    </svg>
  );
}

export function ExportBtn({ onClick }: { onClick: () => void }): React.ReactElement<any> {
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
        border: `1px solid ${copied ? 'var(--status-success)' : 'var(--border-default)'}`,
        background: 'transparent',
        color: copied
          ? 'var(--status-success)'
          : hovered
            ? 'var(--text-primary)'
            : 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: '0.625rem',
        fontFamily: 'var(--font-ui)',
        transition: 'color 0.15s, border-color 0.15s',
      }}
    >
      <ExportBtnIcon />
      {copied ? 'Copied!' : 'Export'}
    </button>
  );
}

export function CloseBtn({ onClick }: { onClick: () => void }): React.ReactElement<any> {
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
        color: hovered ? 'var(--text-primary)' : 'var(--text-faint)',
        cursor: 'pointer',
      }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" />
      </svg>
    </button>
  );
}
