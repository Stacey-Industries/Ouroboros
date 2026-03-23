/**
 * Rolling-window calibration store that adjusts token estimates based on
 * actual usage reported by the CLI after each turn.
 */

const WINDOW_SIZE = 10;

interface Observation {
  ratio: number; // actual / estimated
}

const observations: Observation[] = [];
let cachedRatio = 1.0;

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? // eslint-disable-next-line security/detect-object-injection -- mid is computed from array length
      (sorted[mid - 1] + sorted[mid]) / 2
    : // eslint-disable-next-line security/detect-object-injection -- mid is computed from array length
      sorted[mid];
}

function recomputeRatio(): void {
  if (observations.length === 0) {
    cachedRatio = 1.0;
    return;
  }
  const prev = cachedRatio;
  cachedRatio = computeMedian(observations.map((o) => o.ratio));
  const shift = Math.abs(cachedRatio - prev) / (prev || 1);
  if (shift > 0.1) {
    console.debug(
      `[tokenCalibration] ratio shifted ${(shift * 100).toFixed(1)}%: ${prev.toFixed(3)} → ${cachedRatio.toFixed(3)} (${observations.length} observations)`,
    );
  }
}

export const tokenCalibrationStore = {
  /** Record an actual vs estimated token count after a turn completes */
  recordObservation(estimated: number, actual: number): void {
    if (estimated <= 0 || actual <= 0) return;
    observations.push({ ratio: actual / estimated });
    if (observations.length > WINDOW_SIZE) observations.shift();
    recomputeRatio();
  },

  /** Get the current calibration ratio (actual/estimated), defaults to 1.0 */
  getCalibrationRatio(): number {
    return cachedRatio;
  },

  /** Apply calibration to a raw estimate */
  calibrate(rawEstimate: number): number {
    return Math.ceil(rawEstimate * cachedRatio);
  },
};
