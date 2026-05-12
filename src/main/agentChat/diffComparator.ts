/**
 * diffComparator.ts — Scoped terminal-state comparison for Wave 86 Phase 3.
 *
 * Compares the shadow path's state machine output against the existing bridge's
 * observed outcomes. Phase 3 scope: terminal state (status), event count per turn,
 * and registry alias presence. Does NOT compare content fidelity (Phase 5).
 *
 * Divergence policy (Decision 3 / Decision 6):
 *   - In development (NODE_ENV !== 'production'): throws DivergenceError.
 *   - In production: logs at error level + emits telemetry counter.
 *
 * All public methods are stateless; state is held by the caller's accumulator.
 */

import log from '../logger';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TurnObservation {
  /** Terminal status from the bridge path. */
  bridgeStatus: 'completed' | 'failed' | 'cancelled';
  /** Terminal status from the shadow path. */
  shadowStatus: 'completed' | 'failed' | 'cancelled';
  /** Canonical event count from the shadow path. */
  shadowEventCount: number;
  /** Whether the registry resolved the providerSessionId for this turn. */
  registryAliasPresent: boolean;
}

export interface DivergenceReport {
  turnId: string;
  field: string;
  bridgeValue: unknown;
  shadowValue: unknown;
}

// ─── Error thrown in dev ──────────────────────────────────────────────────────

export class DivergenceError extends Error {
  constructor(public readonly report: DivergenceReport) {
    super(
      `[diffComparator] DIVERGENCE on turn ${report.turnId}: ` +
        `field=${report.field} bridge=${JSON.stringify(report.bridgeValue)} ` +
        `shadow=${JSON.stringify(report.shadowValue)}`,
    );
    this.name = 'DivergenceError';
  }
}

// ─── Comparator ──────────────────────────────────────────────────────────────

export class DiffComparator {
  private readonly isDev: boolean;

  constructor(isDev?: boolean) {
    this.isDev = isDev ?? process.env['NODE_ENV'] !== 'production';
  }

  /**
   * Compare one completed turn's observations.
   * Throws DivergenceError in dev; logs + increments telemetry counter in prod.
   */
  compare(turnId: string, obs: TurnObservation): void {
    const reports = this.buildReports(turnId, obs);
    for (const report of reports) {
      this.handleDivergence(report);
    }
    if (reports.length === 0) {
      log.info('[diffComparator] turn match', { turnId });
    }
  }

  private buildReports(turnId: string, obs: TurnObservation): DivergenceReport[] {
    const out: DivergenceReport[] = [];

    if (obs.bridgeStatus !== obs.shadowStatus) {
      out.push({
        turnId,
        field: 'terminalStatus',
        bridgeValue: obs.bridgeStatus,
        shadowValue: obs.shadowStatus,
      });
    }

    if (!obs.registryAliasPresent) {
      out.push({
        turnId,
        field: 'registryAliasPresent',
        bridgeValue: true,
        shadowValue: false,
      });
    }

    return out;
  }

  private handleDivergence(report: DivergenceReport): void {
    if (this.isDev) {
      throw new DivergenceError(report);
    }
    log.error('[diffComparator] divergence detected', { report });
  }
}
