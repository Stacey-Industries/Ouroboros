import React, { useEffect } from 'react';

import type {
  AgentChatLinkedDetailsResult,
  AgentChatOrchestrationLink,
} from '../../types/electron';
import { buildResultRows, buildSessionRows, shortenId } from './agentChatDetailsSupport';
import { SkillHistorySection } from './SkillHistorySection';

export interface AgentChatDetailsDrawerProps {
  activeLink: AgentChatOrchestrationLink | undefined;
  details: AgentChatLinkedDetailsResult | null;
  error: string | null;
  isLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpenOrchestration: () => void;
  /** Skill execution records for the current session (sourced from agent events or persisted messages). */
  skillExecutions?: import('@shared/types/ruleActivity').SkillExecutionRecord[];
}

function DrawerSection(props: { children: React.ReactNode; title: string }): React.ReactElement {
  return (
    <section className="rounded border border-border-semantic bg-surface-base px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-semantic-muted">
        {props.title}
      </div>
      <div className="mt-2">{props.children}</div>
    </section>
  );
}

function MetadataGrid(props: {
  rows: Array<{ label: string; value: string | null }>;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
      {props.rows
        .filter((row) => row.value)
        .map((row) => (
          <div key={row.label} className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-text-semantic-muted">
              {row.label}
            </div>
            <div
              className="mt-1 truncate text-text-semantic-primary"
              title={row.value ?? undefined}
            >
              {row.value}
            </div>
          </div>
        ))}
    </div>
  );
}

