/**
 * types.ts — Re-export barrel for orchestration types.
 *
 * Types are split across three source files to stay within the 300-line limit:
 *   - typesDomain.ts   — primitive types, enums, TaskRequest, RepoFacts
 *   - typesContext.ts  — LiveIdeState, ContextPacket, RankedContextFile
 *   - typesProvider.ts — ProviderCapabilities, VerificationSummary, TaskSessionRecord, OrchestrationAPI
 *
 * Import from this file as before — all types remain available here.
 */
export type * from './typesContext'
export type * from './typesDomain'
export type * from './typesProvider'
