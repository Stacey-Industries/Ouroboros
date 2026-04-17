/**
 * ResearchModeToggle.tsx — Tri-state segmented control for research mode.
 *
 * Wave 30 Phase G. Renders Off / Conservative / Aggressive buttons in a compact
 * horizontal segmented control. Reads from and writes to the per-session
 * research mode via IPC.
 *
 * When sessionId is not yet available (pre-first-send state), the component
 * shows the global default mode as a visual hint but defers the session-mode
 * write until a real sessionId is provided.
 */

import React, { useCallback, useEffect, useState } from 'react';

import type { ResearchMode } from '../../types/electron';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResearchModeToggleProps {
  /** Chat thread session ID. When null/empty, mode shows global default but writes are deferred. */
  sessionId?: string | null;
}

interface ModeOption {
  value: ResearchMode;
  label: string;
  title: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODE_OPTIONS: ModeOption[] = [
  { value: 'off', label: 'Off', title: 'Disable automatic research for this session' },
  { value: 'conservative', label: 'Conservative', title: 'Research only when high confidence it will help' },
  { value: 'aggressive', label: 'Aggressive', title: 'Research proactively before most tool calls' },
];

const DEFAULT_MODE: ResearchMode = 'conservative';

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface ResearchModeState {
  mode: ResearchMode;
  setMode: (m: ResearchMode) => void;
}

function useResearchMode(sessionId: string | null | undefined): ResearchModeState {
  const [mode, setModeState] = useState<ResearchMode>(DEFAULT_MODE);

  useEffect(() => {
    if (!sessionId) {
      window.electronAPI.research
        .getGlobalDefault()
        .then((res) => {
          if (res.success) setModeState(res.defaultMode);
        })
        .catch(() => undefined);
      return;
    }
    window.electronAPI.research
      .getSessionMode(sessionId)
      .then((res) => {
        if (res.success) setModeState(res.mode);
      })
      .catch(() => undefined);
  }, [sessionId]);

  const setMode = useCallback(
    (m: ResearchMode) => {
      setModeState(m);
      if (!sessionId) return;
      void window.electronAPI.research.setSessionMode(sessionId, m).catch(() => undefined);
    },
    [sessionId],
  );

  return { mode, setMode };
}

// ─── ModeButton ───────────────────────────────────────────────────────────────

interface ModeButtonProps {
  option: ModeOption;
  active: boolean;
  isFirst: boolean;
  isLast: boolean;
  onClick: () => void;
}

function ModeButton({ option, active, isFirst, isLast, onClick }: ModeButtonProps): React.ReactElement {
  const borderRadiusClass = isFirst
    ? 'rounded-l'
    : isLast
      ? 'rounded-r'
      : '';

  const activeClass = active
    ? 'bg-interactive-accent-subtle text-text-semantic-primary'
    : 'text-text-semantic-muted hover:bg-surface-hover';

  return (
    <button
      role="radio"
      aria-checked={active}
      type="button"
      title={option.title}
      onClick={onClick}
      className={[
        'px-2 py-0.5 text-[11px] leading-tight border border-border-semantic',
        'transition-colors duration-75 focus:outline-none focus-visible:ring-1',
        'focus-visible:ring-interactive-accent',
        isFirst ? '' : '-ml-px',
        borderRadiusClass,
        activeClass,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {option.label}
    </button>
  );
}

// ─── ResearchModeToggle ───────────────────────────────────────────────────────

export function ResearchModeToggle({ sessionId }: ResearchModeToggleProps): React.ReactElement {
  const { mode, setMode } = useResearchMode(sessionId);

  return (
    <div
      role="radiogroup"
      aria-label="Research mode"
      className="flex items-center"
    >
      {MODE_OPTIONS.map((option, i) => (
        <ModeButton
          key={option.value}
          option={option}
          active={mode === option.value}
          isFirst={i === 0}
          isLast={i === MODE_OPTIONS.length - 1}
          onClick={() => setMode(option.value)}
        />
      ))}
    </div>
  );
}
