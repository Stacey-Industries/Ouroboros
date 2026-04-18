/**
 * TourStepContent.tsx — i18n body + navigation buttons for one tour step.
 * Wave 38 Phase B — first-run tour.
 */
import React from 'react';

import { t } from '../../i18n';

export interface TourStepContentProps {
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onDone: () => void;
}

function StepTitle({ stepIndex }: { stepIndex: number }): React.ReactElement {
  return (
    <h2 className="text-text-semantic-primary font-semibold text-sm mb-1">
      {t(`onboarding.step${stepIndex + 1}.title`)}
    </h2>
  );
}

function StepBody({ stepIndex }: { stepIndex: number }): React.ReactElement {
  return (
    <p className="text-text-semantic-secondary text-xs leading-relaxed mb-3">
      {t(`onboarding.step${stepIndex + 1}.body`)}
    </p>
  );
}

function StepCounter({ stepIndex, totalSteps }: { stepIndex: number; totalSteps: number }): React.ReactElement {
  return (
    <span className="text-text-semantic-faint text-xs">
      {stepIndex + 1} / {totalSteps}
    </span>
  );
}

function BackButton({ stepIndex, onBack }: { stepIndex: number; onBack: () => void }): React.ReactElement | null {
  if (stepIndex === 0) return null;
  return (
    <button
      type="button"
      onClick={onBack}
      className="text-xs px-2 py-1 rounded text-text-semantic-secondary hover:text-text-semantic-primary transition-colors"
    >
      {t('tour.back')}
    </button>
  );
}

function PrimaryButton({
  stepIndex, totalSteps, onNext, onDone,
}: { stepIndex: number; totalSteps: number; onNext: () => void; onDone: () => void }): React.ReactElement {
  const isLast = stepIndex === totalSteps - 1;
  return (
    <button
      type="button"
      onClick={isLast ? onDone : onNext}
      className="text-xs px-3 py-1 rounded bg-interactive-accent text-text-semantic-on-accent hover:bg-interactive-hover transition-colors"
    >
      {isLast ? t('tour.done') : t('tour.next')}
    </button>
  );
}

export function TourStepContent({
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  onSkip,
  onDone,
}: TourStepContentProps): React.ReactElement {
  return (
    <div className="p-3 w-64">
      <StepTitle stepIndex={stepIndex} />
      <StepBody stepIndex={stepIndex} />
      <div className="flex items-center justify-between">
        <StepCounter stepIndex={stepIndex} totalSteps={totalSteps} />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs px-2 py-1 rounded text-text-semantic-faint hover:text-text-semantic-secondary transition-colors"
          >
            {t('tour.skip')}
          </button>
          <BackButton stepIndex={stepIndex} onBack={onBack} />
          <PrimaryButton stepIndex={stepIndex} totalSteps={totalSteps} onNext={onNext} onDone={onDone} />
        </div>
      </div>
    </div>
  );
}
