import React from 'react';
import {
  ErrorBanner,
  LoadingState,
  NoProjectState,
  OrchestrationHeader,
  OrchestrationTabBar,
  OverviewTabContent,
  type OrchestrationTab,
} from './OrchestrationPanelSections';
import { ContextPreview } from './ContextPreview';
import { TaskSessionHistory } from './TaskSessionHistory';
import { OrchestrationTaskComposer } from './OrchestrationTaskComposer';
import { VerificationSummary } from './VerificationSummary';
import type { UseOrchestrationModelReturn } from './useOrchestrationModel';

function pickString(fallback: string, ...values: Array<string | null | undefined>): string {
  return values.find((value) => typeof value === 'string' && value.length > 0) ?? fallback;
}

function pickNullableString(...values: Array<string | null | undefined>): string | null {
  return values.find((value) => typeof value === 'string' && value.length > 0) ?? null;
}

function pickBoolean(...values: Array<boolean | undefined>): boolean {
  return values.some(Boolean);
}

function buildOverviewProps(model: UseOrchestrationModelReturn, currentStep: string) {
  return {
    session: model.session,
    status: pickString('idle', model.state?.status, model.session?.status),
    provider: pickString('—', model.state?.provider, model.session?.request.provider),
    verificationProfile: pickString('No verification profile', model.state?.verificationProfile, model.session?.request.verificationProfile),
    currentStep,
    actionMessage: model.actionMessage,
    actionError: model.actionError,
    latestResultMessage: pickNullableString(model.latestResult?.message),
  };
}

function OverviewTabPane(props: {
  currentStep: string;
  model: UseOrchestrationModelReturn;
  onTaskReady: (sessionId: string) => Promise<void> | void;
  projectRoot: string;
}): React.ReactElement {
  return (
    <div className="space-y-4">
      <OrchestrationTaskComposer projectRoot={props.projectRoot} onTaskReady={props.onTaskReady} />
      <OverviewTabContent {...buildOverviewProps(props.model, props.currentStep)} />
    </div>
  );
}

function HistoryTabPane({ model }: { model: UseOrchestrationModelReturn }): React.ReactElement {
  return (
    <TaskSessionHistory
      sessions={model.sessions}
      selectedSessionId={model.selectedSessionId}
      onSelectSession={(sessionId) => { void model.selectSession(sessionId); }}
    />
  );
}

interface RenderOrchestrationTabArgs {
  activeTab: OrchestrationTab;
  currentStep: string;
  model: UseOrchestrationModelReturn;
  onTaskReady: (sessionId: string) => Promise<void> | void;
  projectRoot: string;
}

export function renderOrchestrationTab(args: RenderOrchestrationTabArgs): React.ReactElement {
  const contentByTab: Record<OrchestrationTab, React.ReactElement> = {
    overview: <OverviewTabPane model={args.model} currentStep={args.currentStep} projectRoot={args.projectRoot} onTaskReady={args.onTaskReady} />,
    context: <ContextPreview session={args.model.session} latestResult={args.model.latestResult} />,
    verification: <VerificationSummary summary={args.model.verificationSummary} providerEvent={args.model.providerEvent} />,
    history: <HistoryTabPane model={args.model} />,
  };

  return contentByTab[args.activeTab];
}

function buildHeaderProps(model: UseOrchestrationModelReturn, projectRoot: string, onClose: () => void) {
  return {
    projectRoot,
    sessionCount: model.sessions.length,
    verificationProfile: pickString('No verification profile', model.session?.request.verificationProfile),
    provider: pickNullableString(model.session?.request.provider),
    status: pickString('idle', model.state?.status, model.session?.status),
    refreshing: model.refreshing,
    canResume: Boolean(model.latestSession),
    canRerunVerification: Boolean(model.session),
    canPause: pickBoolean(Boolean(model.state?.activeTaskId), Boolean(model.latestSession?.taskId)),
    canCancel: pickBoolean(Boolean(model.state?.activeTaskId), Boolean(model.latestSession?.taskId)),
    onRefresh: () => { void model.refresh(); },
    onResumeLatest: () => { void model.resumeLatest(); },
    onRerunVerification: () => { void model.rerunVerification(); },
    onPauseActive: () => { void model.pauseActive(); },
    onCancelActive: () => { void model.cancelActive(); },
    onClose,
  };
}

export function OrchestrationPanelLoaded(props: {
  activeTab: OrchestrationTab;
  currentStep: string;
  model: UseOrchestrationModelReturn;
  onClose: () => void;
  onTaskReady: (sessionId: string) => Promise<void> | void;
  onSelectTab: (tab: OrchestrationTab) => void;
  projectRoot: string;
}): React.ReactElement {
  const headerProps = buildHeaderProps(props.model, props.projectRoot, props.onClose);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', fontFamily: 'var(--font-ui)' }}>
      <OrchestrationHeader {...headerProps} />
      <OrchestrationTabBar activeTab={props.activeTab} onSelect={props.onSelectTab} />
      <ErrorBanner message={props.model.error} />
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {props.model.loading
          ? <LoadingState />
          : renderOrchestrationTab({
            activeTab: props.activeTab,
            currentStep: props.currentStep,
            model: props.model,
            projectRoot: props.projectRoot,
            onTaskReady: props.onTaskReady,
          })}
      </div>
    </div>
  );
}

export function OrchestrationPanelEmpty({ onClose }: { onClose: () => void }): React.ReactElement {
  return <NoProjectState onClose={onClose} />;
}
