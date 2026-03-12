/**
 * SessionReplayPanel.tsx — Main panel for session replay.
 *
 * Three-section layout:
 * - Top: Transport controls (play/pause, prev/next, speed) + timeline scrubber
 * - Left: Step list sidebar
 * - Right: Step detail view (input, output, metadata)
 *
 * Supports keyboard navigation: Left/Right arrows, Space for play/pause.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { AgentSession } from '../AgentMonitor/types';
import type { ReplayStep } from './types';
import { ReplayTimeline } from './ReplayTimeline';
import { StepList } from './StepList';
import { StepDetail } from './StepDetail';

interface SessionReplayPanelProps {
  session: AgentSession;
  onClose: () => void;
}

const SPEEDS = [1, 2, 4, 8];

export function SessionReplayPanel({
  session,
  onClose,
}: SessionReplayPanelProps): React.ReactElement {
  const [currentStep, setCurrentStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const speed = SPEEDS[speedIdx];
  const panelRef = useRef<HTMLDivElement>(null);

  // Build replay steps from session data
  const steps = useMemo<ReplayStep[]>(() => {
    const result: ReplayStep[] = [];

    // Step 0: session start
    result.push({
      index: 0,
      type: 'session_start',
      timestamp: session.startedAt,
      elapsedMs: 0,
      label: session.taskLabel,
    });

    // Steps 1..N: tool calls
    for (let i = 0; i < session.toolCalls.length; i++) {
      const tc = session.toolCalls[i];
      result.push({
        index: i + 1,
        type: 'tool_call',
        timestamp: tc.timestamp,
        elapsedMs: tc.timestamp - session.startedAt,
        toolCall: tc,
        label: `${tc.toolName}: ${tc.input.slice(0, 50)}`,
      });
    }

    return result;
  }, [session]);

  const totalDurationMs = useMemo(() => {
    if (session.completedAt) return session.completedAt - session.startedAt;
    if (steps.length > 1) {
      const last = steps[steps.length - 1];
      const lastEnd = last.toolCall?.duration
        ? last.elapsedMs + last.toolCall.duration
        : last.elapsedMs + 100;
      return lastEnd;
    }
    return 0;
  }, [session, steps]);

  // Auto-play timer
  useEffect(() => {
    if (!playing) return;
    if (currentStep >= steps.length - 1) {
      setPlaying(false);
      return;
    }

    // Calculate delay based on real time gaps between steps, divided by speed
    const current = steps[currentStep];
    const next = steps[currentStep + 1];
    const gapMs = next ? (next.elapsedMs - current.elapsedMs) : 1000;
    // Clamp to reasonable range
    const delay = Math.max(100, Math.min(3000, gapMs / speed));

    const timer = setTimeout(() => {
      setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
    }, delay);

    return () => clearTimeout(timer);
  }, [playing, currentStep, steps, speed]);

  // Keyboard navigation
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      // Only handle if replay panel has focus
      if (!panelRef.current?.contains(document.activeElement) && document.activeElement !== panelRef.current) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
        setPlaying(false);
      } else if (e.key === 'ArrowLeft' || e.key === 'h') {
        e.preventDefault();
        setCurrentStep((s) => Math.max(s - 1, 0));
        setPlaying(false);
      } else if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentStep(0);
        setPlaying(false);
      } else if (e.key === 'End') {
        e.preventDefault();
        setCurrentStep(steps.length - 1);
        setPlaying(false);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [steps]);

  const handlePrev = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
    setPlaying(false);
  }, []);

  const handleNext = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
    setPlaying(false);
  }, [steps]);

  const handleTogglePlay = useCallback(() => {
    if (currentStep >= steps.length - 1) {
      // Restart from beginning
      setCurrentStep(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  }, [currentStep, steps]);

  const handleCycleSpeed = useCallback(() => {
    setSpeedIdx((i) => (i + 1) % SPEEDS.length);
  }, []);

  const handleSeek = useCallback((idx: number) => {
    setCurrentStep(idx);
    setPlaying(false);
  }, []);

  const currentStepData = steps[currentStep];

  return (
    <div
      ref={panelRef}
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
      {/* Header */}
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
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>
            Session Replay
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
            {session.taskLabel}
          </span>
        </div>

        <CloseBtn onClick={onClose} />
      </div>

      {/* Transport controls + timeline */}
      <div
        style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {/* Transport buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
          }}
        >
          {/* Prev */}
          <TransportBtn
            onClick={handlePrev}
            disabled={currentStep === 0}
            title="Previous step (Left arrow)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 6l5-4v8z" />
              <rect x="1" y="2" width="1.5" height="8" rx="0.5" />
            </svg>
          </TransportBtn>

          {/* Play/Pause */}
          <TransportBtn onClick={handleTogglePlay} title="Play/Pause (Space)">
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="2" width="3" height="8" rx="0.5" />
                <rect x="7" y="2" width="3" height="8" rx="0.5" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M3 1.5l7.5 4.5-7.5 4.5z" />
              </svg>
            )}
          </TransportBtn>

          {/* Next */}
          <TransportBtn
            onClick={handleNext}
            disabled={currentStep >= steps.length - 1}
            title="Next step (Right arrow)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M9 6l-5 4V2z" />
              <rect x="9.5" y="2" width="1.5" height="8" rx="0.5" />
            </svg>
          </TransportBtn>

          {/* Speed */}
          <button
            onClick={handleCycleSpeed}
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

          {/* Step counter */}
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.6875rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-faint)',
            }}
          >
            {currentStep + 1} / {steps.length}
          </span>
        </div>

        {/* Timeline scrubber */}
        <ReplayTimeline
          steps={steps}
          currentStep={currentStep}
          totalDurationMs={totalDurationMs}
          onSeek={handleSeek}
        />
      </div>

      {/* Two-column: step list + detail */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <StepList
          steps={steps}
          currentStep={currentStep}
          onSelect={handleSeek}
        />

        <div style={{ flex: 1, overflow: 'hidden' }}>
          {currentStepData && (
            <StepDetail
              step={currentStepData}
              session={session}
              stepNumber={currentStep + 1}
              totalSteps={steps.length}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Transport button ────────────────────────────────────────────────────────

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
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '24px',
        height: '24px',
        borderRadius: '4px',
        border: 'none',
        background: 'transparent',
        color: disabled ? 'var(--text-faint)' : 'var(--text)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--bg-tertiary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

// ─── Close button ────────────────────────────────────────────────────────────

function CloseBtn({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      title="Close replay"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '20px',
        height: '20px',
        borderRadius: '4px',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-faint)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)'; }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" />
      </svg>
    </button>
  );
}