function DrawerTextBlock({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="mt-3 text-xs leading-5 text-text-semantic-muted">{children}</div>;
}

function LoadingState(): React.ReactElement {
  return <div className="text-xs text-text-semantic-muted">Loading linked task details…</div>;
}

function ErrorState({ error }: { error: string }): React.ReactElement {
  return (
    <div className="rounded border border-border-semantic bg-status-error-subtle px-3 py-3 text-xs leading-5 text-status-error">
      {error}
    </div>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="text-xs text-text-semantic-muted">
      No linked task details are available for this message yet.
    </div>
  );
}

function ContextSection({
  details,
}: {
  details: AgentChatLinkedDetailsResult;
}): React.ReactElement | null {
  const contextPacket = details.session?.contextPacket;
  if (!contextPacket) {
    return null;
  }

  const budgetText = [
    `${contextPacket.files.length.toLocaleString()} files`,
    contextPacket.omittedCandidates.length > 0
      ? `${contextPacket.omittedCandidates.length.toLocaleString()} omitted`
      : null,
    contextPacket.budget.estimatedTokens
      ? `${contextPacket.budget.estimatedTokens.toLocaleString()} tokens`
      : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <DrawerSection title="Context">
      <div className="text-xs leading-5 text-text-semantic-muted">{budgetText}</div>
      {contextPacket.files.length > 0 ? (
        <div className="mt-3 space-y-2">
          {contextPacket.files.slice(0, 5).map((file) => (
            <div
              key={file.filePath}
              className="rounded border border-border-semantic px-2.5 py-2 text-xs"
            >
              <div className="truncate text-text-semantic-primary" title={file.filePath}>
                {file.filePath}
              </div>
              <div className="mt-1 truncate text-[11px] text-text-semantic-muted">
                {file.reasons
                  .slice(0, 2)
                  .map((reason) => reason.detail)
                  .join(' • ') || 'Selected for context'}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </DrawerSection>
  );
}

function VerificationSection({
  details,
}: {
  details: AgentChatLinkedDetailsResult;
}): React.ReactElement | null {
  const verification =
    details.result?.verificationSummary ?? details.session?.lastVerificationSummary;
  if (!verification) {
    return null;
  }

  return (
    <DrawerSection title="Verification">
      <div className="text-xs text-text-semantic-primary">{`${verification.profile} • ${verification.status}`}</div>
      <div className="mt-2 text-xs leading-5 text-text-semantic-muted">
        {verification.summary || 'No verification summary available.'}
      </div>
      {verification.commandResults.length > 0 ? (
        <div className="mt-3 space-y-2">
          {verification.commandResults.slice(0, 4).map((result) => (
            <div
              key={result.stepId}
              className="rounded border border-border-semantic px-2.5 py-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2 text-text-semantic-primary">
                <span className="truncate">{result.stepId}</span>
                <span className="text-text-semantic-muted">{result.status}</span>
              </div>
              {result.stderr?.trim() ? (
                <div className="mt-1 text-[11px] text-status-error">{result.stderr.trim()}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </DrawerSection>
  );
}

function ResultIssueList({ issues }: { issues: string[] }): React.ReactElement | null {
  if (issues.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      {issues.slice(0, 6).map((issue) => (
        <div
          key={issue}
          className="rounded border border-border-semantic px-2.5 py-2 text-xs text-text-semantic-muted"
        >
          {issue}
        </div>
      ))}
    </div>
  );
}

function ResultSection({
  details,
}: {
  details: AgentChatLinkedDetailsResult;
}): React.ReactElement | null {
  const result = details.result ?? details.session?.latestResult;
  if (!result) {
    return null;
  }

  return (
    <DrawerSection title="Result">
      <MetadataGrid rows={buildResultRows(result)} />
      {result.message?.trim() ? <DrawerTextBlock>{result.message.trim()}</DrawerTextBlock> : null}
      {result.diffSummary?.summary ? (
        <DrawerTextBlock>{result.diffSummary.summary}</DrawerTextBlock>
      ) : null}
      <ResultIssueList issues={result.unresolvedIssues} />
    </DrawerSection>
  );
}

function SessionSection(props: {
  activeLink: AgentChatOrchestrationLink | undefined;
  details: AgentChatLinkedDetailsResult;
}): React.ReactElement {
  return (
    <DrawerSection title="Linked task">
      <MetadataGrid rows={buildSessionRows(props)} />
    </DrawerSection>
  );
}

function DrawerBody(props: {
  activeLink: AgentChatOrchestrationLink | undefined;
  details: AgentChatLinkedDetailsResult | null;
  error: string | null;
  isLoading: boolean;
  skillExecutions?: import('@shared/types/ruleActivity').SkillExecutionRecord[];
}): React.ReactElement {
  if (props.isLoading && !props.details) {
    return <LoadingState />;
  }

  if (props.error) {
    return <ErrorState error={props.error} />;
  }

  if (!props.details) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-3">
      <SessionSection activeLink={props.activeLink} details={props.details} />
      <ContextSection details={props.details} />
      <SkillHistorySection skillExecutions={props.skillExecutions ?? []} />
      <VerificationSection details={props.details} />
      <ResultSection details={props.details} />
    </div>
  );
}

function useEscapeToClose(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);
}

function DrawerHeader({
  onClose,
}: Pick<AgentChatDetailsDrawerProps, 'onClose'>): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-semantic px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text-semantic-primary">Task details</div>
        <div className="mt-1 text-xs text-text-semantic-muted">
          Inspect the linked orchestration task without leaving chat.
        </div>
      </div>
      <button
        onClick={onClose}
        className="rounded border border-border-semantic px-2 py-1 text-[11px] text-text-semantic-muted transition-colors duration-100 hover:border-interactive-accent hover:text-text-semantic-primary"
      >
        Close
      </button>
    </div>
  );
}

function DrawerToolbar(
  props: Pick<AgentChatDetailsDrawerProps, 'activeLink' | 'onOpenOrchestration'>,
): React.ReactElement {
  const label =
    props.activeLink?.sessionId || props.activeLink?.taskId
      ? `Linked to ${shortenId(props.activeLink?.sessionId ?? props.activeLink?.taskId)}`
      : 'No linked session yet';

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-semantic px-4 py-2">
      <div className="truncate text-[11px] text-text-semantic-muted">{label}</div>
      <button
        onClick={props.onOpenOrchestration}
        className="rounded border border-border-semantic px-2 py-1 text-[11px] text-interactive-accent transition-colors duration-100 hover:opacity-80"
      >
        Open orchestration
      </button>
    </div>
  );
}

function DrawerPanel(props: AgentChatDetailsDrawerProps): React.ReactElement {
  return (
    <div
      className={`flex h-full w-full max-w-[360px] flex-col border-l border-border-semantic bg-surface-overlay shadow-2xl backdrop-blur-xl transition-transform duration-200 ${props.isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <DrawerHeader onClose={props.onClose} />
      <DrawerToolbar
        activeLink={props.activeLink}
        onOpenOrchestration={props.onOpenOrchestration}
      />
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <DrawerBody
          activeLink={props.activeLink}
          details={props.details}
          error={props.error}
          isLoading={props.isLoading}
          skillExecutions={props.skillExecutions}
        />
      </div>
    </div>
  );
}

function DrawerBackdrop(
  props: Pick<AgentChatDetailsDrawerProps, 'isOpen' | 'onClose'>,
): React.ReactElement {
  return (
    <div
      className={`flex-1 bg-[rgba(0,0,0,0.18)] transition-opacity duration-150 ${props.isOpen ? 'opacity-100' : 'opacity-0'}`}
      onClick={props.onClose}
    />
  );
}

export function AgentChatDetailsDrawer({
  activeLink,
  details,
  error,
  isLoading,
  isOpen,
  onClose,
  onOpenOrchestration,
  skillExecutions,
}: AgentChatDetailsDrawerProps): React.ReactElement {
  useEscapeToClose(isOpen, onClose);

  return (
    <div
      className={`absolute inset-0 z-20 flex ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
    >
      <DrawerBackdrop isOpen={isOpen} onClose={onClose} />
      <DrawerPanel
        activeLink={activeLink}
        details={details}
        error={error}
        isLoading={isLoading}
        isOpen={isOpen}
        onClose={onClose}
        onOpenOrchestration={onOpenOrchestration}
        skillExecutions={skillExecutions}
      />
    </div>
  );
}
