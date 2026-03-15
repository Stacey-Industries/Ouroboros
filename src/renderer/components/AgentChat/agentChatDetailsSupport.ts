import type {
  AgentChatLinkedDetailsResult,
  AgentChatOrchestrationLink,
  AgentChatThreadRecord,
  ContextPacket,
  NextSuggestedAction,
  TaskResult,
  TaskSessionRecord,
  VerificationSummary,
} from '../../types/electron';

export interface SummaryPillData {
  label: string;
  value: string;
}

export interface AgentChatSummaryData {
  changedFiles?: number;
  contextFiles?: number;
  contextOmitted?: number;
  contextTokens?: number;
  issues: number;
  nextAction: string | null;
  verificationLabel: string | null;
  verificationSummary: string | null;
}

function getSession(details: AgentChatLinkedDetailsResult | null): TaskSessionRecord | null {
  return details?.session ?? null;
}

function getResult(
  details: AgentChatLinkedDetailsResult | null,
  session: TaskSessionRecord | null,
): TaskResult | null {
  return details?.result ?? session?.latestResult ?? null;
}

function getVerification(
  session: TaskSessionRecord | null,
  result: TaskResult | null,
): VerificationSummary | null {
  return result?.verificationSummary ?? session?.lastVerificationSummary ?? null;
}

function getContextPacket(session: TaskSessionRecord | null): ContextPacket | null {
  return session?.contextPacket ?? null;
}

function getIssues(session: TaskSessionRecord | null, result: TaskResult | null): string[] {
  return result?.unresolvedIssues ?? session?.unresolvedIssues ?? [];
}

export function formatActionLabel(action: NextSuggestedAction | string | undefined): string | null {
  if (!action) {
    return null;
  }

  switch (action) {
    case 'review_changes':
      return 'Review changes';
    case 'rerun_verification':
      return 'Rerun verification';
    case 'resume_provider':
      return 'Resume provider';
    case 'adjust_context':
      return 'Adjust context';
    case 'complete_task':
      return 'Complete task';
    case 'retry_task':
      return 'Retry task';
    default:
      return action.replace(/_/g, ' ');
  }
}

