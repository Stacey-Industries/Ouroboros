/**
 * typesContext.ts — Re-exports context packet types from shared.
 *
 * Cross-boundary types (used by renderer/preload) now live in
 * src/shared/types/orchestration.ts. This file re-exports them so existing
 * main-process imports (`from './typesContext'`) continue to work.
 */
export type {
  ContextBudgetSummary,
  ContextPacket,
  ContextPacketTaskMetadata,
  ContextSelectionReason,
  ContextSnippet,
  ContextSnippetRange,
  ContextTruncationNote,
  DirtyBufferSnapshot,
  EditorSelectionRange,
  LiveIdeState,
  ModuleContextSummary,
  OmittedContextCandidate,
  RankedContextFile,
  RepoMapSummary,
} from '@shared/types/orchestration';
