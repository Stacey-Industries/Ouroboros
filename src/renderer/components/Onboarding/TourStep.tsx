/**
 * TourStep.tsx — positioned overlay for a single tour step.
 * Wave 38 Phase B — first-run tour.
 *
 * Renders a card anchored near a DOM element identified by data-tour-anchor.
 * Falls back to a centered overlay when the anchor is absent.
 */
import React from 'react';

import { TourStepContent } from './TourStepContent';
import type { AnchorRect } from './useAnchorPosition';

// ── Arrow direction ───────────────────────────────────────────────────────────

type ArrowSide = 'top' | 'bottom' | 'left' | 'right' | 'none';

const CARD_W = 272; // px — matches w-64 (256) + 2*p-3 (12) = 268, rounded up
const CARD_H_APPROX = 130; // approximate card height for position math
const OFFSET = 12; // gap between anchor and card edge
const ARROW_SIZE = 8;

interface CardPosition {
  top: number;
  left: number;
  arrowSide: ArrowSide;
}

function computePosition(rect: AnchorRect): CardPosition {
  if (rect.isCentered) {
    return {
      top: window.innerHeight / 2 - CARD_H_APPROX / 2,
      left: window.innerWidth / 2 - CARD_W / 2,
      arrowSide: 'none',
    };
  }

  const anchorCx = rect.left + rect.width / 2;
  const anchorCy = rect.top + rect.height / 2;
  const spaceBelow = window.innerHeight - rect.top - rect.height;
  const spaceAbove = rect.top;

  // Prefer below, then above, then right.
  if (spaceBelow >= CARD_H_APPROX + OFFSET) {
    return {
      top: rect.top + rect.height + OFFSET,
      left: Math.max(8, Math.min(anchorCx - CARD_W / 2, window.innerWidth - CARD_W - 8)),
      arrowSide: 'top',
    };
  }
  if (spaceAbove >= CARD_H_APPROX + OFFSET) {
    return {
      top: rect.top - CARD_H_APPROX - OFFSET,
      left: Math.max(8, Math.min(anchorCx - CARD_W / 2, window.innerWidth - CARD_W - 8)),
      arrowSide: 'bottom',
    };
  }
  return {
    top: Math.max(8, anchorCy - CARD_H_APPROX / 2),
    left: rect.left + rect.width + OFFSET,
    arrowSide: 'left',
  };
}

// ── Arrow SVG ─────────────────────────────────────────────────────────────────

function Arrow({ side }: { side: ArrowSide }): React.ReactElement | null {
  if (side === 'none') return null;

  const base: React.CSSProperties = { position: 'absolute', width: ARROW_SIZE, height: ARROW_SIZE };
  const pos: React.CSSProperties =
    side === 'top' ? { top: -ARROW_SIZE, left: '50%', transform: 'translateX(-50%)' } :
    side === 'bottom' ? { bottom: -ARROW_SIZE, left: '50%', transform: 'translateX(-50%)' } :
    side === 'left' ? { left: -ARROW_SIZE, top: '50%', transform: 'translateY(-50%)' } :
    { right: -ARROW_SIZE, top: '50%', transform: 'translateY(-50%)' };

  return (
    <div
      aria-hidden="true"
      style={{
        ...base,
        ...pos,
        borderWidth: ARROW_SIZE,
        borderStyle: 'solid',
        borderColor:
          side === 'top' ? 'transparent transparent var(--surface-panel) transparent' :
          side === 'bottom' ? 'var(--surface-panel) transparent transparent transparent' :
          side === 'left' ? 'transparent var(--surface-panel) transparent transparent' :
          'transparent transparent transparent var(--surface-panel)',
      }}
    />
  );
}

// ── TourStep ──────────────────────────────────────────────────────────────────

export interface TourStepProps {
  anchorRect: AnchorRect;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onDone: () => void;
}

export function TourStep({
  anchorRect,
  stepIndex,
  totalSteps,
  onNext,
  onBack,
  onSkip,
  onDone,
}: TourStepProps): React.ReactElement {
  const { top, left, arrowSide } = computePosition(anchorRect);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Tour step ${stepIndex + 1} of ${totalSteps}`}
      className="bg-surface-panel border border-border-semantic rounded-lg shadow-2xl"
      style={{ position: 'fixed', top, left, zIndex: 1100, width: CARD_W }}
    >
      <Arrow side={arrowSide} />
      <TourStepContent
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        onNext={onNext}
        onBack={onBack}
        onSkip={onSkip}
        onDone={onDone}
      />
    </div>
  );
}
