/**
 * types.ts — Agent chat type definitions.
 *
 * All cross-boundary types (consumed by renderer/preload) now live in
 * src/shared/types/agentChat.ts. This file re-exports everything from there
 * so existing main-process imports (`from './types'` or `from '../agentChat/types'`)
 * continue to work without modification.
 */
export type * from '@shared/types/agentChat';
