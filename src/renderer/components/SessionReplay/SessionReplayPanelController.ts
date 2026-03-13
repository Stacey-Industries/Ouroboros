import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { AgentSession } from '../AgentMonitor/types';
import type { ReplayStep } from './types';

const SPEEDS = [1, 2, 4, 8];

type ReplayKeyCommand = 'next' | 'prev' | 'toggle' | 'start' | 'end' | null;

export interface SessionReplayController {
  panelRef: React.RefObject<HTMLDivElement | null>;
  steps: ReplayStep[];
  currentStep: number;
  currentStepData?: ReplayStep;
  playing: boolean;
  speed: number;
  totalDurationMs: number;
  handlePrev: () => void;
  handleNext: () => void;
  handleTogglePlay: () => void;
  handleCycleSpeed: () => void;
  handleSeek: (idx: number) => void;
}

export function useSessionReplayController(session: AgentSession): SessionReplayController {
  const [currentStep, setCurrentStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const steps = useMemo(() => buildReplaySteps(session), [session]);
  const totalDurationMs = useMemo(() => getTotalDurationMs(session, steps), [session, steps]);

  usePlaybackTimer({ currentStep, playing, setCurrentStep, setPlaying, speed: SPEEDS[speedIdx], steps });
  useReplayKeyboard({ panelRef, setCurrentStep, setPlaying, stepsLength: steps.length });

  return {
    panelRef,
    steps,
    currentStep,
    currentStepData: steps[currentStep],
    playing,
    speed: SPEEDS[speedIdx],
    totalDurationMs,
    ...useReplayHandlers({ currentStep, setCurrentStep, setPlaying, setSpeedIdx, stepsLength: steps.length }),
  };
}

function useReplayHandlers({
  currentStep,
  setCurrentStep,
  setPlaying,
  setSpeedIdx,
  stepsLength,
}: {
  currentStep: number;
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setSpeedIdx: React.Dispatch<React.SetStateAction<number>>;
  stepsLength: number;
}): Pick<
  SessionReplayController,
  'handlePrev' | 'handleNext' | 'handleTogglePlay' | 'handleCycleSpeed' | 'handleSeek'
> {
  const stopPlayback = useCallback(() => setPlaying(false), [setPlaying]);
  const handlePrev = useCallback(() => stepReplay(setCurrentStep, stopPlayback, -1, stepsLength), [setCurrentStep, stopPlayback, stepsLength]);
  const handleNext = useCallback(() => stepReplay(setCurrentStep, stopPlayback, 1, stepsLength), [setCurrentStep, stopPlayback, stepsLength]);
  const handleTogglePlay = useCallback(() => toggleReplay(setCurrentStep, setPlaying, currentStep, stepsLength), [currentStep, setCurrentStep, setPlaying, stepsLength]);
  const handleCycleSpeed = useCallback(() => setSpeedIdx((idx) => (idx + 1) % SPEEDS.length), [setSpeedIdx]);
  const handleSeek = useCallback((idx: number) => {
    setCurrentStep(idx);
    stopPlayback();
  }, [setCurrentStep, stopPlayback]);

  return { handlePrev, handleNext, handleTogglePlay, handleCycleSpeed, handleSeek };
}

function buildReplaySteps(session: AgentSession): ReplayStep[] {
  const result: ReplayStep[] = [{
    index: 0,
    type: 'session_start',
    timestamp: session.startedAt,
    elapsedMs: 0,
    label: session.taskLabel,
  }];

  for (let index = 0; index < session.toolCalls.length; index += 1) {
    const toolCall = session.toolCalls[index];
    result.push({
      index: index + 1,
      type: 'tool_call',
      timestamp: toolCall.timestamp,
      elapsedMs: toolCall.timestamp - session.startedAt,
      toolCall,
      label: `${toolCall.toolName}: ${toolCall.input.slice(0, 50)}`,
    });
  }

  return result;
}

function getTotalDurationMs(session: AgentSession, steps: ReplayStep[]): number {
  if (session.completedAt) return session.completedAt - session.startedAt;
  const lastStep = steps[steps.length - 1];
  if (!lastStep) return 0;
  if (!lastStep.toolCall?.duration) return lastStep.elapsedMs + 100;
  return lastStep.elapsedMs + lastStep.toolCall.duration;
}

function stepReplay(
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>,
  stopPlayback: () => void,
  delta: -1 | 1,
  stepsLength: number,
): void {
  setCurrentStep((step) => delta > 0
    ? Math.min(step + 1, stepsLength - 1)
    : Math.max(step - 1, 0));
  stopPlayback();
}

function toggleReplay(
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>,
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>,
  currentStep: number,
  stepsLength: number,
): void {
  if (currentStep >= stepsLength - 1) {
    setCurrentStep(0);
    setPlaying(true);
    return;
  }
  setPlaying((value) => !value);
}

function usePlaybackTimer({
  currentStep,
  playing,
  setCurrentStep,
  setPlaying,
  speed,
  steps,
}: {
  currentStep: number;
  playing: boolean;
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  speed: number;
  steps: ReplayStep[];
}): void {
  useEffect(() => {
    if (!playing) return undefined;
    if (currentStep >= steps.length - 1) {
      setPlaying(false);
      return undefined;
    }

    const current = steps[currentStep];
    const next = steps[currentStep + 1];
    const gapMs = next ? next.elapsedMs - current.elapsedMs : 1000;
    const delay = Math.max(100, Math.min(3000, gapMs / speed));
    const timer = setTimeout(() => {
      setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
    }, delay);

    return () => clearTimeout(timer);
  }, [currentStep, playing, setCurrentStep, setPlaying, speed, steps]);
}

function useReplayKeyboard({
  panelRef,
  setCurrentStep,
  setPlaying,
  stepsLength,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  stepsLength: number;
}): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!isReplayFocused(panelRef.current)) return;
      const command = getReplayKeyCommand(event.key);
      if (!command) return;
      event.preventDefault();
      runReplayKeyCommand(command, stepsLength, setCurrentStep, setPlaying);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panelRef, setCurrentStep, setPlaying, stepsLength]);
}

function isReplayFocused(panel: HTMLDivElement | null): boolean {
  const active = document.activeElement;
  if (!panel || !active) return false;
  return panel.contains(active) || active === panel;
}

function getReplayKeyCommand(key: string): ReplayKeyCommand {
  if (key === 'ArrowRight' || key === 'l') return 'next';
  if (key === 'ArrowLeft' || key === 'h') return 'prev';
  if (key === ' ') return 'toggle';
  if (key === 'Home') return 'start';
  if (key === 'End') return 'end';
  return null;
}

function runReplayKeyCommand(
  command: ReplayKeyCommand,
  stepsLength: number,
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>,
  setPlaying: React.Dispatch<React.SetStateAction<boolean>>,
): void {
  if (command === 'toggle') {
    setPlaying((value) => !value);
    return;
  }
  if (command === 'start') {
    setCurrentStep(0);
    setPlaying(false);
    return;
  }
  if (command === 'end') {
    setCurrentStep(stepsLength - 1);
    setPlaying(false);
    return;
  }
  setPlaying(false);
  setCurrentStep((step) => command === 'next'
    ? Math.min(step + 1, stepsLength - 1)
    : Math.max(step - 1, 0));
}
