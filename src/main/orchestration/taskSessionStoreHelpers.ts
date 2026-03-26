/**
 * taskSessionStoreHelpers.ts — Pure helper functions for taskSessionStore.
 *
 * Extracted to keep taskSessionStore.ts under 300 lines.
 * Contains normalizeSessionRecord, buildResumedStatus, buildOrchestrationStateFromSession,
 * applyPatch, and supporting utilities.
 */
import { createHash, randomUUID } from 'crypto'

import type {
  NextSuggestedAction,
  OrchestrationState,
  OrchestrationStatus,
  TaskAttemptRecord,
  TaskRequest,
  TaskResult,
  TaskSessionPatch,
  TaskSessionRecord,
} from './types'

// ─── String utilities ─────────────────────────────────────────────────────────

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(isNonEmptyString)
}

export function hashSessionId(sessionId: string): string {
  return createHash('sha1').update(sessionId).digest('hex')
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export function isActiveAttemptStatus(status: OrchestrationStatus): boolean {
  return status === 'idle'
    || status === 'selecting_context'
    || status === 'awaiting_provider'
    || status === 'applying'
    || status === 'verifying'
}

function shouldStampCompletedAt(status: OrchestrationStatus): boolean {
  return !isActiveAttemptStatus(status)
}

// ─── Normalization ────────────────────────────────────────────────────────────

export function normalizeTaskResult(result: TaskResult): TaskResult {
  return { ...result, unresolvedIssues: normalizeStringArray(result.unresolvedIssues) }
}

export function normalizeAttempt(attempt: TaskAttemptRecord, now: () => number): TaskAttemptRecord {
  return {
    ...attempt,
    unresolvedIssues: normalizeStringArray(attempt.unresolvedIssues),
    completedAt: attempt.completedAt ?? (shouldStampCompletedAt(attempt.status) ? now() : undefined),
  }
}

export function normalizeRequest(
  request: TaskRequest,
  taskId: string,
  sessionId: string,
  requestedAt: number,
): TaskRequest {
  const selection = request.contextSelection
  return {
    ...request,
    taskId,
    sessionId,
    workspaceRoots: normalizeStringArray(request.workspaceRoots),
    contextSelection: selection
      ? {
        userSelectedFiles: normalizeStringArray(selection.userSelectedFiles),
        pinnedFiles: normalizeStringArray(selection.pinnedFiles),
        includedFiles: normalizeStringArray(selection.includedFiles),
        excludedFiles: normalizeStringArray(selection.excludedFiles),
      }
      : undefined,
    metadata: request.metadata
      ? { ...request.metadata, requestedAt: request.metadata.requestedAt ?? requestedAt }
      : undefined,
  }
}

export function sortAttempts(attempts: TaskAttemptRecord[]): TaskAttemptRecord[] {
  return [...attempts].sort((left, right) => {
    if (left.startedAt !== right.startedAt) return left.startedAt - right.startedAt
    return left.id.localeCompare(right.id)
  })
}

export function upsertAttempt(
  attempts: TaskAttemptRecord[],
  attempt: TaskAttemptRecord,
  now: () => number,
): TaskAttemptRecord[] {
  const normalizedAttempt = normalizeAttempt(attempt, now)
  const existingIndex = attempts.findIndex((entry) => entry.id === normalizedAttempt.id)
  if (existingIndex === -1) return sortAttempts([...attempts, normalizedAttempt])
  const nextAttempts = [...attempts]
  // eslint-disable-next-line security/detect-object-injection -- existingIndex from findIndex; safe numeric array access
  nextAttempts[existingIndex] = normalizeAttempt(
    // eslint-disable-next-line security/detect-object-injection -- same guard as above
    { ...nextAttempts[existingIndex], ...normalizedAttempt, unresolvedIssues: normalizedAttempt.unresolvedIssues },
    now,
  )
  return sortAttempts(nextAttempts)
}

export function applyResultToAttempts(
  attempts: TaskAttemptRecord[],
  result: TaskResult,
  now: () => number,
): TaskAttemptRecord[] {
  if (!isNonEmptyString(result.attemptId)) return attempts
  const nextAttempt: TaskAttemptRecord = {
    id: result.attemptId,
    startedAt: now(),
    completedAt: shouldStampCompletedAt(result.status) ? now() : undefined,
    status: result.status,
    contextPacketId: result.contextPacketId,
    providerArtifact: result.providerArtifact,
    verificationSummary: result.verificationSummary,
    diffSummary: result.diffSummary,
    unresolvedIssues: normalizeStringArray(result.unresolvedIssues),
    nextSuggestedAction: result.nextSuggestedAction,
    resultMessage: result.message,
  }
  const existingIndex = attempts.findIndex((entry) => entry.id === result.attemptId)
  if (existingIndex === -1) return sortAttempts([...attempts, nextAttempt])
  // eslint-disable-next-line security/detect-object-injection -- existingIndex from findIndex; safe numeric array access
  const existingAttempt = attempts[existingIndex]
  const mergedAttempt: TaskAttemptRecord = {
    ...existingAttempt,
    status: result.status,
    contextPacketId: result.contextPacketId ?? existingAttempt.contextPacketId,
    providerArtifact: result.providerArtifact ?? existingAttempt.providerArtifact,
    verificationSummary: result.verificationSummary ?? existingAttempt.verificationSummary,
    diffSummary: result.diffSummary ?? existingAttempt.diffSummary,
    unresolvedIssues: normalizeStringArray(result.unresolvedIssues),
    nextSuggestedAction: result.nextSuggestedAction,
    resultMessage: result.message,
    completedAt: existingAttempt.completedAt ?? (shouldStampCompletedAt(result.status) ? now() : undefined),
  }
  const nextAttempts = [...attempts]
  // eslint-disable-next-line security/detect-object-injection -- existingIndex from findIndex; safe numeric array access
  nextAttempts[existingIndex] = normalizeAttempt(mergedAttempt, now)
  return sortAttempts(nextAttempts)
}

export function buildAttemptTimeline(
  attempts: TaskAttemptRecord[],
  latestResult: TaskResult | undefined,
  now: () => number,
): TaskAttemptRecord[] {
  const normalizedAttempts = sortAttempts(attempts.map((attempt) => normalizeAttempt(attempt, now)))
  return latestResult ? applyResultToAttempts(normalizedAttempts, latestResult, now) : normalizedAttempts
}

interface NormalizedSessionScalars {
  createdAt: number
  updatedAt: number
  taskId: string
  sessionId: string
  latestResult: TaskResult | undefined
}

function normalizeSessionScalars(session: TaskSessionRecord, now: () => number): NormalizedSessionScalars {
  const createdAt = Number.isFinite(session.createdAt) ? session.createdAt : now()
  return {
    createdAt,
    updatedAt: Number.isFinite(session.updatedAt) ? session.updatedAt : createdAt,
    taskId: isNonEmptyString(session.taskId) ? session.taskId : randomUUID(),
    sessionId: isNonEmptyString(session.id) ? session.id : randomUUID(),
    latestResult: session.latestResult ? normalizeTaskResult(session.latestResult) : undefined,
  }
}

export function normalizeSessionRecord(session: TaskSessionRecord, now: () => number): TaskSessionRecord {
  const { createdAt, updatedAt, taskId, sessionId, latestResult } = normalizeSessionScalars(session, now)
  return {
    version: 1,
    id: sessionId,
    taskId,
    workspaceRoots: normalizeStringArray(session.workspaceRoots),
    createdAt,
    updatedAt,
    request: normalizeRequest(session.request, taskId, sessionId, createdAt),
    status: session.status,
    contextPacket: session.contextPacket,
    providerSession: session.providerSession,
    lastVerificationSummary: session.lastVerificationSummary,
    latestResult,
    attempts: buildAttemptTimeline(session.attempts ?? [], latestResult, now),
    unresolvedIssues: normalizeStringArray(session.unresolvedIssues ?? latestResult?.unresolvedIssues),
    nextSuggestedAction: session.nextSuggestedAction ?? latestResult?.nextSuggestedAction,
  }
}

// ─── Patch logic ──────────────────────────────────────────────────────────────

function buildPatchedAttempts(
  session: TaskSessionRecord,
  patch: TaskSessionPatch,
  latestResult: TaskResult | undefined,
  now: () => number,
): TaskAttemptRecord[] {
  const withAppended = patch.appendAttempt
    ? upsertAttempt(session.attempts, patch.appendAttempt, now)
    : [...session.attempts]
  return latestResult ? applyResultToAttempts(withAppended, latestResult, now) : withAppended
}

interface PatchContext {
  session: TaskSessionRecord
  patch: TaskSessionPatch
  latestResult: TaskResult | undefined
  patchedAttempts: TaskAttemptRecord[]
}

function resolvePatchedStatus(ctx: PatchContext): OrchestrationStatus {
  return ctx.patch.status ?? ctx.latestResult?.status ?? ctx.session.status
}

function resolvePatchedProviderSession(ctx: PatchContext): TaskSessionRecord['providerSession'] {
  return ctx.patch.providerSession ?? ctx.latestResult?.providerArtifact?.session ?? ctx.session.providerSession
}

function resolvePatchedVerificationSummary(ctx: PatchContext): TaskSessionRecord['lastVerificationSummary'] {
  return ctx.patch.lastVerificationSummary ?? ctx.latestResult?.verificationSummary ?? ctx.session.lastVerificationSummary
}

function resolvePatchedUnresolvedIssues(ctx: PatchContext): string[] {
  return normalizeStringArray(ctx.patch.unresolvedIssues ?? ctx.latestResult?.unresolvedIssues ?? ctx.session.unresolvedIssues)
}

function resolvePatchedNextSuggestedAction(ctx: PatchContext): NextSuggestedAction | undefined {
  return ctx.patch.nextSuggestedAction ?? ctx.latestResult?.nextSuggestedAction ?? ctx.session.nextSuggestedAction
}

function buildPatchedFields(ctx: PatchContext, now: () => number): TaskSessionRecord {
  return {
    ...ctx.session,
    updatedAt: now(),
    status: resolvePatchedStatus(ctx),
    contextPacket: ctx.patch.contextPacket ?? ctx.session.contextPacket,
    providerSession: resolvePatchedProviderSession(ctx),
    lastVerificationSummary: resolvePatchedVerificationSummary(ctx),
    latestResult: ctx.latestResult ?? ctx.session.latestResult,
    attempts: ctx.patchedAttempts,
    unresolvedIssues: resolvePatchedUnresolvedIssues(ctx),
    nextSuggestedAction: resolvePatchedNextSuggestedAction(ctx),
  }
}

export function applyPatch(
  session: TaskSessionRecord,
  patch: TaskSessionPatch,
  now: () => number,
): TaskSessionRecord {
  const latestResult = patch.latestResult ? normalizeTaskResult(patch.latestResult) : undefined
  const patchedAttempts = buildPatchedAttempts(session, patch, latestResult, now)
  return normalizeSessionRecord(buildPatchedFields({ session, patch, latestResult, patchedAttempts }, now), now)
}

// ─── Status derivation ────────────────────────────────────────────────────────

function resumedStatusFromSuggestion(action: NextSuggestedAction | undefined): OrchestrationStatus | null {
  if (action === 'resume_provider') return 'awaiting_provider'
  if (action === 'review_changes') return 'needs_review'
  if (action === 'rerun_verification') return 'verifying'
  if (action === 'adjust_context' || action === 'retry_task') return 'selecting_context'
  return null
}

function resumedStatusFromNonPaused(session: TaskSessionRecord): OrchestrationStatus | null {
  if (session.status === 'failed' && session.nextSuggestedAction === 'retry_task') return 'selecting_context'
  if (session.status === 'needs_review') return 'needs_review'
  if (session.status !== 'complete' && session.status !== 'cancelled') return session.status
  return null
}

function resumedStatusFallback(session: TaskSessionRecord): OrchestrationStatus {
  const latestAttempt = session.attempts[session.attempts.length - 1]
  if (latestAttempt && isActiveAttemptStatus(latestAttempt.status)) return latestAttempt.status
  const verificationStatus = session.lastVerificationSummary?.status
  if (verificationStatus === 'pending' || verificationStatus === 'running') return 'verifying'
  if (session.providerSession || session.contextPacket) return 'awaiting_provider'
  return 'selecting_context'
}

export function buildResumedStatus(session: TaskSessionRecord): OrchestrationStatus {
  if (session.status !== 'paused') {
    const fromNonPaused = resumedStatusFromNonPaused(session)
    if (fromNonPaused) return fromNonPaused
  }
  const fromSuggestion = resumedStatusFromSuggestion(session.nextSuggestedAction)
  if (fromSuggestion) return fromSuggestion
  return resumedStatusFallback(session)
}

function resolveContextPacketId(session: TaskSessionRecord, latestAttempt: TaskAttemptRecord | undefined): string | undefined {
  return session.contextPacket?.id ?? latestAttempt?.contextPacketId ?? session.latestResult?.contextPacketId
}

function resolveResultMessage(session: TaskSessionRecord, latestAttempt: TaskAttemptRecord | undefined): string | undefined {
  return session.latestResult?.message ?? latestAttempt?.resultMessage
}

export function buildOrchestrationStateFromSession(session: TaskSessionRecord): OrchestrationState {
  const latestAttempt = session.attempts[session.attempts.length - 1]
  const latestVerification = session.lastVerificationSummary ?? latestAttempt?.verificationSummary
  return {
    status: session.status,
    activeTaskId: session.taskId,
    activeSessionId: session.id,
    activeAttemptId: latestAttempt?.id,
    provider: session.providerSession?.provider ?? session.request.provider,
    verificationProfile: latestVerification?.profile ?? session.request.verificationProfile,
    contextPacketId: resolveContextPacketId(session, latestAttempt),
    message: resolveResultMessage(session, latestAttempt),
    pendingApproval: latestVerification?.requiredApproval,
    updatedAt: session.updatedAt,
  }
}
