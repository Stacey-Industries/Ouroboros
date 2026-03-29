/**
 * ContextDocsSectionStatus.tsx — GenerationActions and GenerationStatus sub-components.
 */

import React from 'react';

import type { ClaudeMdGenerationStatus } from '../../types/electron-claude-md';
import { claudeSectionSectionDescriptionStyle } from './claudeSectionContentStyles';
import {
  actionRowStyle,
  disabledButtonStyle,
  primaryButtonStyle,
  progressBarContainerStyle,
  progressBarFillStyle,
  resultLabelStyle,
  resultRowStyle,
  secondaryButtonStyle,
  statusBoxStyle,
} from './contextDocsSectionStyles';
import { SectionLabel } from './settingsStyles';

export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildResultCounts(
  lastRun: ClaudeMdGenerationStatus['lastRun'],
): { created: number; updated: number; skipped: number; errors: number } | null {
  if (!lastRun?.results) return null;
  return {
    created: lastRun.results.filter((r) => r.status === 'created').length,
    updated: lastRun.results.filter((r) => r.status === 'updated').length,
    skipped: lastRun.results.filter((r) => r.status === 'skipped').length,
    errors: lastRun.results.filter((r) => r.status === 'error').length,
  };
}

function GenerateNowButton({
  generating,
  hasRoot,
  lastRun,
  onGenerate,
}: {
  generating: boolean;
  hasRoot: boolean;
  lastRun: ClaudeMdGenerationStatus['lastRun'] | undefined;
  onGenerate: (fullSweep: boolean) => void;
}): React.ReactElement<any> {
  const disabled = generating || !hasRoot;
  return (
    <button
      onClick={() => onGenerate(false)}
      disabled={disabled}
      className="text-text-semantic-on-accent"
      style={disabled ? disabledButtonStyle : primaryButtonStyle}
      onMouseOver={(e) => {
        if (!disabled) e.currentTarget.style.opacity = '0.85';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
    >
      {generating && !lastRun ? 'Generating...' : 'Generate Now'}
    </button>
  );
}

function FullSweepButton({
  generating,
  hasRoot,
  onGenerate,
}: {
  generating: boolean;
  hasRoot: boolean;
  onGenerate: (fullSweep: boolean) => void;
}): React.ReactElement<any> {
  const disabled = generating || !hasRoot;
  return (
    <button
      onClick={() => onGenerate(true)}
      disabled={disabled}
      style={
        disabled
          ? { ...secondaryButtonStyle, opacity: 0.5, cursor: 'not-allowed' }
          : secondaryButtonStyle
      }
      onMouseOver={(e) => {
        if (!disabled) e.currentTarget.style.opacity = '0.8';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
    >
      Full Sweep
    </button>
  );
}

export function GenerationActions({
  generating,
  hasRoot,
  lastRun,
  onGenerate,
}: {
  generating: boolean;
  hasRoot: boolean;
  lastRun: ClaudeMdGenerationStatus['lastRun'] | undefined;
  onGenerate: (fullSweep: boolean) => void;
}): React.ReactElement<any> {
  return (
    <section>
      <SectionLabel>Actions</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionSectionDescriptionStyle}>
        Manually trigger CLAUDE.md generation for the current project.
      </p>
      <div style={actionRowStyle}>
        <GenerateNowButton
          generating={generating}
          hasRoot={hasRoot}
          lastRun={lastRun}
          onGenerate={onGenerate}
        />
        <FullSweepButton generating={generating} hasRoot={hasRoot} onGenerate={onGenerate} />
        {!hasRoot && (
          <span
            className="text-text-semantic-muted"
            style={{ fontSize: '11px', fontStyle: 'italic' }}
          >
            Open a project first
          </span>
        )}
      </div>
    </section>
  );
}

function RunningStatus({ status }: { status: ClaudeMdGenerationStatus }): React.ReactElement<any> {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontWeight: 500 }}>Generating...</span>
        {status.progress && (
          <span className="text-text-semantic-muted" style={{ fontSize: '11px' }}>
            {status.progress.completed} / {status.progress.total}
          </span>
        )}
      </div>
      {status.currentDir && (
        <p
          className="text-text-semantic-muted"
          style={{ fontSize: '11px', margin: '0 0 6px 0', fontFamily: 'var(--font-mono)' }}
        >
          {status.currentDir}
        </p>
      )}
      {status.progress && (
        <div style={progressBarContainerStyle}>
          <div
            style={progressBarFillStyle(
              status.progress.total > 0
                ? (status.progress.completed / status.progress.total) * 100
                : 0,
            )}
          />
        </div>
      )}
    </div>
  );
}

function ResultCountRow({
  label,
  value,
  labelClass = 'text-text-semantic-primary',
  valueClass,
}: {
  label: string;
  value: number;
  labelClass?: string;
  valueClass?: string;
}): React.ReactElement<any> {
  return (
    <div className="text-text-semantic-secondary" style={resultRowStyle}>
      <span className={labelClass} style={resultLabelStyle}>
        {label}
      </span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function ErrorDetailList({
  results,
}: {
  results: NonNullable<ClaudeMdGenerationStatus['lastRun']>['results'];
}): React.ReactElement<any> {
  const errors = results.filter((r) => r.status === 'error');
  return (
    <>
      {errors.map((r) => (
        <div
          key={r.dirPath}
          style={{ marginTop: '6px', fontFamily: 'var(--font-mono)', fontSize: '10px' }}
        >
          <span className="text-status-error" style={{ display: 'block', fontWeight: 500 }}>
            {r.dirPath}
          </span>
          <span
            className="text-text-semantic-muted"
            style={{
              display: 'block',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={r.error}
          >
            {r.error}
          </span>
        </div>
      ))}
    </>
  );
}

function LastRunStatus({
  lastRun,
}: {
  lastRun: NonNullable<ClaudeMdGenerationStatus['lastRun']>;
}): React.ReactElement<any> {
  const resultCounts = buildResultCounts(lastRun);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontWeight: 500 }}>Last Run</span>
        <span className="text-text-semantic-muted" style={{ fontSize: '11px' }}>
          {formatTimestamp(lastRun.timestamp)}
        </span>
      </div>
      {resultCounts && (
        <div>
          <ResultCountRow label="Created" value={resultCounts.created} />
          <ResultCountRow label="Updated" value={resultCounts.updated} />
          <ResultCountRow
            label="Skipped"
            value={resultCounts.skipped}
            valueClass="text-text-semantic-muted"
          />
          {resultCounts.errors > 0 && (
            <ResultCountRow
              label="Errors"
              value={resultCounts.errors}
              labelClass="text-status-error"
              valueClass="text-status-error"
            />
          )}
        </div>
      )}
      <ErrorDetailList results={lastRun.results} />
    </div>
  );
}

export function GenerationStatus({
  status,
  lastRun,
}: {
  status: ClaudeMdGenerationStatus | null;
  lastRun: ClaudeMdGenerationStatus['lastRun'] | undefined;
}): React.ReactElement<any> | null {
  if (!status) return null;
  return (
    <section>
      <SectionLabel>Status</SectionLabel>
      <div className="text-text-semantic-primary" style={statusBoxStyle}>
        {status.running ? (
          <RunningStatus status={status} />
        ) : lastRun ? (
          <LastRunStatus lastRun={lastRun} />
        ) : (
          <p className="text-text-semantic-muted" style={{ margin: 0, fontStyle: 'italic' }}>
            No generation runs yet. Click &ldquo;Generate Now&rdquo; to start.
          </p>
        )}
      </div>
    </section>
  );
}
