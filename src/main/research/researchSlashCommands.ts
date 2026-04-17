/**
 * researchSlashCommands.ts — Handlers for /research slash commands.
 *
 * Wave 30 Phase C. Wired into the chat orchestration bridge's slash-command
 * dispatcher (chatOrchestrationBridgeSlashCommands.ts).
 *
 * Supported subcommands:
 *   /research off        — disable auto-research for this session
 *   /research on         — enable conservative auto-research (default)
 *   /research aggressive — enable aggressive auto-research
 *   /research status     — report current mode + enhanced-library count
 */

import type { ResearchMode } from './researchSessionState';
import {
  getEnhancedLibraries,
  getResearchMode,
  setResearchMode,
} from './researchSessionState';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SlashCommandResult =
  | { handled: true; message: string }
  | { handled: false };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function modeLabel(mode: ResearchMode): string {
  if (mode === 'off') return 'off';
  if (mode === 'aggressive') return 'aggressive';
  return 'conservative';
}

function buildStatusMessage(sessionId: string): string {
  const mode = getResearchMode(sessionId);
  const libCount = getEnhancedLibraries(sessionId).size;
  const libNote = libCount > 0 ? ` (${libCount} enhanced librar${libCount === 1 ? 'y' : 'ies'})` : '';
  return `Research mode: **${modeLabel(mode)}**${libNote}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Handle a `/research <subcommand>` slash command for the given session.
 *
 * Returns `{ handled: true, message }` when the subcommand is recognised,
 * or `{ handled: false }` to let the outer dispatcher try other handlers.
 */
export function handleResearchSlashCommand(
  sessionId: string,
  subcommand: string,
): SlashCommandResult {
  const sub = subcommand.trim().toLowerCase();

  if (sub === 'off') {
    setResearchMode(sessionId, 'off');
    return { handled: true, message: 'Research auto-firing **disabled** for this session.' };
  }

  if (sub === 'on') {
    setResearchMode(sessionId, 'conservative');
    return { handled: true, message: 'Research auto-firing enabled (**conservative** mode).' };
  }

  if (sub === 'aggressive') {
    setResearchMode(sessionId, 'aggressive');
    return { handled: true, message: 'Research auto-firing enabled (**aggressive** mode).' };
  }

  if (sub === 'status') {
    return { handled: true, message: buildStatusMessage(sessionId) };
  }

  return { handled: false };
}
