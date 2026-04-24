/**
 * AgentChatDrawerSections.tsx — Inner section components for AgentChatDetailsDrawer.
 * Extracted to keep AgentChatDetailsDrawer.tsx under the 300-line ESLint limit.
 */
import React from 'react';

import type { AgentChatLinkedDetailsResult } from '../../types/electron';
import {
  DrawerSection,
  DrawerTextBlock,
  MetadataGrid,
} from './AgentChatDetailsSummary';
import { buildResultRows } from './agentChatDetailsSupport';

// ── Context section ────────────────────────────────────────────────────────────

function ContextFileItem({
  file,
}: {
  file: { filePath: string; reasons: Array<{ detail: string }> };
}) {
  return (
    <div className="rounded border border-border-semantic px-2.5 py-2 text-xs">
      <div className="truncate text-text-semantic-primary" title={file.filePath}>
        {file.filePath}
      </div>
      <div className="mt-1 truncate text-[11px] text-text-semantic-muted">
        {file.reasons.slice(0, 2).map((r) => r.detail).join(' • ') || 'Selected for context'}
      </div>
    </div>
  );
}

function buildBudgetText(contextPacket: {
  files: unknown[];
  omittedCandidates: unknown[];
  budget: { estimatedTokens: number };
}): string {
  return [
    `${contextPacket.files.length.toLocaleString()} files`,
    contextPacket.omittedCandidates.length > 0
      ? `${contextPacket.omittedCandidates.length.toLocaleString()} omitted`
      : null,
    contextPacket.budget.estimatedTokens
      ? `${contextPacket.budget.estimatedTokens.toLocaleString()} tokens`
      : null,
  ].filter(Boolean).join(' • ');
}

export function ContextSection({
  details,
}: {
  details: AgentChatLinkedDetailsResult;
}): React.ReactElement | null {
  const contextPacket = details.session?.contextPacket;
  if (!contextPacket) return null;
  const budgetText = buildBudgetText(contextPacket);
  return (
    <DrawerSection title="Context">
      <div className="text-xs leading-5 text-text-semantic-muted">{budgetText}</div>
      {contextPacket.files.length > 0 ? (
        <div className="mt-3 space-y-2">
          {contextPacket.files.slice(0, 5).map((file) => (
            <ContextFileItem key={file.filePath} file={file} />
          ))}
        </div>
      ) : null}
    </DrawerSection>
  );
}

// ── Verification section ───────────────────────────────────────────────────────

export function VerificationSection({
  details,
}: {
  details: AgentChatLinkedDetailsResult;
}): React.ReactElement | null {
  const verification =
    details.result?.verificationSummary ?? details.session?.lastVerificationSummary;
  if (!verification) return null;
  return (
    <DrawerSection title="Verification">
      <div className="text-xs text-text-semantic-primary">{`${verification.profile} • ${verification.status}`}</div>
      <div className="mt-2 text-xs leading-5 text-text-semantic-muted">
        {verification.summary || 'No verification summary available.'}
      </div>
      {verification.commandResults.length > 0 ? (
        <div className="mt-3 space-y-2">
          {verification.commandResults.slice(0, 4).map((result) => (
            <div key={result.stepId} className="rounded border border-border-semantic px-2.5 py-2 text-xs">
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

// ── Result section ─────────────────────────────────────────────────────────────

function ResultIssueList({ issues }: { issues: string[] }): React.ReactElement | null {
  if (issues.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      {issues.slice(0, 6).map((issue) => (
        <div key={issue} className="rounded border border-border-semantic px-2.5 py-2 text-xs text-text-semantic-muted">
          {issue}
        </div>
      ))}
    </div>
  );
}

export function ResultSection({
  details,
}: {
  details: AgentChatLinkedDetailsResult;
}): React.ReactElement | null {
  const result = details.result ?? details.session?.latestResult;
  if (!result) return null;
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
