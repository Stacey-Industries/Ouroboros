/**
 * FirstRunTour.tsx — 5-step first-run walkthrough orchestrator.
 * Wave 38 Phase B.
 *
 * Renders when config.platform.onboarding.completed is not true.
 * Escape or Skip sets completed = true and dismounts the tour.
 */
import React, { useCallback, useState } from 'react';

import { useConfig } from '../../hooks/useConfig';
import { useEscapeKey } from '../Layout/MobileOverlayShell';
import { TourStep } from './TourStep';
import { useAnchorPosition } from './useAnchorPosition';

// ── Step definitions ──────────────────────────────────────────────────────────

const TOUR_ANCHORS = [
  'chat',
  'sessions',
  'project-picker',
  'command-trigger',
  'settings-trigger',
] as const;

const TOTAL_STEPS = TOUR_ANCHORS.length;

// ── Config helper ─────────────────────────────────────────────────────────────

function useMarkCompleted(): () => Promise<void> {
  const { config, set } = useConfig();
  return useCallback(async () => {
    const platform = config?.platform ?? {};
    const onboarding = platform.onboarding ?? {};
    await set('platform', { ...platform, onboarding: { ...onboarding, completed: true } });
  }, [config, set]);
}

// ── Active step overlay ───────────────────────────────────────────────────────

interface ActiveStepProps {
  stepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onDone: () => void;
}

function ActiveStep({ stepIndex, onNext, onBack, onSkip, onDone }: ActiveStepProps): React.ReactElement {
  const anchorName = TOUR_ANCHORS[stepIndex];
  const anchorRect = useAnchorPosition(anchorName);
  return (
    <TourStep
      anchorRect={anchorRect}
      stepIndex={stepIndex}
      totalSteps={TOTAL_STEPS}
      onNext={onNext}
      onBack={onBack}
      onSkip={onSkip}
      onDone={onDone}
    />
  );
}

// ── Scrim (semi-transparent backdrop) ────────────────────────────────────────

function TourScrim({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      role="presentation"
      onClick={onClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1099,
        background: 'rgba(0,0,0,0.35)', // hardcoded: opacity scrim — non-semantic overlay, no design token equivalent
      }}
    />
  );
}

// ── Tour navigation state ─────────────────────────────────────────────────────

function useTourNavigation(onComplete: () => void) {
  const [stepIndex, setStepIndex] = useState(0);

  const handleNext = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, TOTAL_STEPS - 1));
  }, []);

  const handleBack = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  return { stepIndex, handleNext, handleBack, handleDone: onComplete, handleSkip: onComplete };
}

// ── FirstRunTour ──────────────────────────────────────────────────────────────

export function FirstRunTour(): React.ReactElement | null {
  const [visible, setVisible] = useState(true);
  const markCompleted = useMarkCompleted();

  const handleComplete = useCallback(async () => {
    setVisible(false);
    await markCompleted();
  }, [markCompleted]);

  const { stepIndex, handleNext, handleBack, handleDone, handleSkip } = useTourNavigation(
    () => void handleComplete(),
  );

  useEscapeKey(visible, () => void handleComplete());

  if (!visible) return null;

  return (
    <>
      <TourScrim onClick={() => void handleComplete()} />
      <ActiveStep
        stepIndex={stepIndex}
        onNext={handleNext}
        onBack={handleBack}
        onSkip={handleSkip}
        onDone={handleDone}
      />
    </>
  );
}

// ── Gate component (checks config before mounting tour) ───────────────────────

export function FirstRunTourGate(): React.ReactElement | null {
  const { config, isLoading } = useConfig();

  if (isLoading || !config) return null;

  const completed = config.platform?.onboarding?.completed;
  if (completed === true) return null;

  return <FirstRunTour />;
}
