/**
 * DispatchScreen.tsx — orchestrator for the Dispatch panel.
 *
 * Manages view state (form | queue | detail), selected job id. Composes
 * DispatchForm, DispatchQueueList, and DispatchJobDetail. Uses useDispatchJobs
 * for live job state. Header provides a tab switcher between Form and Queue.
 *
 * Wave 34 Phase E.
 */

import React, { useCallback, useState } from 'react';

import { useProject } from '../../contexts/ProjectContext';
import { useDispatchJobs } from '../../hooks/useDispatchJobs';
import { DispatchForm } from './DispatchForm';
import { DispatchJobDetail } from './DispatchJobDetail';
import { DispatchQueueList } from './DispatchQueueList';
import {
  SCREEN_WRAPPER_STYLE,
  TAB_BAR_STYLE,
  tabButtonStyle,
} from './DispatchScreen.styles';

// ── Types ─────────────────────────────────────────────────────────────────────

type DispatchView = 'form' | 'queue' | 'detail';

// ── Tab bar ───────────────────────────────────────────────────────────────────

interface TabBarProps {
  activeView: DispatchView;
  jobCount: number;
  onSwitch: (view: DispatchView) => void;
}

function DispatchTabBar({ activeView, jobCount, onSwitch }: TabBarProps): React.ReactElement {
  return (
    <div style={TAB_BAR_STYLE}>
      <button
        style={tabButtonStyle(activeView === 'form')}
        onClick={() => onSwitch('form')}
        data-testid="dispatch-tab-form"
      >
        New Task
      </button>
      <button
        style={tabButtonStyle(activeView === 'queue' || activeView === 'detail')}
        onClick={() => onSwitch('queue')}
        data-testid="dispatch-tab-queue"
      >
        Queue{jobCount > 0 ? ` (${jobCount})` : ''}
      </button>
    </div>
  );
}

// ── View resolver ─────────────────────────────────────────────────────────────

interface ViewProps {
  view: DispatchView;
  projectRoots: string[];
  jobs: ReturnType<typeof useDispatchJobs>['jobs'];
  selectedJobId: string | null;
  cancel: ReturnType<typeof useDispatchJobs>['cancel'];
  onJobCreated: (jobId: string) => void;
  onSelectJob: (id: string) => void;
  onCloseDetail: () => void;
}

function DispatchViewBody({
  view, projectRoots, jobs, selectedJobId, cancel,
  onJobCreated, onSelectJob, onCloseDetail,
}: ViewProps): React.ReactElement {
  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null;

  if (view === 'detail' && selectedJob) {
    return (
      <DispatchJobDetail
        job={selectedJob}
        onClose={onCloseDetail}
        onCancel={(id) => void cancel(id)}
      />
    );
  }

  if (view === 'queue') {
    return (
      <DispatchQueueList
        jobs={jobs}
        selectedJobId={selectedJobId}
        onSelect={onSelectJob}
        onCancel={(id) => void cancel(id)}
      />
    );
  }

  return (
    <DispatchForm
      projectRoots={projectRoots}
      onSuccess={onJobCreated}
      onError={() => { /* errors shown inline by DispatchForm */ }}
    />
  );
}

// ── DispatchScreen ────────────────────────────────────────────────────────────

export function DispatchScreen(): React.ReactElement {
  const { projectRoots } = useProject();
  const { jobs, cancel } = useDispatchJobs();
  const [view, setView] = useState<DispatchView>('form');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const handleJobCreated = useCallback((jobId: string) => {
    setSelectedJobId(jobId);
    setView('queue');
  }, []);

  const handleSelectJob = useCallback((id: string) => {
    setSelectedJobId(id);
    setView('detail');
  }, []);

  const handleCloseDetail = useCallback(() => {
    setView('queue');
  }, []);

  const handleTabSwitch = useCallback((next: DispatchView) => {
    if (next !== 'detail') setView(next);
    else setView('queue');
  }, []);

  return (
    <div style={SCREEN_WRAPPER_STYLE} data-testid="dispatch-screen">
      <DispatchTabBar
        activeView={view}
        jobCount={jobs.length}
        onSwitch={handleTabSwitch}
      />
      <DispatchViewBody
        view={view}
        projectRoots={projectRoots}
        jobs={jobs}
        selectedJobId={selectedJobId}
        cancel={cancel}
        onJobCreated={handleJobCreated}
        onSelectJob={handleSelectJob}
        onCloseDetail={handleCloseDetail}
      />
    </div>
  );
}