export function formatDateTime(timestamp: number | undefined): string | null {
  if (!timestamp) {
    return null;
  }

  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function shortenId(value: string | undefined): string {
  if (!value) {
    return '—';
  }

  return value.length > 14 ? `${value.slice(0, 12)}…` : value;
}

export function getLatestLink(thread: AgentChatThreadRecord): AgentChatOrchestrationLink | undefined {
  if (thread.latestOrchestration) {
    return thread.latestOrchestration;
  }

  return [...thread.messages].reverse().find((message) => message.orchestration)?.orchestration;
}

export function getStatusDescription(thread: AgentChatThreadRecord): string {
  switch (thread.status) {
    case 'submitting':
      return 'Gathering context and handing the request off to the provider.';
    case 'running':
      return 'The agent is actively working through edits and provider steps.';
    case 'verifying':
      return 'Verification is running against the latest task result.';
    case 'needs_review':
      return 'The task completed with review needed before you treat it as done.';
    case 'complete':
      return 'The linked task finished successfully.';
    case 'failed':
      return 'The linked task failed and may need a retry or context adjustment.';
    case 'cancelled':
      return 'The linked task was cancelled before completion.';
    default:
      return 'Send a message to launch an orchestration-backed task.';
  }
}

export function getVerificationLabel(summary: VerificationSummary | null): string | null {
  if (!summary) {
    return null;
  }

  return `${summary.profile} • ${summary.status}`;
}

function getSummaryChangedFiles(result: TaskResult | null): number | undefined {
  return result?.diffSummary?.totalFiles;
}

function getSummaryContextFiles(contextPacket: ContextPacket | null): number | undefined {
  return contextPacket?.files.length;
}

function getSummaryContextOmitted(contextPacket: ContextPacket | null): number | undefined {
  return contextPacket?.omittedCandidates.length;
}

function getSummaryContextTokens(contextPacket: ContextPacket | null): number | undefined {
  return contextPacket?.budget.estimatedTokens;
}

function getSummaryNextAction(session: TaskSessionRecord | null, result: TaskResult | null): string | null {
  return formatActionLabel(result?.nextSuggestedAction ?? session?.nextSuggestedAction);
}

function getSummaryVerificationSummary(verification: VerificationSummary | null): string | null {
  return verification?.summary?.trim() || null;
}

export function buildSummaryData(details: AgentChatLinkedDetailsResult | null): AgentChatSummaryData {
  const session = getSession(details);
  const result = getResult(details, session);
  const verification = getVerification(session, result);
  const contextPacket = getContextPacket(session);
  const issues = getIssues(session, result);

  return {
    changedFiles: getSummaryChangedFiles(result),
    contextFiles: getSummaryContextFiles(contextPacket),
    contextOmitted: getSummaryContextOmitted(contextPacket),
    contextTokens: getSummaryContextTokens(contextPacket),
    issues: issues.length,
    nextAction: getSummaryNextAction(session, result),
    verificationLabel: getVerificationLabel(verification),
    verificationSummary: getSummaryVerificationSummary(verification),
  };
}

export function formatContextValue(summary: AgentChatSummaryData, formatCount: (value: number) => string): string {
  const segments = [`${formatCount(summary.contextFiles ?? 0)} files`];
  if (summary.contextOmitted) {
    segments.push(`${formatCount(summary.contextOmitted)} omitted`);
  }
  if (summary.contextTokens) {
    segments.push(`${formatCount(summary.contextTokens)} tokens`);
  }
  return segments.join(' • ');
}

export function buildSummaryPills(args: {
  formatCount: (value: number) => string;
  hasDetails: boolean;
  isLoading: boolean;
  summary: AgentChatSummaryData;
}): SummaryPillData[] {
  const { formatCount, hasDetails, isLoading, summary } = args;
  const pills: SummaryPillData[] = [];

  if (summary.contextFiles != null) {
    pills.push({ label: 'Context', value: formatContextValue(summary, formatCount) });
  }
  if (summary.verificationLabel) {
    pills.push({ label: 'Verification', value: summary.verificationLabel });
  }
  if (summary.changedFiles != null) {
    pills.push({ label: 'Changes', value: `${formatCount(summary.changedFiles)} files touched` });
  }
  if (summary.issues > 0) {
    pills.push({ label: 'Issues', value: `${formatCount(summary.issues)} unresolved` });
  }
  if (summary.nextAction) {
    pills.push({ label: 'Next', value: summary.nextAction });
  }
  if (isLoading && !hasDetails) {
    pills.push({ label: 'Linked task', value: 'Loading latest details…' });
  }

  return pills;
}

export function buildResultRows(result: TaskResult): Array<{ label: string; value: string | null }> {
  return [
    { label: 'Status', value: result.status },
    { label: 'Next', value: formatActionLabel(result.nextSuggestedAction) },
    { label: 'Files', value: result.diffSummary ? `${result.diffSummary.totalFiles.toLocaleString()} changed` : null },
    { label: 'Issues', value: result.unresolvedIssues.length > 0 ? `${result.unresolvedIssues.length.toLocaleString()} unresolved` : null },
  ];
}

function getTaskId(
  activeLink: AgentChatOrchestrationLink | undefined,
  result: TaskResult | null,
  session: TaskSessionRecord | null,
): string {
  return shortenId(session?.taskId ?? result?.taskId ?? activeLink?.taskId);
}

function getSessionId(
  activeLink: AgentChatOrchestrationLink | undefined,
  session: TaskSessionRecord | null,
): string {
  return shortenId(session?.id ?? activeLink?.sessionId);
}

export function buildSessionRows(args: {
  activeLink: AgentChatOrchestrationLink | undefined;
  details: AgentChatLinkedDetailsResult;
}): Array<{ label: string; value: string | null }> {
  const session = getSession(args.details);
  const result = getResult(args.details, session);

  return [
    { label: 'Session', value: getSessionId(args.activeLink, session) },
    { label: 'Task', value: getTaskId(args.activeLink, result, session) },
    { label: 'Provider', value: session?.request.provider ?? null },
    { label: 'Mode', value: session?.request.mode ?? null },
    { label: 'Verification', value: session?.request.verificationProfile ?? null },
    { label: 'Updated', value: formatDateTime(session?.updatedAt) },
  ];
}
