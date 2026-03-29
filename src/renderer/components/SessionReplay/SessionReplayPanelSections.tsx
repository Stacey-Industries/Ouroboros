import React, { useCallback } from 'react';

import type { AgentSession } from '../AgentMonitor/types';
import { exportSessionReport } from './exportSessionReport';
import { ReplayTimeline } from './ReplayTimeline';
import type { SessionReplayController } from './SessionReplayPanelController';
import {
  CloseBtn,
  ExportBtn,
  ReplaySpeedButton,
  ReplayStepCounter,
  ReplayTransportButtons,
} from './SessionReplayPanelSections.buttons';
import { StepDetail } from './StepDetail';
import { StepList } from './StepList';

function SessionReplayBody({
  session,
  replay,
}: {
  session: AgentSession;
  replay: SessionReplayController;
}): React.ReactElement<any> {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <StepList
        steps={replay.steps}
        currentStep={replay.currentStep}
        onSelect={replay.handleSeek}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {replay.currentStepData && (
          <StepDetail
            step={replay.currentStepData}
            session={session}
            stepNumber={replay.currentStep + 1}
            totalSteps={replay.steps.length}
          />
        )}
      </div>
    </div>
  );
}

export function SessionReplayLayout({
  session,
  onClose,
  replay,
}: {
  session: AgentSession;
  onClose: () => void;
  replay: SessionReplayController;
}): React.ReactElement<any> {
  return (
    <div
      ref={replay.panelRef as React.RefObject<HTMLDivElement | null>}
      tabIndex={-1}
      className="bg-surface-base"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        outline: 'none',
      }}
    >
      <ReplayHeader session={session} onClose={onClose} />
      <ReplayTransportBar replay={replay} />
      <SessionReplayBody session={session} replay={replay} />
    </div>
  );
}

function ReplayHeaderTitle({ taskLabel }: { taskLabel: string }): React.ReactElement<any> {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span className="text-text-semantic-primary" style={{ fontWeight: 600 }}>
        Session Replay
      </span>
      <span
        className="text-text-semantic-muted"
        style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}
      >
        {taskLabel}
      </span>
    </div>
  );
}

function ReplayHeader({
  session,
  onClose,
}: {
  session: AgentSession;
  onClose: () => void;
}): React.ReactElement<any> {
  const handleExport = useCallback(() => {
    const report = exportSessionReport(session);
    void navigator.clipboard.writeText(report);
  }, [session]);

  return (
    <div
      className="bg-surface-panel border-b border-border-semantic"
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 12px',
        fontSize: '0.8125rem',
        fontFamily: 'var(--font-ui)',
        userSelect: 'none',
      }}
    >
      <ReplayHeaderTitle taskLabel={session.taskLabel} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <ExportBtn onClick={handleExport} />
        <CloseBtn onClick={onClose} />
      </div>
    </div>
  );
}

function ReplayTransportControls({
  replay,
}: {
  replay: SessionReplayController;
}): React.ReactElement<any> {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}>
      <ReplayTransportButtons replay={replay} />
      <ReplaySpeedButton speed={replay.speed} onClick={replay.handleCycleSpeed} />
      <ReplayStepCounter currentStep={replay.currentStep} totalSteps={replay.steps.length} />
    </div>
  );
}

function ReplayTransportBar({ replay }: { replay: SessionReplayController }): React.ReactElement<any> {
  return (
    <div className="bg-surface-panel border-b border-border-semantic" style={{ flexShrink: 0 }}>
      <ReplayTransportControls replay={replay} />
      <ReplayTimeline
        steps={replay.steps}
        currentStep={replay.currentStep}
        totalDurationMs={replay.totalDurationMs}
        onSeek={replay.handleSeek}
      />
    </div>
  );
}
