import React, { useEffect } from 'react';

import type {
  AgentChatLinkedDetailsResult,
  AgentChatOrchestrationLink,
} from '../../types/electron';
import {
  DrawerSection,
  EmptyState,
  ErrorState,
  LoadingState,
  MetadataGrid,
} from './AgentChatDetailsSummary';
import { buildSessionRows, shortenId } from './agentChatDetailsSupport';
import {
  ContextSection,
  ResultSection,
  VerificationSection,
} from './AgentChatDrawerSections';
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
