/**
 * walkingSkeletonStub.ts — Phase 1 hardcoded canonical flows.
 *
 * ONE hardcoded flow: "When I send a chat message".
 * Real file paths + line numbers derived from the actual codebase — NOT fabricated.
 *
 * Phase 2: getWalkingSkeletonTrace() removed — traceEngine.ts owns all tracing now.
 * WALKING_SKELETON_FLOWS stays until Phase 5 ships the AI gallery.
 */

import type { CanonicalFlow } from '../../shared/types/flowTracer';

// ── Hardcoded entry point ─────────────────────────────────────────────────────
// Real location of the sendMessage IPC handler registration in the codebase.
// Verified via grep: src/main/ipc-handlers/agentChat.ts line 163.

const CHAT_SEND_ENTRY_POINT = {
  symbol: 'registerMessageHandlers',
  file: 'src/main/ipc-handlers/agentChat.ts',
  line: 163,
};

// ── Hardcoded canonical flows (Phase 1: one tile) ────────────────────────────

export const WALKING_SKELETON_FLOWS: CanonicalFlow[] = [
  {
    title: 'When I send a chat message',
    entryPoint: CHAT_SEND_ENTRY_POINT,
    estimatedSteps: 6,
    layers: ['renderer', 'preload', 'main', 'cli'],
  },
];
